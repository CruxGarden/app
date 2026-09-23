import { beforeEach, describe, expect, it, vi } from 'vitest';
import { checkpointFiles, readCheckpointFile } from './checkpoint-files';
import { readSelectedFile } from './file-content';

const { db, artifact } = vi.hoisted(() => ({
  db: {
    get: vi.fn(),
    fileContent: { head: vi.fn(), list: vi.fn(), read: vi.fn() },
  },
  artifact: { findByResource: vi.fn(), downloadBlob: vi.fn() },
}));
vi.mock('./sqlite/client', () => ({ getSqliteClient: () => db }));
vi.mock('./index', () => ({ getServices: () => ({ artifact }) }));

const head = (cruxId: string, root = 'a'.repeat(64)) => ({
  cruxId,
  root,
  revision: 1,
  formatVersion: 1,
});
const entry = {
  id: 'same-logical-file',
  path: 'notes.txt',
  fingerprint: 'c'.repeat(64),
  size: 4,
  mimeType: 'text/plain',
  encoding: 'utf-8',
  mode: 0o640,
  attributes: {},
};

describe('version-bound checkpoint files', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    db.get.mockResolvedValue({ id: 'snapshot' });
    db.fileContent.head.mockImplementation(async (id) => head(id));
    db.fileContent.list.mockImplementation(async ({ cruxId, expected }) => ({
      head: { ...head(cruxId), ...expected },
      entries: [entry],
    }));
  });

  it('distinguishes the same logical file in two owners and reads only the selected version', async () => {
    const first = (await checkpointFiles('snapshot-one'))[0]!;
    db.fileContent.head.mockResolvedValueOnce(head('snapshot-two', 'b'.repeat(64)));
    const second = (await checkpointFiles('snapshot-two'))[0]!;
    expect(first.id).toBe(second.id);
    expect(first.source).not.toEqual(second.source);
    db.fileContent.read.mockImplementation(async ({ cruxId, expected }) => ({
      head: { ...head(cruxId), ...expected },
      entry,
      bytes: new TextEncoder().encode(cruxId === 'snapshot-one' ? 'old\0' : 'new\0'),
    }));
    expect(await (await readCheckpointFile(second)).text()).toBe('new\0');
    expect(await (await readCheckpointFile(first)).text()).toBe('old\0');
    expect(db.fileContent.read).toHaveBeenLastCalledWith({
      cruxId: 'snapshot-one',
      expected: { root: 'a'.repeat(64), revision: 1 },
      path: 'notes.txt',
    });
    expect(artifact.findByResource).not.toHaveBeenCalled();
    expect(artifact.downloadBlob).not.toHaveBeenCalled();
  });

  it('preserves captured references even if a listing or caller changes while a read is pending', async () => {
    const first = (await checkpointFiles('snapshot'))[0]!;
    if (first.source.kind !== 'manifest') throw new Error('Expected manifest file');
    let complete!: (value: unknown) => void;
    db.fileContent.read.mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const reading = readCheckpointFile(first);
    first.source.file.expected.root = 'd'.repeat(64);
    first.source.file.path = 'other.txt';
    expect(db.fileContent.read.mock.calls[0]![0]).toEqual({
      cruxId: 'snapshot',
      expected: { root: 'a'.repeat(64), revision: 1 },
      path: 'notes.txt',
    });
    complete({ head: head('snapshot'), entry, bytes: new Uint8Array([0, 255, 128]) });
    expect(new Uint8Array(await (await reading).arrayBuffer())).toEqual(
      new Uint8Array([0, 255, 128]),
    );
  });

  it.each(['Selected version is stale', 'Content object is corrupt'])(
    'does not hide read failure: %s',
    async (message) => {
      const [file] = await checkpointFiles('snapshot');
      db.fileContent.read.mockRejectedValueOnce(new Error(message));
      await expect(readCheckpointFile(file!)).rejects.toThrow(message);
      expect(artifact.downloadBlob).not.toHaveBeenCalled();
    },
  );

  it('refuses a missing selected file instead of returning empty content', async () => {
    db.fileContent.read.mockResolvedValue(null);
    await expect(
      readSelectedFile({ cruxId: 'snapshot', expected: head('snapshot'), path: 'gone' }),
    ).rejects.toThrow('missing from the selected version');
  });

  it('does not reinterpret an unreadable established head as a record-backed checkpoint', async () => {
    db.fileContent.list.mockRejectedValue(new Error('Missing manifest node'));
    await expect(checkpointFiles('snapshot')).rejects.toThrow('Missing manifest node');
    expect(artifact.findByResource).not.toHaveBeenCalled();
  });

  it('keeps not-yet-adopted Task checkpoints on their existing service', async () => {
    db.fileContent.head.mockResolvedValue(null);
    artifact.findByResource.mockResolvedValue([{ ...entry, meta: { path: 'task.txt' } }]);
    artifact.downloadBlob.mockResolvedValue(new Blob(['Task content']));
    const [file] = await checkpointFiles('task-checkpoint');
    expect(file!.path).toBe('task.txt');
    expect(await (await readCheckpointFile(file!)).text()).toBe('Task content');
    expect(db.fileContent.read).not.toHaveBeenCalled();
  });
});
