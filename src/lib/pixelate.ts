/**
 * Pixelate — downsample an image and nearest-neighbor upscale for a pixel art aesthetic.
 * No palette quantization — all original colors are preserved, just at lower resolution.
 *
 * Returns a PNG Blob at the original (or specified output) dimensions.
 */

export interface PixelateOptions {
  /** Effective pixel grid size. A 512px image with blockSize 8 = 64 effective pixels across. Default: 8 */
  blockSize?: number;
  /** Output dimensions. Defaults to original image size. */
  outputSize?: { width: number; height: number };
}

/**
 * Pixelate an image source (File, Blob, or data URL) into a PNG Blob.
 */
export async function pixelateImage(
  source: File | Blob | string,
  options: PixelateOptions = {},
): Promise<Blob> {
  const blockSize = options.blockSize ?? 8;

  const img = await loadImage(source);
  const outW = options.outputSize?.width ?? img.width;
  const outH = options.outputSize?.height ?? img.height;

  // Downscale to the pixel grid size (bilinear — canvas default)
  const smallW = Math.max(1, Math.ceil(outW / blockSize));
  const smallH = Math.max(1, Math.ceil(outH / blockSize));

  const small = new OffscreenCanvas(smallW, smallH);
  const sCtx = small.getContext('2d')!;
  sCtx.drawImage(img, 0, 0, smallW, smallH);

  // Upscale back with nearest-neighbor (no smoothing)
  const out = new OffscreenCanvas(outW, outH);
  const oCtx = out.getContext('2d')!;
  oCtx.imageSmoothingEnabled = false;
  oCtx.drawImage(small, 0, 0, outW, outH);

  return out.convertToBlob({ type: 'image/png' });
}

/**
 * Convenience: pixelate and return a data URL.
 */
export async function pixelateImageToDataURL(
  source: File | Blob | string,
  options: PixelateOptions = {},
): Promise<string> {
  const blob = await pixelateImage(source, options);
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

async function loadImage(source: File | Blob | string): Promise<ImageBitmap> {
  if (typeof source === 'string') {
    const response = await fetch(source);
    const blob = await response.blob();
    return createImageBitmap(blob);
  }
  return createImageBitmap(source);
}
