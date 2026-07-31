import type {
  Artifact,
  CreateArtifactInput,
  UploadArtifactInput,
  UpdateArtifactInput,
} from './types';

export interface IArtifactService {
  findById(id: string): Promise<Artifact>;
  findByResource(resourceType: string, resourceId: string): Promise<Artifact[]>;
  create(input: CreateArtifactInput): Promise<Artifact>;
  upload(input: UploadArtifactInput): Promise<Artifact>;
  update(id: string, updates: UpdateArtifactInput): Promise<Artifact>;
  /** opts.writeThrough=false records a deletion already made on disk (ingestion). */
  delete(id: string, opts?: { writeThrough?: boolean }): Promise<void>;
  readContent(id: string): Promise<string>;
  downloadBlob(id: string): Promise<Blob>;

  /** Compute SHA-256 fingerprint of sorted path:fingerprint pairs for a resource's artifacts */
  computeSnapshotFingerprint(resourceId: string): Promise<string>;

  /** Clone all artifacts from sourceId to snapshotId, deduplicating content by fingerprint */
  cloneArtifactsToSnapshot(sourceId: string, snapshotId: string): Promise<void>;
}
