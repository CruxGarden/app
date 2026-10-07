import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('Plasma graphics admission', () => {
  it('requests the performance-safe path once and releases the successful probe', async () => {
    const loseContext = vi.fn();
    const getContext = vi.fn(() => ({
      getExtension: (name: string) => (name === 'WEBGL_lose_context' ? { loseContext } : null),
    }));
    vi.stubGlobal('document', { createElement: () => ({ getContext }) });
    const { canRenderPlasma } = await import('./graphics');
    expect(canRenderPlasma()).toBe(true);
    expect(canRenderPlasma()).toBe(true);
    expect(getContext).toHaveBeenCalledExactlyOnceWith('webgl2', {
      failIfMajorPerformanceCaveat: true,
    });
    expect(loseContext).toHaveBeenCalledOnce();
  });

  it.each([
    'ANGLE (Google, Vulkan (SwiftShader Device), SwiftShader driver)',
    'llvmpipe (LLVM 15.0.7, 256 bits)',
    'softpipe',
    'lavapipe',
    'Software Rasterizer',
    'ANGLE (Microsoft, Microsoft Basic Render Driver)',
  ])('refuses the software renderer %s even when the caveat flag succeeds', async (renderer) => {
    const loseContext = vi.fn();
    const getParameter = vi.fn(() => renderer);
    vi.stubGlobal('document', {
      createElement: () => ({
        getContext: () => ({
          getParameter,
          getExtension: (name: string) =>
            name === 'WEBGL_debug_renderer_info'
              ? { UNMASKED_RENDERER_WEBGL: 37446 }
              : { loseContext },
        }),
      }),
    });
    const { canRenderPlasma } = await import('./graphics');
    expect(canRenderPlasma()).toBe(false);
    expect(loseContext).toHaveBeenCalledOnce();
  });

  it('keeps hardware rendering enabled', async () => {
    const loseContext = vi.fn();
    vi.stubGlobal('document', {
      createElement: () => ({
        getContext: () => ({
          getParameter: () => 'ANGLE (Apple, Apple M3 Pro, OpenGL 4.1)',
          getExtension: (name: string) =>
            name === 'WEBGL_debug_renderer_info'
              ? { UNMASKED_RENDERER_WEBGL: 37446 }
              : { loseContext },
        }),
      }),
    });
    const { canRenderPlasma } = await import('./graphics');
    expect(canRenderPlasma()).toBe(true);
    expect(loseContext).toHaveBeenCalledOnce();
  });

  it.each(['unavailable', 'throws'])(
    'keeps a refused %s context from being retried on every Mood apply',
    async (failure) => {
      const getContext = vi.fn(() => {
        if (failure === 'throws') throw new Error('GPU unavailable');
        return null;
      });
      vi.stubGlobal('document', { createElement: () => ({ getContext }) });
      const { canRenderPlasma } = await import('./graphics');
      expect(canRenderPlasma()).toBe(false);
      expect(canRenderPlasma()).toBe(false);
      expect(getContext).toHaveBeenCalledOnce();
    },
  );
});
