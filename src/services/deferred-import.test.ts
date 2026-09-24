import { beforeEach, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({
  values: new Map<string, string>(),
  flush: vi.fn(async () => {}),
}));
vi.mock('./settings', () => ({
  getSetting: (key: string) => fixture.values.get(key) ?? null,
  setSettingDurably: async (key: string, value: string) => {
    await fixture.flush();
    fixture.values.set(key, value);
  },
}));
import {
  queueDeferredImport,
  deliverDeferredImport,
  readDeferredImport,
  retryDeferredImport,
  dismissDeferredImport,
} from './deferred-import';
const owner = 'original-crux';
const queue = () => queueDeferredImport(owner, 'import_document', { path: 'inbox/Letter.docx' });
beforeEach(() => {
  fixture.values.clear();
  fixture.flush.mockReset().mockResolvedValue();
});
it('waits for the captured owner and sends once despite repeated readiness', async () => {
  await queue();
  let finish!: () => void;
  const execute = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  await deliverDeferredImport('other-crux', () => true, execute);
  await deliverDeferredImport(owner, () => false, execute);
  expect(execute).not.toHaveBeenCalled();
  const first = deliverDeferredImport(owner, () => true, execute);
  const second = deliverDeferredImport(owner, () => true, execute);
  expect(second).toBe(first);
  await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
  expect(readDeferredImport(owner)?.state).toBe('dispatched');
  expect(execute).toHaveBeenCalledWith('import_document', { path: 'inbox/Letter.docx' });
  finish();
  await first;
  await deliverDeferredImport(owner, () => true, execute);
  expect(execute).toHaveBeenCalledTimes(1);
  expect(readDeferredImport(owner)?.state).toBe('complete');
});
it('keeps the queued import when Workshop closes during the persistence boundary', async () => {
  await queue();
  let ready = true;
  fixture.flush.mockImplementationOnce(async () => {
    ready = false;
  });
  const execute = vi.fn();
  await deliverDeferredImport(owner, () => ready, execute);
  expect(execute).not.toHaveBeenCalled();
  expect(readDeferredImport(owner)?.state).toBe('queued');
  ready = true;
  await deliverDeferredImport(owner, () => ready, execute);
  expect(execute).toHaveBeenCalledTimes(1);
});
it('does not invoke a tool when the dispatch marker cannot be saved', async () => {
  await queue();
  fixture.flush.mockRejectedValueOnce(new Error('disk full'));
  const execute = vi.fn();
  await deliverDeferredImport(owner, () => true, execute);
  expect(execute).not.toHaveBeenCalled();
  expect(readDeferredImport(owner)).toMatchObject({ state: 'failed', error: 'disk full' });
});
it('requires an explicit retry after an unknown effect; readiness cannot replay it', async () => {
  await queue();
  const execute = vi
    .fn()
    .mockRejectedValueOnce(new Error('confirmation lost'))
    .mockResolvedValue({});
  await deliverDeferredImport(owner, () => true, execute);
  expect(readDeferredImport(owner)).toMatchObject({
    state: 'uncertain',
    error: 'confirmation lost',
  });
  await deliverDeferredImport(owner, () => true, execute);
  expect(execute).toHaveBeenCalledTimes(1);
  await retryDeferredImport(owner);
  await deliverDeferredImport(owner, () => true, execute);
  expect(execute).toHaveBeenCalledTimes(2);
  expect(readDeferredImport(owner)?.state).toBe('complete');
});
it('a failed completion write and a persisted dispatch after restart never replay automatically', async () => {
  await queue();
  const execute = vi.fn(async () => {
    fixture.flush.mockRejectedValueOnce(new Error('completion not durable'));
  });
  await deliverDeferredImport(owner, () => true, execute);
  expect(readDeferredImport(owner)?.state).toBe('uncertain');
  const saved = readDeferredImport(owner)!;
  fixture.values.set(
    `cruxgarden:pending-open:${owner}`,
    JSON.stringify({ ...saved, state: 'dispatched' }),
  );
  await deliverDeferredImport(owner, () => true, execute);
  expect(execute).toHaveBeenCalledTimes(1);
  await dismissDeferredImport(owner);
  await deliverDeferredImport(owner, () => true, execute);
  expect(execute).toHaveBeenCalledTimes(1);
});

it('cannot dispatch queued work while its dismissal is being committed', async () => {
  await queue();
  let finish!: () => void;
  fixture.flush.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const dismissed = dismissDeferredImport(owner);
  const execute = vi.fn();
  await deliverDeferredImport(owner, () => true, execute);
  expect(execute).not.toHaveBeenCalled();
  finish();
  await dismissed;
  await deliverDeferredImport(owner, () => true, execute);
  expect(execute).not.toHaveBeenCalled();
  expect(readDeferredImport(owner)?.state).toBe('dismissed');
});
