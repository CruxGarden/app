import { loadProjectBlob } from './project-file.js';
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
  const blob = await loadProjectBlob(path, baseUrl, { label: 'image' });
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
