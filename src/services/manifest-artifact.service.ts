import type {
  Artifact,
  CreateArtifactInput,
  UploadArtifactInput,
  RegisterArtifactInput,
  UpdateArtifactInput,
} from './types';
import type { ArtifactReference, IArtifactService } from './artifact.service';
import { getSqliteClient } from './sqlite/client';
import { getLocalIdentity } from './sqlite/identity';
import { guessMimeType, hashContent } from './sqlite/helpers';
import { readSelectedFile, finishFileProjection, type SelectedFiles } from './file-content';
import { assertCopyWritable } from './working-copies';
import { serializeIngestion } from './ingestion';

type Entry = SelectedFiles['entries'][number];
type Head = SelectedFiles['head'];
const content = () => {
  const service = getSqliteClient().fileContent;
  if (!service) throw new Error('This connection does not support versioned files.');
  return service;
};
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/** An Artifact is a file-tree projection, never a per-file database record. */
export function manifestArtifact(owner: string, head: Head, entry: Entry): Artifact {
  const attrs = entry.attributes;
  return {
    id: entry.id,
    resourceId: owner,
    resourceType: 'crux',
    type: 'artifact',
    kind: typeof attrs.kind === 'string' ? attrs.kind : 'file',
    authorId: typeof attrs.authorId === 'string' ? attrs.authorId : '',
    homeId: typeof attrs.homeId === 'string' ? attrs.homeId : '',
    created: typeof attrs.created === 'string' ? attrs.created : '',
    updated: typeof attrs.updated === 'string' ? attrs.updated : '',
    meta: { ...object(attrs.meta), path: entry.path, mode: entry.mode },
    filename: entry.path.split('/').pop()!,
    fingerprint: entry.fingerprint,
    encoding: entry.encoding,
    mimeType: entry.mimeType,
    size: entry.size,
    fileReference: {
      cruxId: owner,
      expected: { root: head.root, revision: head.revision },
      path: entry.path,
    },
  };
}

/** The desktop file service is shared by people, embedded tools and agents.
 * It operates on API-owned roots; there is no Artifact-table fallback. */
export class ManifestArtifactService implements IArtifactService {
  private async selected(owner: string): Promise<{ head: Head | null; entries: Entry[] }> {
    const api = content();
    const head = await api.head(owner);
    return head ? api.list({ cruxId: owner, expected: head }) : { head: null, entries: [] };
  }

  private reference(
    value: ArtifactReference,
  ): Artifact & { fileReference: NonNullable<Artifact['fileReference']> } {
    if (
      typeof value === 'string' ||
      !value.fileReference ||
      value.fileReference.cruxId !== value.resourceId
    )
      throw new Error('Select the file in its Crux before reading or changing it.');
    return value as Artifact & { fileReference: NonNullable<Artifact['fileReference']> };
  }

  async findById(value: ArtifactReference): Promise<Artifact> {
    const file = this.reference(value);
    const result = await readSelectedFile(file.fileReference);
    if (result.entry.id !== file.id) throw new Error('The selected file identity changed.');
    return manifestArtifact(file.resourceId, result.head, result.entry);
  }

  async findByResource(resourceType: string, resourceId: string): Promise<Artifact[]> {
    if (resourceType !== 'crux') throw new Error('Files require a Crux content owner.');
    const selected = await this.selected(resourceId);
    return selected.entries.map((entry) => manifestArtifact(resourceId, selected.head!, entry));
  }

  async downloadBlob(value: ArtifactReference): Promise<Blob> {
    const file = this.reference(value);
    const result = await readSelectedFile(file.fileReference);
    if (result.entry.id !== file.id) throw new Error('The selected file identity changed.');
    return new Blob([new Uint8Array(result.bytes)], { type: result.entry.mimeType });
  }

  async readContent(value: ArtifactReference): Promise<string> {
    const file = this.reference(value);
    if (file.encoding === 'binary')
      throw new Error('Cannot read binary content as string — use downloadBlob()');
    return (await this.downloadBlob(file)).text();
  }

  private async writable(owner: string) {
    await assertCopyWritable(owner);
    const row = await getSqliteClient().get<{ kind: string; deleted: string | null }>(
      'SELECT kind, deleted FROM cruxes WHERE id = ?',
      [owner],
    );
    if (row?.kind === 'snapshot' || row?.deleted) throw new Error('This Crux is read-only.');
  }

  /** Another file's save can advance the root without changing this document.
   * Rebase only when this file's identity/content/metadata still match. */
  private unchanged(reference: Artifact, entries: Entry[]): Entry {
    const file = this.reference(reference);
    const entry = entries.find((item) => item.path === file.fileReference.path);
    if (
      !entry ||
      entry.id !== file.id ||
      entry.fingerprint !== file.fingerprint ||
      entry.mode !== Number(file.meta?.mode ?? 0o644) ||
      entry.mimeType !== file.mimeType ||
      entry.encoding !== file.encoding
    )
      throw new Error('This file changed. Reload it before saving.');
    return entry;
  }

  private async put(
    input: CreateArtifactInput | UploadArtifactInput,
    bytes: Uint8Array,
    encoding: string,
  ): Promise<Artifact> {
    // Capture mutable metadata before joining the shared filesystem/ingestion queue.
    const captured = {
      ...input,
      meta: structuredClone(input.meta ?? {}),
      ...(input.expected !== undefined ? { expected: structuredClone(input.expected) } : {}),
    };
    const savedBytes = Uint8Array.from(bytes);
    const execute = async () => {
      if (captured.writeThrough !== false) await this.writable(captured.resourceId);
      const selected = await this.selected(captured.resourceId);
      const path = captured.meta.path;
      if (!path) throw new Error('Use a file path.');
      if (
        captured.expected &&
        (captured.expected.resourceId !== captured.resourceId ||
          captured.expected.fileReference?.path !== path)
      )
        throw new Error(
          'Save the selected file in its owning Crux; use rename to change its path.',
        );
      const current = selected.entries.find((entry) => entry.path === path);
      if (captured.expected === null && current)
        throw new Error('A file appeared at this path. Choose the file again before replacing it.');
      const before = captured.expected
        ? this.unchanged(captured.expected, selected.entries)
        : current;
      // An ordinary create also keeps its first selection across a head-conflict retry.
      if (captured.expected === undefined)
        captured.expected = before
          ? manifestArtifact(captured.resourceId, selected.head!, before)
          : null;
      const identity = await getLocalIdentity();
      const now = new Date().toISOString();
      const entry: Entry = {
        id: before?.id ?? crypto.randomUUID(),
        path,
        fingerprint: await hashContent(savedBytes),
        size: savedBytes.length,
        encoding,
        mimeType: captured.mimeType || before?.mimeType || guessMimeType(path),
        mode: Number(captured.meta.mode ?? before?.mode ?? 0o644),
        attributes: {
          ...before?.attributes,
          authorId: before?.attributes.authorId ?? identity.authorId,
          homeId: before?.attributes.homeId ?? identity.homeId,
          created: before?.attributes.created ?? now,
          updated: now,
          meta: JSON.parse(
            JSON.stringify({ ...object(before?.attributes.meta), ...captured.meta }),
          ),
        },
      };
      const api = content();
      const head =
        captured.writeThrough === false
          ? await api.edit({
              cruxId: captured.resourceId,
              expected: selected.head,
              changes: [{ put: entry, bytes: savedBytes }],
            })
          : await api.write({
              cruxId: captured.resourceId,
              expected: selected.head,
              before: before ?? null,
              ...(captured.retention ? { retention: captured.retention } : {}),
              entry,
              bytes: savedBytes,
            });
      if (captured.writeThrough !== false)
        await finishFileProjection(captured.resourceId, [path], api.finishProjection);
      return manifestArtifact(captured.resourceId, head, entry);
    };
    // Another writer (a preview capture, the watcher) can advance the head
    // between reading it and editing: the entry itself is still guarded by
    // `expected`, so one fresh read is the honest answer, not a failed save.
    const attempt = async (retry: boolean): Promise<Artifact> => {
      try {
        return await execute();
      } catch (err) {
        if (retry && isHeadConflict(err)) return attempt(false);
        throw err;
      }
    };
    // Disk is authoritative; ingestion already owns the queue for indexed writes.
    return captured.writeThrough === false
      ? attempt(true)
      : serializeIngestion(() => attempt(true));
  }

  create(input: CreateArtifactInput): Promise<Artifact> {
    return this.put(input, new TextEncoder().encode(input.content), 'utf-8');
  }
  async upload(input: UploadArtifactInput): Promise<Artifact> {
    const captured = {
      ...input,
      meta: structuredClone(input.meta ?? {}),
      ...(input.expected !== undefined ? { expected: structuredClone(input.expected) } : {}),
    };
    if (captured.type && captured.type !== 'artifact')
      throw new Error('Use Growth to retain a file version.');
    if (captured.expected === undefined) {
      const selected = await this.selected(captured.resourceId);
      const before = selected.entries.find((entry) => entry.path === captured.meta.path);
      captured.expected = before
        ? manifestArtifact(captured.resourceId, selected.head!, before)
        : null;
    }
    return this.put(captured, new Uint8Array(await captured.blob.arrayBuffer()), 'binary');
  }

  async registerMany(inputs: RegisterArtifactInput[]): Promise<number> {
    const groups = new Map<string, RegisterArtifactInput[]>();
    for (const input of structuredClone(inputs)) {
      const group = groups.get(input.resourceId) ?? [];
      group.push(input);
      groups.set(input.resourceId, group);
    }
    const identity = await getLocalIdentity();
    for (const [owner, group] of groups) {
      const selected = await this.selected(owner);
      const paths = new Set(selected.entries.map((entry) => entry.path));
      const now = new Date().toISOString();
      const changes = group.map((input) => {
        if (paths.has(input.path)) throw new Error(`An Artifact already exists at ${input.path}`);
        paths.add(input.path);
        return {
          put: {
            id: crypto.randomUUID(),
            path: input.path,
            fingerprint: input.fingerprint,
            size: input.size,
            mimeType: input.mimeType,
            encoding: input.encoding,
            mode: Number(input.meta?.mode ?? 0o644),
            attributes: {
              ...identity,
              created: now,
              updated: now,
              meta: JSON.parse(JSON.stringify(input.meta ?? {})),
            },
          },
        };
      });
      await content().edit({ cruxId: owner, expected: selected.head, changes });
    }
    return inputs.length;
  }
  async register(input: RegisterArtifactInput): Promise<Artifact> {
    await this.registerMany([input]);
    return (await this.findByResource('crux', input.resourceId)).find(
      (file) => file.meta?.path === input.path,
    )!;
  }

  async update(value: ArtifactReference, updates: UpdateArtifactInput): Promise<Artifact> {
    const file = structuredClone(this.reference(value));
    const captured = structuredClone(updates);
    return serializeIngestion(async () => {
      await this.writable(file.resourceId);
      const selected = await this.selected(file.resourceId);
      const before = this.unchanged(file, selected.entries);
      const path = captured.meta?.path || captured.filename || before.path;
      const target = selected.entries.find((entry) => entry.path === path) ?? null;
      if (path !== before.path && target) {
        if (!captured.replace || captured.replace.resourceId !== file.resourceId)
          throw new Error(`An Artifact already exists at ${path}`);
        const approved = this.unchanged(this.reference(captured.replace), selected.entries);
        if (approved.path !== path) throw new Error('The approved replacement path changed.');
      } else if (captured.replace) throw new Error('The approved replacement file changed.');
      const entry: Entry = {
        ...before,
        path,
        mimeType: captured.mimeType ?? before.mimeType,
        mode: Number(captured.meta?.mode ?? before.mode),
        attributes: {
          ...before.attributes,
          updated: new Date().toISOString(),
          meta: JSON.parse(
            JSON.stringify({ ...object(before.attributes.meta), ...captured.meta, path }),
          ),
        },
      };
      if (path !== before.path) {
        if (!selected.head) throw new Error('The selected file content is unavailable.');
        const api = content();
        const head = await api.rename({
          cruxId: file.resourceId,
          expected: selected.head,
          source: before,
          target,
          entry,
        });
        await finishFileProjection(file.resourceId, [before.path, path], api.finishProjection);
        return manifestArtifact(file.resourceId, head, entry);
      }
      const head = await content().edit({
        cruxId: file.resourceId,
        expected: selected.head,
        changes: [...(path !== before.path ? [{ remove: before.path }] : []), { put: entry }],
      });
      return manifestArtifact(file.resourceId, head, entry);
    });
  }

  async delete(value: ArtifactReference, opts?: { writeThrough?: boolean }): Promise<void> {
    const file = structuredClone(this.reference(value));
    const execute = async () => {
      await this.writable(file.resourceId);
      const selected = await this.selected(file.resourceId);
      const entry = this.unchanged(file, selected.entries);
      const api = content();
      if (opts?.writeThrough === false) {
        await api.edit({
          cruxId: file.resourceId,
          expected: selected.head,
          changes: [{ remove: entry.path }],
        });
      } else {
        await api.delete({ cruxId: file.resourceId, expected: selected.head!, file: entry });
        await finishFileProjection(file.resourceId, [entry.path], api.finishProjection);
      }
    };
    return opts?.writeThrough === false ? execute() : serializeIngestion(execute);
  }

  async computeSnapshotFingerprint(owner: string): Promise<string> {
    const { entries } = await this.selected(owner);
    return hashContent(entries.map((entry) => `${entry.path}:${entry.fingerprint}`).join('\n'));
  }

  async cloneArtifactsToSnapshot(): Promise<void> {
    throw new Error('Create Growth through the API to retain its content root.');
  }
}

/** The content service refused an edit because the head moved under it. */
function isHeadConflict(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /ConflictException|File content changed/.test(message);
}
