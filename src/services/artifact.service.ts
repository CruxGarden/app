import type {
  Artifact,
  CreateArtifactInput,
  UploadArtifactInput,
  UpdateArtifactInput,
  RegisterArtifactInput,
} from './types';

export type ArtifactReference = string | Artifact;

export interface IArtifactService {
  findById(id: ArtifactReference): Promise<Artifact>;
  findByResource(resourceType: string, resourceId: string): Promise<Artifact[]>;
  create(input: CreateArtifactInput): Promise<Artifact>;
  upload(input: UploadArtifactInput): Promise<Artifact>;
  /** Index bytes the Blob Store already holds by fingerprint (metadata only; fails if the blob is missing). */
  register(input: RegisterArtifactInput): Promise<Artifact>;
  /** Index many stored blobs at once (chunked multi-row inserts); callers guarantee the paths are new and the blobs stored. */
  registerMany(inputs: RegisterArtifactInput[]): Promise<number>;
  update(id: ArtifactReference, updates: UpdateArtifactInput): Promise<Artifact>;
  /** opts.writeThrough=false records a deletion already made on disk (ingestion). */
  delete(id: ArtifactReference, opts?: { writeThrough?: boolean }): Promise<void>;
  readContent(id: ArtifactReference): Promise<string>;
  downloadBlob(id: ArtifactReference): Promise<Blob>;

  /** Compute SHA-256 fingerprint of sorted path:fingerprint pairs for a resource's artifacts */
  computeSnapshotFingerprint(resourceId: string): Promise<string>;

  /** Clone all artifacts from sourceId to snapshotId, deduplicating content by fingerprint */
  cloneArtifactsToSnapshot(sourceId: string, snapshotId: string): Promise<void>;
}
