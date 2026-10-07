/**
 * The full-window Plasma material needs accelerated WebGL. A software renderer
 * can expose WebGL yet take nearly a second per frame (Windows native CI).
 * Ask the browser to refuse its major-performance-caveat path, once per page.
 * Chromium can still admit SwiftShader with that flag, so also reject known
 * software renderers when renderer information is available. Release the
 * probe immediately. This never changes a saved preference.
 */
let plasmaSupported: boolean | undefined;

export function canRenderPlasma(): boolean {
  if (plasmaSupported !== undefined) return plasmaSupported;
  if (typeof document === 'undefined') return false;
  try {
    const gl = document.createElement('canvas').getContext('webgl2', {
      failIfMajorPerformanceCaveat: true,
    });
    if (!gl) return (plasmaSupported = false);
    try {
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      const renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
      plasmaSupported =
        !/swiftshader|llvmpipe|softpipe|lavapipe|software rasterizer|microsoft basic render driver/i.test(
          renderer,
        );
    } finally {
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch {
    plasmaSupported = false;
  }
  return plasmaSupported;
}
