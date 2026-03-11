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


/**
 * If no other artifact row references this fingerprint, delete the OPFS blob.
 * Safe to call even if the blob doesn't exist (blobDelete is a no-op).
 */
async function cleanupOrphanedBlob(fingerprint: string | null): Promise<void> {
  if (!fingerprint) return;
  const db = getSqliteClient();
  const row = await db.get<{ count: number }>(
    'SELECT COUNT(*) as count FROM artifacts WHERE fingerprint = ?',
    [fingerprint],
  );
  if ((row?.count ?? 0) === 0) {
    await db.blobDelete(fingerprint);
  }
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
    const contentBytes = new TextEncoder().encode(input.content);
    const fingerprint = await hashContent(contentBytes);

    // Check for existing artifact at same path (dedup — update in place)
    if (filePath) {
      const existing = await db.get<Record<string, unknown>>(
        "SELECT id, fingerprint, mime_type FROM artifacts WHERE resource_id = ? AND path = ? AND type = 'artifact'",
        [input.resourceId, filePath],
      );
      if (existing) {
        const oldFingerprint = existing.fingerprint as string | null;
        await db.blobWrite(fingerprint, contentBytes);
        await db.run(
          'UPDATE artifacts SET encoding = ?, mime_type = ?, size = ?, fingerprint = ?, updated = ? WHERE id = ?',
          [
            'utf-8',
            input.mimeType || (existing.mime_type as string),
            contentBytes.byteLength,
            fingerprint,
            new Date().toISOString(),
            existing.id,
          ],
        );
        if (oldFingerprint && oldFingerprint !== fingerprint) {
          await cleanupOrphanedBlob(oldFingerprint);
        }
        return this.findById(existing.id as string);
      }
    }

    await db.blobWrite(fingerprint, contentBytes);

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
      size: contentBytes.byteLength,
      fingerprint,
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

    const contentBytes = new Uint8Array(await input.blob.arrayBuffer());
    const fingerprint = await hashContent(contentBytes);

    // Write blob to OPFS (always — idempotent by fingerprint)
    await db.blobWrite(fingerprint, contentBytes);

    // When type is 'version', skip dedup — always create a new record.
    if (input.type !== 'version' && filePath) {
      const existing = await db.get<Record<string, unknown>>(
        "SELECT id, fingerprint, mime_type FROM artifacts WHERE resource_id = ? AND path = ? AND type = 'artifact'",
        [input.resourceId, filePath],
      );
      if (existing) {
        const oldFingerprint = existing.fingerprint as string | null;
        await db.run(
          'UPDATE artifacts SET encoding = ?, mime_type = ?, size = ?, fingerprint = ?, updated = ? WHERE id = ?',
          [
            'binary',
            input.mimeType || (existing.mime_type as string),
            input.blob.size,
            fingerprint,
            new Date().toISOString(),
            existing.id,
          ],
        );
        if (oldFingerprint && oldFingerprint !== fingerprint) {
          await cleanupOrphanedBlob(oldFingerprint);
        }
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
    const db = getSqliteClient();
    const row = await db.get<{ fingerprint: string | null }>('SELECT fingerprint FROM artifacts WHERE id = ?', [id]);
    await db.run('DELETE FROM artifacts WHERE id = ?', [id]);
    if (row?.fingerprint) {
      await cleanupOrphanedBlob(row.fingerprint);
    }
  }

  async readContent(id: string): Promise<string> {
    const row = await getSqliteClient().get<{ encoding: string; fingerprint: string | null }>(
      'SELECT encoding, fingerprint FROM artifacts WHERE id = ?',
      [id],
    );
    if (!row) throw new NotFoundError('Attachment not found');
    if (row.encoding === 'binary') {
      throw new Error('Cannot read binary content as string — use downloadBlob()');
    }
    if (!row.fingerprint) throw new Error('Attachment has no content (missing fingerprint)');
    const bytes = await getSqliteClient().blobRead(row.fingerprint);
    return new TextDecoder().decode(bytes);
  }

  async downloadBlob(id: string): Promise<Blob> {
    const row = await getSqliteClient().get<{ mime_type: string; fingerprint: string | null }>(
      'SELECT mime_type, fingerprint FROM artifacts WHERE id = ?',
      [id],
    );
    if (!row) throw new NotFoundError('Attachment not found');
    if (!row.fingerprint) throw new Error('Attachment has no content (missing fingerprint)');
    const bytes = await getSqliteClient().blobRead(row.fingerprint);
    return new Blob([bytes], { type: row.mime_type });
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

  /**
   * Clone workspace artifacts to a snapshot — metadata only.
   * No content is copied. Both rows reference the same OPFS blob
   * via fingerprint. Instant regardless of file count or size.
   */
  async cloneArtifactsToSnapshot(sourceId: string, snapshotId: string): Promise<void> {
    const db = getSqliteClient();
    const identity = await getLocalIdentity();
    const now = new Date().toISOString();

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
        meta: row.meta,
        resourceId: snapshotId,
        resourceType: 'crux',
        authorId: identity.authorId,
        homeId: identity.homeId,
        encoding: row.encoding as string,
        mimeType: row.mime_type as string,
        filename: row.filename as string,
        size: row.size as number,
        fingerprint: row.fingerprint as string,
        created: now,
        updated: now,
      };

      const { sql, params } = buildInsert('artifacts', record);
      await db.run(sql, params);
    }
  }
}
