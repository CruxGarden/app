import { describe, it, expect } from 'vitest';
import { resolveMotionIntensity, MOTION_INTENSITY_SCALE } from './motion-intensity';

describe('resolveMotionIntensity', () => {
  it("the person's explicit choice wins over the Mood and the system", () => {
    expect(resolveMotionIntensity('expressive', 'subtle', true)).toBe('expressive');
    expect(resolveMotionIntensity('off', 'expressive', false)).toBe('off');
    expect(resolveMotionIntensity('normal', 'subtle', true)).toBe('normal');
  });

  it('system: reduced motion means off', () => {
    expect(resolveMotionIntensity('system', 'expressive', true)).toBe('off');
    expect(resolveMotionIntensity(null, 'normal', true)).toBe('off');
  });

  it("system: otherwise the Mood's default, never off, normal when unsaid", () => {
    expect(resolveMotionIntensity('system', 'subtle', false)).toBe('subtle');
    expect(resolveMotionIntensity('system', 'expressive', false)).toBe('expressive');
    expect(resolveMotionIntensity('system', 'off', false)).toBe('normal');
    expect(resolveMotionIntensity('system', '', false)).toBe('normal');
    expect(resolveMotionIntensity(undefined, undefined, false)).toBe('normal');
    expect(resolveMotionIntensity('loud', 'quiet', false)).toBe('normal');
  });

  it('off is instant, expressive is a touch slower than normal', () => {
    expect(MOTION_INTENSITY_SCALE.off).toBe(0);
    expect(MOTION_INTENSITY_SCALE.subtle).toBeLessThan(MOTION_INTENSITY_SCALE.normal);
    expect(MOTION_INTENSITY_SCALE.expressive).toBeGreaterThan(MOTION_INTENSITY_SCALE.normal);
  });
});
