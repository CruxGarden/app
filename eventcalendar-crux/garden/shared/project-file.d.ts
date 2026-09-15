export function validateProjectArtifactPath(path: unknown): string;
export function loadProjectBlob(
  path: string,
  baseUrl: string,
  options?: { maximum?: number; label?: string },
): Promise<Blob>;
