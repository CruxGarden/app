import type { IAttachmentService } from '../attachment.service';
import type {
  Attachment,
  CreateAttachmentInput,
  UploadAttachmentInput,
  UpdateAttachmentInput,
} from '../types';
import { NotFoundError } from '../types';
import { db } from './schema';
import { getLocalIdentity } from './identity';
import { toAttachment, guessMimeType, hashContent } from './helpers';

export class DexieAttachmentService implements IAttachmentService {
  async findById(id: string): Promise<Attachment> {
    const row = await db.artifacts.get(id);
    if (!row) throw new NotFoundError('Attachment not found');
    return toAttachment(row);
  }

  async findByResource(resourceType: string, resourceId: string): Promise<Attachment[]> {
    const rows = await db.artifacts
      .where('resourceId')
      .equals(resourceId)
      .filter((a) => a.resourceType === resourceType)
      .toArray();
    return rows.map(toAttachment);
  }

  async create(input: CreateAttachmentInput): Promise<Attachment> {
    const identity = await getLocalIdentity();
    const filePath = input.meta?.path || '';

    // Only overwrite existing artifacts (not version snapshots) at the same path
    const existing = filePath
      ? await db.artifacts
          .where({ resourceId: input.resourceId, path: filePath })
          .filter((a) => a.type === 'artifact')
          .first()
      : null;

    const fingerprint = await hashContent(input.content);

    if (existing) {
      await db.artifacts.update(existing.id, {
        content: input.content,
        encoding: 'utf-8',
        mimeType: input.mimeType || existing.mimeType,
        size: input.content.length,
        fingerprint,
        updated: new Date().toISOString(),
      });
      return this.findById(existing.id);
    }

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
      size: input.content.length,
      fingerprint,
      content: input.content,
      created: now,
      updated: now,
    };
    await db.artifacts.add(record);
    return toAttachment(record);
  }

  async upload(input: UploadAttachmentInput): Promise<Attachment> {
    const identity = await getLocalIdentity();
    const filePath = input.meta?.path || '';

    // When type is 'version', skip dedup — always create a new record.
    // Otherwise, only overwrite existing artifacts at the same path.
    const existing =
      input.type !== 'version' && filePath
        ? await db.artifacts
            .where({ resourceId: input.resourceId, path: filePath })
            .filter((a) => a.type === 'artifact')
            .first()
        : null;

    const fingerprint = await hashContent(input.blob);

    if (existing) {
      await db.artifacts.update(existing.id, {
        content: input.blob,
        encoding: 'binary',
        mimeType: input.mimeType || existing.mimeType,
        size: input.blob.size,
        fingerprint,
        updated: new Date().toISOString(),
      });
      return this.findById(existing.id);
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
      content: input.blob,
      created: now,
      updated: now,
    };
    await db.artifacts.add(record);
    return toAttachment(record);
  }

  async update(id: string, updates: UpdateAttachmentInput): Promise<Attachment> {
    const existing = await this.findById(id);
    const merged = {
      ...updates,
      meta: updates.meta ? { ...existing.meta, ...updates.meta } : existing.meta,
      updated: new Date().toISOString(),
    };
    await db.artifacts.update(id, merged);
    return this.findById(id);
  }

  async delete(id: string): Promise<void> {
    await db.artifacts.delete(id);
  }

  async readContent(id: string): Promise<string> {
    const row = await db.artifacts.get(id);
    if (!row) throw new NotFoundError('Attachment not found');
    if (row.encoding === 'binary') {
      throw new Error('Cannot read binary content as string — use downloadBlob()');
    }
    return row.content as string;
  }

  async downloadBlob(id: string): Promise<Blob> {
    const row = await db.artifacts.get(id);
    if (!row) throw new NotFoundError('Attachment not found');
    if (row.content instanceof Blob) return row.content;
    return new Blob([row.content as string], { type: row.mimeType });
  }
}
