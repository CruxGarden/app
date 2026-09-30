/**
 * The full-window Plasma material needs accelerated WebGL. A software renderer
 * can expose WebGL yet take nearly a second per frame (Windows native CI).
 * Ask the browser to refuse its major-performance-caveat path, once per page,
 * and release the probe immediately. This never changes a saved preference.
 */
let plasmaSupported: boolean | undefined;

export function canRenderPlasma(): boolean {
  if (plasmaSupported !== undefined) return plasmaSupported;
  if (typeof document === 'undefined') return false;
  try {
    const gl = document.createElement('canvas').getContext('webgl2', {
      failIfMajorPerformanceCaveat: true,
    });
    plasmaSupported = gl !== null;
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    plasmaSupported = false;
  }
  return plasmaSupported;
}
