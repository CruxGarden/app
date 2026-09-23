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
import { readSelectedFile, type SelectedFiles } from './file-content';
import { assertCopyWritable } from './working-copies';
import { serializeIngestion } from './ingestion';
import {
  writeThroughArtifact,
  renameThroughArtifact,
  deleteThroughArtifact,
} from './project-folder';

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
      ...('expected' in input && input.expected
        ? { expected: structuredClone(input.expected) }
        : {}),
    };
    const savedBytes = Uint8Array.from(bytes);
    const execute = async () => {
      if (captured.writeThrough !== false) await this.writable(captured.resourceId);
      const selected = await this.selected(captured.resourceId);
      const path = captured.meta.path;
      if (!path) throw new Error('Use a file path.');
      if (
        'expected' in captured &&
        captured.expected &&
        (captured.expected.resourceId !== captured.resourceId ||
          captured.expected.fileReference?.path !== path)
      )
        throw new Error(
          'Save the selected file in its owning Crux; use rename to change its path.',
        );
      const before =
        'expected' in captured && captured.expected
          ? this.unchanged(captured.expected, selected.entries)
          : selected.entries.find((entry) => entry.path === path);
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
      if (captured.writeThrough !== false)
        await writeThroughArtifact(
          captured.resourceId,
          { filename: path.split('/').pop()!, meta: { path } },
          savedBytes,
        );
      const head = await content().edit({
        cruxId: captured.resourceId,
        expected: selected.head,
        changes: [{ put: entry, bytes: savedBytes }],
      });
      return manifestArtifact(captured.resourceId, head, entry);
    };
    // Disk is authoritative; ingestion already owns the queue for indexed writes.
    return captured.writeThrough === false ? execute() : serializeIngestion(execute);
  }

  create(input: CreateArtifactInput): Promise<Artifact> {
    return this.put(input, new TextEncoder().encode(input.content), 'utf-8');
  }
  async upload(input: UploadArtifactInput): Promise<Artifact> {
    if (input.type && input.type !== 'artifact')
      throw new Error('Use Growth to retain a file version.');
    return this.put(input, new Uint8Array(await input.blob.arrayBuffer()), 'binary');
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
      if (path !== before.path && selected.entries.some((entry) => entry.path === path))
        throw new Error(`An Artifact already exists at ${path}`);
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
      if (path !== before.path) await renameThroughArtifact(file.resourceId, before.path, path);
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
      if (opts?.writeThrough !== false) await deleteThroughArtifact(file.resourceId, file);
      await content().edit({
        cruxId: file.resourceId,
        expected: selected.head,
        changes: [{ remove: entry.path }],
      });
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
