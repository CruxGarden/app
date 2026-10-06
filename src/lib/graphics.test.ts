import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('Plasma graphics admission', () => {
  it('requests the performance-safe path once and releases the successful probe', async () => {
    const loseContext = vi.fn();
    const getContext = vi.fn(() => ({ getExtension: () => ({ loseContext }) }));
    vi.stubGlobal('document', { createElement: () => ({ getContext }) });
    const { canRenderPlasma } = await import('./graphics');
    expect(canRenderPlasma()).toBe(true);
    expect(canRenderPlasma()).toBe(true);
    expect(getContext).toHaveBeenCalledExactlyOnceWith('webgl2', {
      failIfMajorPerformanceCaveat: true,
    });
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
