import { describe, it, expect } from 'vitest';
import { parseCssTime, enterClass, exitClass, runExit, cancelExit, ENTER_ROLES } from './motion';

/** vitest runs in node: a stand-in for the only DOM surface runExit touches. */
function fakeEl(classes: string): HTMLElement {
  const set = new Set(classes.split(' ').filter(Boolean));
  return {
    classList: {
      add: (...c: string[]) => c.forEach((x) => set.add(x)),
      remove: (...c: string[]) => c.forEach((x) => set.delete(x)),
      contains: (c: string) => set.has(c),
    },
    get className() {
      return [...set].join(' ');
    },
    addEventListener() {},
    removeEventListener() {},
  } as unknown as HTMLElement;
}

describe('motion helpers', () => {
  it('parses CSS time lists to ms', () => {
    expect(parseCssTime('150ms')).toBe(150);
    expect(parseCssTime('0.25s')).toBe(250);
    expect(parseCssTime('0.2s, 1s')).toBe(200);
    expect(parseCssTime(' 2s ')).toBe(2000);
    expect(parseCssTime('0s')).toBe(0);
    expect(parseCssTime('')).toBe(0);
    expect(parseCssTime('none')).toBe(0);
    expect(parseCssTime('auto')).toBe(0);
  });

  it('names role classes the way motion.css spells them', () => {
    for (const r of ENTER_ROLES) expect(enterClass(r)).toBe(`motion-enter-${r}`);
    expect(exitClass('dialog')).toBe('motion-exit-dialog');
  });

  it('runExit swaps enter for exit and resolves at once when nothing animates', async () => {
    const el = fakeEl('motion-enter-dialog x');
    const p = runExit(el, 'dialog');
    expect(el.classList.contains('motion-enter-dialog')).toBe(false);
    expect(el.classList.contains('motion-exit-dialog')).toBe(true);
    expect(el.classList.contains('x')).toBe(true);
    await expect(p).resolves.toBeUndefined();
  });

  it('cancelExit restores the entered state', () => {
    const el = fakeEl('motion-exit-dropdown');
    cancelExit(el, 'dropdown');
    expect(el.className).toBe('motion-enter-dropdown');
  });
});
