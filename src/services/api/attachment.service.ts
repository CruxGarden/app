import type { IAttachmentService } from '../attachment.service';
import type {
  Attachment,
  CreateAttachmentInput,
  UploadAttachmentInput,
  UpdateAttachmentInput,
} from '../types';
import { NotFoundError } from '../types';
import * as cruxes from '@/api/cruxes';

export class ApiAttachmentService implements IAttachmentService {
  // Cache of attachments seen via findByResource, keyed by attachment ID.
  // This lets findById and downloadBlob resolve the resourceId needed for
  // API calls without requiring callers to pass it explicitly.
  // The cache is populated by findByResource (the primary fetch path) and
  // by create/upload (which return the new attachment).
  private attachmentCache = new Map<string, Attachment>();

  async findById(id: string): Promise<Attachment> {
    const cached = this.attachmentCache.get(id);
    if (cached) return cached;
    // No API endpoint for GET /attachments/:id exists.
    // The attachment must have been loaded via findByResource first.
    throw new NotFoundError(
      `Attachment ${id} not in cache. Call findByResource() first to load attachments.`,
    );
  }

  async findByResource(_resourceType: string, resourceId: string): Promise<Attachment[]> {
    const attachments = await cruxes.getAttachments(resourceId);
    for (const a of attachments) {
      this.attachmentCache.set(a.id, a);
    }
    return attachments;
  }

  async create(input: CreateAttachmentInput): Promise<Attachment> {
    const blob = new Blob([input.content], {
      type: input.mimeType || 'text/plain',
    });
    const filename = input.meta?.path?.split('/').pop() || 'unnamed';
    const file = new File([blob], filename, { type: blob.type });
    const attachment = await cruxes.uploadAttachment(input.resourceId, file, {
      path: input.meta?.path,
    });
    this.attachmentCache.set(attachment.id, attachment);
    return attachment;
  }

  async upload(input: UploadAttachmentInput): Promise<Attachment> {
    const filename = input.meta?.path?.split('/').pop() || 'unnamed';
    const file = new File([input.blob], filename, {
      type: input.mimeType || input.blob.type,
    });
    const attachment = await cruxes.uploadAttachment(input.resourceId, file, {
      type: input.type,
      kind: input.kind,
      path: input.meta?.path,
    });
    this.attachmentCache.set(attachment.id, attachment);
    return attachment;
  }

  async update(id: string, updates: UpdateAttachmentInput): Promise<Attachment> {
    const meta: Record<string, unknown> = { ...updates.meta };
    if (updates.mimeType) meta.mimeType = updates.mimeType;
    if (updates.filename) meta.filename = updates.filename;
    const attachment = await cruxes.updateAttachment(id, undefined, meta);
    this.attachmentCache.set(attachment.id, attachment);
    return attachment;
  }

  async delete(id: string): Promise<void> {
    await cruxes.deleteAttachment(id);
    this.attachmentCache.delete(id);
  }

  async readContent(id: string): Promise<string> {
    const blob = await this.downloadBlob(id);
    return blob.text();
  }

  async downloadBlob(id: string): Promise<Blob> {
    const cached = this.attachmentCache.get(id);
    if (!cached) {
      throw new NotFoundError(
        `Attachment ${id} not in cache. Call findByResource() first to load attachments.`,
      );
    }
    return cruxes.downloadAttachment(cached.resourceId, id);
  }
}
