import type { IArtifactService } from '../artifact.service';
import type {
  Artifact,
  CreateArtifactInput,
  UploadArtifactInput,
  UpdateArtifactInput,
} from '../types';
import { NotFoundError } from '../types';
import * as cruxes from '@/api/cruxes';

const MAX_CACHE_SIZE = 500;

export class ApiArtifactService implements IArtifactService {
  // Cache of attachments seen via findByResource, keyed by attachment ID.
  // This lets findById and downloadBlob resolve the resourceId needed for
  // API calls without requiring callers to pass it explicitly.
  // The cache is populated by findByResource (the primary fetch path) and
  // by create/upload (which return the new attachment).
  // Capped at MAX_CACHE_SIZE; oldest entries evicted when full.
  private artifactCache = new Map<string, Artifact>();

  private cacheSet(id: string, attachment: Artifact) {
    // Delete first so re-insertion moves to end (Map preserves insertion order)
    this.artifactCache.delete(id);
    this.artifactCache.set(id, attachment);
    if (this.artifactCache.size > MAX_CACHE_SIZE) {
      const oldest = this.artifactCache.keys().next().value;
      if (oldest) this.artifactCache.delete(oldest);
    }
  }

  async findById(id: string): Promise<Artifact> {
    const cached = this.artifactCache.get(id);
    if (cached) return cached;
    // No API endpoint for GET /attachments/:id exists.
    // The attachment must have been loaded via findByResource first.
    throw new NotFoundError(
      `Artifact ${id} not in cache. Call findByResource() first to load artifacts.`,
    );
  }

  async findByResource(_resourceType: string, resourceId: string): Promise<Artifact[]> {
    const attachments = await cruxes.getArtifacts(resourceId);
    for (const a of attachments) {
      this.cacheSet(a.id, a);
    }
    return attachments;
  }

  async create(input: CreateArtifactInput): Promise<Artifact> {
    const blob = new Blob([input.content], {
      type: input.mimeType || 'text/plain',
    });
    const filename = input.meta?.path?.split('/').pop() || 'unnamed';
    const file = new File([blob], filename, { type: blob.type });
    const attachment = await cruxes.uploadArtifact(input.resourceId, file, {
      path: input.meta?.path,
    });
    this.cacheSet(attachment.id, attachment);
    return attachment;
  }

  async upload(input: UploadArtifactInput): Promise<Artifact> {
    const filename = input.meta?.path?.split('/').pop() || 'unnamed';
    const file = new File([input.blob], filename, {
      type: input.mimeType || input.blob.type,
    });
    const attachment = await cruxes.uploadArtifact(input.resourceId, file, {
      type: input.type,
      kind: input.kind,
      path: input.meta?.path,
    });
    this.cacheSet(attachment.id, attachment);
    return attachment;
  }

  async update(id: string, updates: UpdateArtifactInput): Promise<Artifact> {
    const meta: Record<string, unknown> = { ...updates.meta };
    if (updates.mimeType) meta.mimeType = updates.mimeType;
    if (updates.filename) meta.filename = updates.filename;
    const attachment = await cruxes.updateArtifact(id, undefined, meta);
    this.cacheSet(attachment.id, attachment);
    return attachment;
  }

  async delete(id: string): Promise<void> {
    await cruxes.deleteArtifact(id);
    this.artifactCache.delete(id);
  }

  async readContent(id: string): Promise<string> {
    const blob = await this.downloadBlob(id);
    return blob.text();
  }

  async downloadBlob(id: string): Promise<Blob> {
    const cached = this.artifactCache.get(id);
    if (!cached) {
      throw new NotFoundError(
        `Artifact ${id} not in cache. Call findByResource() first to load artifacts.`,
      );
    }
    return cruxes.downloadArtifact(cached.resourceId, id);
  }

  async computeSnapshotFingerprint(_resourceId: string): Promise<string> {
    throw new Error('computeSnapshotFingerprint is only available in local-first mode');
  }

  async cloneArtifactsToSnapshot(_sourceId: string, _snapshotId: string): Promise<void> {
    throw new Error('cloneArtifactsToSnapshot is only available in local-first mode');
  }
}
