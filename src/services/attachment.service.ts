import type {
  Attachment,
  CreateAttachmentInput,
  UploadAttachmentInput,
  UpdateAttachmentInput,
} from './types';

export interface IAttachmentService {
  findById(id: string): Promise<Attachment>;
  findByResource(resourceType: string, resourceId: string): Promise<Attachment[]>;
  create(input: CreateAttachmentInput): Promise<Attachment>;
  upload(input: UploadAttachmentInput): Promise<Attachment>;
  update(id: string, updates: UpdateAttachmentInput): Promise<Attachment>;
  delete(id: string): Promise<void>;
  readContent(id: string): Promise<string>;
  downloadBlob(id: string): Promise<Blob>;

  /** Compute SHA-256 fingerprint of sorted path:fingerprint pairs for a resource's artifacts */
  computeSnapshotFingerprint(resourceId: string): Promise<string>;

  /** Clone all artifacts from sourceId to snapshotId, deduplicating content by fingerprint */
  cloneArtifactsToSnapshot(sourceId: string, snapshotId: string): Promise<void>;
}
