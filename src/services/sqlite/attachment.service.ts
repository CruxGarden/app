import type { IAttachmentService } from '../attachment.service';
import type {
  Attachment,
  CreateAttachmentInput,
  UploadAttachmentInput,
  UpdateAttachmentInput,
} from '../types';
import { NotFoundError } from '../types';
import { getSqliteClient } from './client';
import { getLocalIdentity } from './identity';
import { toAttachment, guessMimeType, hashContent, buildInsert } from './helpers';

function byteLength(str: string): number {
  return new TextEncoder().encode(str).byteLength;
}

export class SqliteAttachmentService implements IAttachmentService {
  async findById(id: string): Promise<Attachment> {
    const row = await getSqliteClient().get(
      'SELECT * FROM artifacts WHERE id = ?',
      [id],
    );
    if (!row) throw new NotFoundError('Attachment not found');
    return toAttachment(row);
  }

  async findByResource(resourceType: string, resourceId: string): Promise<Attachment[]> {
    const rows = await getSqliteClient().all(
      'SELECT * FROM artifacts WHERE resource_id = ? AND resource_type = ?',
      [resourceId, resourceType],
    );
    return rows.map(toAttachment);
  }

  async create(input: CreateAttachmentInput): Promise<Attachment> {
    const identity = await getLocalIdentity();
    const filePath = input.meta?.path || '';
    const db = getSqliteClient();

    // Check for existing artifact at same path (not version snapshots)
    if (filePath) {
      const existing = await db.get<Record<string, unknown>>(
        "SELECT id, mime_type FROM artifacts WHERE resource_id = ? AND path = ? AND type = 'artifact'",
        [input.resourceId, filePath],
      );
      if (existing) {
        const fingerprint = await hashContent(input.content);
        await db.run(
          'UPDATE artifacts SET content = ?, encoding = ?, mime_type = ?, size = ?, fingerprint = ?, updated = ? WHERE id = ?',
          [
            input.content,
            'utf-8',
            input.mimeType || (existing.mime_type as string),
            byteLength(input.content),
            fingerprint,
            new Date().toISOString(),
            existing.id,
          ],
        );
        return this.findById(existing.id as string);
      }
    }

    const fingerprint = await hashContent(input.content);
    const now = new Date().toISOString();
    const record = {
      id: crypto.randomUUID(),
      type: 'artifact',
      kind: 'file',
      path: filePath,
      meta: input.meta || { path: filePath },
      resourceId: input.resourceId,
      resourceType: input.resourceType || 'crux',
      authorId: identity.authorId,
      homeId: identity.homeId,
      encoding: 'utf-8',
      mimeType: input.mimeType || guessMimeType(filePath),
      filename: filePath.split('/').pop() || 'unnamed',
      size: byteLength(input.content),
      fingerprint,
      content: input.content,
      created: now,
      updated: now,
    };
    const { sql, params } = buildInsert('artifacts', record);
    await db.run(sql, params);
    return this.findById(record.id);
  }

  async upload(input: UploadAttachmentInput): Promise<Attachment> {
    const identity = await getLocalIdentity();
    const filePath = input.meta?.path || '';
    const db = getSqliteClient();

    // Convert Blob to Uint8Array for SQLite BLOB storage
    const contentBytes = new Uint8Array(await input.blob.arrayBuffer());
    const fingerprint = await hashContent(contentBytes);

    // When type is 'version', skip dedup — always create a new record.
    if (input.type !== 'version' && filePath) {
      const existing = await db.get<Record<string, unknown>>(
        "SELECT id, mime_type FROM artifacts WHERE resource_id = ? AND path = ? AND type = 'artifact'",
        [input.resourceId, filePath],
      );
      if (existing) {
        await db.run(
          'UPDATE artifacts SET content = ?, encoding = ?, mime_type = ?, size = ?, fingerprint = ?, updated = ? WHERE id = ?',
          [
            contentBytes,
            'binary',
            input.mimeType || (existing.mime_type as string),
            input.blob.size,
            fingerprint,
            new Date().toISOString(),
            existing.id,
          ],
        );
        return this.findById(existing.id as string);
      }
    }

    const now = new Date().toISOString();
    const record = {
      id: crypto.randomUUID(),
      type: input.type || 'artifact',
      kind: input.kind || 'file',
      path: filePath,
      meta: input.meta || { path: filePath },
      resourceId: input.resourceId,
      resourceType: input.resourceType || 'crux',
      authorId: identity.authorId,
      homeId: identity.homeId,
      encoding: 'binary',
      mimeType: input.mimeType || guessMimeType(filePath),
      filename: filePath.split('/').pop() || 'unnamed',
      size: input.blob.size,
      fingerprint,
      content: contentBytes,
      created: now,
      updated: now,
    };
    const { sql, params } = buildInsert('artifacts', record);
    await db.run(sql, params);
    return this.findById(record.id);
  }

  async update(id: string, updates: UpdateAttachmentInput): Promise<Attachment> {
    const existing = await this.findById(id);
    const changes: Record<string, unknown> = { updated: new Date().toISOString() };
    if (updates.meta) changes.meta = { ...existing.meta, ...updates.meta };
    if (updates.mimeType !== undefined) changes.mimeType = updates.mimeType;
    if (updates.filename !== undefined) changes.filename = updates.filename;

    const sets = Object.keys(changes)
      .map((k) => {
        const col = k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
        return `${col} = ?`;
      })
      .join(', ');
    const params = Object.values(changes).map((v) =>
      v !== null && typeof v === 'object' && !(v instanceof Uint8Array) ? JSON.stringify(v) : v ?? null,
    );
    params.push(id);

    await getSqliteClient().run(`UPDATE artifacts SET ${sets} WHERE id = ?`, params);
    return this.findById(id);
  }

  async delete(id: string): Promise<void> {
    await getSqliteClient().run('DELETE FROM artifacts WHERE id = ?', [id]);
  }

  async readContent(id: string): Promise<string> {
    const row = await getSqliteClient().get<{ content: unknown; encoding: string }>(
      'SELECT content, encoding FROM artifacts WHERE id = ?',
      [id],
    );
    if (!row) throw new NotFoundError('Attachment not found');
    if (row.encoding === 'binary') {
      throw new Error('Cannot read binary content as string — use downloadBlob()');
    }
    return row.content as string;
  }

  async downloadBlob(id: string): Promise<Blob> {
    const row = await getSqliteClient().get<{ content: unknown; mime_type: string; encoding: string }>(
      'SELECT content, mime_type, encoding FROM artifacts WHERE id = ?',
      [id],
    );
    if (!row) throw new NotFoundError('Attachment not found');
    if (row.content instanceof Uint8Array) {
      return new Blob([row.content as BlobPart], { type: row.mime_type });
    }
    // Text content stored as string
    return new Blob([row.content as string], { type: row.mime_type });
  }

  async computeSnapshotFingerprint(resourceId: string): Promise<string> {
    const db = getSqliteClient();
    const rows = await db.all<{ path: string; fingerprint: string }>(
      "SELECT path, fingerprint FROM artifacts WHERE resource_id = ? AND type = 'artifact' ORDER BY path",
      [resourceId],
    );
    const manifest = rows.map((r) => `${r.path}:${r.fingerprint}`).join('\n');
    return hashContent(manifest);
  }

  async cloneArtifactsToSnapshot(sourceId: string, snapshotId: string): Promise<void> {
    const db = getSqliteClient();
    const identity = await getLocalIdentity();
    const now = new Date().toISOString();

    // Get all workspace artifacts with content
    const rows = await db.all<Record<string, unknown>>(
      "SELECT * FROM artifacts WHERE resource_id = ? AND type = 'artifact'",
      [sourceId],
    );

    for (const row of rows) {
      const record = {
        id: crypto.randomUUID(),
        type: 'artifact',
        kind: (row.kind as string) || 'file',
        path: row.path as string,
        meta: row.meta, // Already JSON string from DB
        resourceId: snapshotId,
        resourceType: 'crux',
        authorId: identity.authorId,
        homeId: identity.homeId,
        encoding: row.encoding as string,
        mimeType: row.mime_type as string,
        filename: row.filename as string,
        size: row.size as number,
        fingerprint: row.fingerprint as string,
        content: row.content,
        created: now,
        updated: now,
      };

      const { sql, params } = buildInsert('artifacts', record);
      await db.run(sql, params);
    }
  }
}
