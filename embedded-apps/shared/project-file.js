/** Bounded reader for an Artifact in this Crux's trusted preview. */
export function validateProjectArtifactPath(path) {
  if (
    typeof path !== 'string' ||
    !path ||
    path.length > 240 ||
    /[\\\u0000-\u001f:%?#]/.test(path) ||
    path.split('/').some((p) => !p || p === '.' || p === '..')
  )
    throw Error('Use a relative Artifact path in this Crux.');
  return path;
}
export async function loadProjectBlob(
  path,
  baseUrl,
  { maximum = 32_000_000, label = 'file' } = {},
) {
  validateProjectArtifactPath(path);
  const base = new URL(baseUrl);
  if (!['http:', 'https:'].includes(base.protocol))
    throw new Error(`Open this Crux in the Workshop to read its ${label} Artifacts.`);
  const url = new URL(path.split('/').map(encodeURIComponent).join('/'), base);
  if (url.origin !== base.origin) throw new Error(`Use a ${label} in this Crux.`);
  const response = await fetch(url, { redirect: 'error' });
  if (!response.ok) throw new Error('Artifact not found. Check its path with list_files.');
  if (Number(response.headers.get('content-length')) > maximum) {
    await response.body?.cancel();
    throw new Error(`Use a ${label} up to ${maximum / 1000000} MB.`);
  }
  const chunks = [];
  let size = 0;
  const reader = response.body?.getReader();
  if (!reader) throw new Error('The Artifact response has no content.');
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) {
        await reader.cancel();
        throw new Error(`Use a ${label} up to ${maximum / 1000000} MB.`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return new Blob(chunks, {
    type: response.headers.get('content-type') || 'application/octet-stream',
  });
}
