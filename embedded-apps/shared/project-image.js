/** Read a raster Artifact from this Crux's preview, never another origin or a file path. */
export function validateProjectImagePath(path) {
  if (
    typeof path !== 'string' ||
    !path ||
    path.length > 240 ||
    /[\\\u0000-\u001f:%?#]/.test(path) ||
    path.split('/').some((part) => !part || part === '.' || part === '..') ||
    !(/\.(png|jpe?g|webp)$/i.test(path) || /^data\/assets\/[a-f0-9]{64}\.bin$/.test(path))
  )
    throw new Error(
      'Use a relative PNG, JPEG or WebP Artifact path in this Crux, or an imported data/assets raster path.',
    );
  return path;
}

export async function loadProjectImage(path, baseUrl) {
  validateProjectImagePath(path);
  const base = new URL(baseUrl);
  if (!['http:', 'https:'].includes(base.protocol))
    throw new Error('Open this Crux in the Workshop to read its image Artifacts.');
  const url = new URL(path.split('/').map(encodeURIComponent).join('/'), base);
  if (url.origin !== base.origin) throw new Error('Use an image in this Crux.');
  const response = await fetch(url, { redirect: 'error' });
  if (!response.ok) throw new Error('Image Artifact not found. Check its path with list_files.');
  const maximum = 32_000_000;
  if (Number(response.headers.get('content-length')) > maximum) {
    await response.body?.cancel();
    throw new Error('Use an image up to 32 MB.');
  }
  const chunks = [];
  let size = 0;
  const reader = response.body?.getReader();
  if (!reader) throw new Error('The image response has no content.');
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) {
        await reader.cancel();
        throw new Error('Use an image up to 32 MB.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const blob = new Blob(chunks, {
    type: response.headers.get('content-type') || 'application/octet-stream',
  });
  const objectUrl = URL.createObjectURL(blob);
  const image = new Image();
  try {
    image.src = objectUrl;
    await image.decode();
    if (
      !image.naturalWidth ||
      !image.naturalHeight ||
      image.naturalWidth > 8192 ||
      image.naturalHeight > 8192 ||
      image.naturalWidth * image.naturalHeight > 32_000_000
    )
      throw new Error('Use a raster image up to 8192 pixels per side and 32 megapixels.');
    return { image, release: () => URL.revokeObjectURL(objectUrl) };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}
