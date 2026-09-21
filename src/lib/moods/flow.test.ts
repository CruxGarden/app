import { describe, it, expect } from 'vitest';
import { FlowState, FLOW_HALF_LIFE_MS, flowSettings, type FlowActivity } from './flow';
import { MOOD_PRESETS } from './presets';
import { GARDEN_DARK } from './garden-dark';

function flow(sensitivity = 0.5) {
  const state = new FlowState();
  state.configure({ enabled: true, sensitivity }, 0);
  return state;
}

describe('Flow — activity gathers, glows, then settles', () => {
  it('starts in the middle, enabled only for Plasma among bundled presets', () => {
    expect(GARDEN_DARK.flowSensitivity).toBe('0.5');
    expect(
      MOOD_PRESETS.filter((p) => (p.overrides.flowEnabled ?? GARDEN_DARK.flowEnabled) === 'on').map(
        (p) => p.id,
      ),
    ).toEqual(['plasma']);
    expect(flowSettings('', '')).toEqual({ enabled: false, sensitivity: 0.5 });
    expect(flowSettings('on', 'bad').sensitivity).toBe(0.5);
    expect(flowSettings('on', '3').sensitivity).toBe(1);
    expect(flowSettings('off', '-2').sensitivity).toBe(0);
  });

  it('eases into an action rather than flashing at the instant it happens', () => {
    const state = flow(1);
    state.happened('artifact', 0);
    expect(state.tick(0)).toBe(0);
    const early = state.tick(200);
    expect(early).toBeGreaterThan(0);
    expect(early).toBeLessThan(0.05);
    expect(state.tick(2400)).toBeGreaterThan(0.25);
  });

  it('least sensitive needs sustained work; most sensitive notices a single action', () => {
    const low = flow(0),
      high = flow(1);
    for (const state of [low, high]) state.happened('artifact', 0);
    expect(low.tick(3000)).toBeLessThan(0.01);
    expect(high.tick(3000)).toBeGreaterThan(0.3);
    for (let i = 1; i <= 150; i++) low.happened('artifact', 3000 + i * 500);
    expect(low.tick(80_000)).toBeGreaterThan(0.2);
    expect(low.tick(80_000)).toBeLessThan(0.4);
  });

  it('coalesces event floods without losing small contributions over time', () => {
    const burst = flow(0),
      single = flow(0);
    single.happened('artifact', 0);
    for (let i = 0; i < 1000; i++) burst.happened('artifact', i / 10);
    expect(burst.tick(3000)).toBe(single.tick(3000));
    for (let i = 1; i < 100; i++) burst.happened('artifact', 3000 + i * 500);
    expect(burst.tick(55_000)).toBeGreaterThan(0.15);
  });

  it('counts every creative input kind, including collaborators and embedded tools', () => {
    const kinds: FlowActivity[] = [
      'writing',
      'interaction',
      'arranging',
      'artifact',
      'crux',
      'collaboration',
      'tool',
    ];
    for (const kind of kinds) {
      const state = flow(1);
      state.happened(kind, 0);
      expect(state.tick(3000), kind).toBeGreaterThan(0.05);
    }
  });

  it('settles after work stops, including when the window was suspended', () => {
    const state = flow(1);
    for (let t = 0; t < 10_000; t += 500) state.happened('artifact', t);
    const peak = state.tick(15_000);
    expect(peak).toBeGreaterThan(0.8);
    expect(state.tick(15_000 + FLOW_HALF_LIFE_MS)).toBeLessThan(peak * 0.8);
    expect(state.tick(2_000_000)).toBe(0);
    expect(state.settled).toBe(true);
  });

  it('off clears the glow and ignores activity; re-enabling starts quietly', () => {
    const state = flow(1);
    state.happened('crux', 0);
    expect(state.tick(3000)).toBeGreaterThan(0.4);
    state.configure({ enabled: false, sensitivity: 1 }, 3000);
    state.happened('tool', 4000);
    expect(state.tick(5000)).toBe(0);
    expect(state.settled).toBe(true);
    state.configure({ enabled: true, sensitivity: 0.5 }, 5000);
    expect(state.tick(6000)).toBe(0);
  });

  it('stays finite when the rise and decay rates coincide', () => {
    const state = flow(1 - (FLOW_HALF_LIFE_MS / Math.LN2 - 2400) / 35_200);
    state.happened('artifact', 0);
    expect(state.tick(10_000)).toBeGreaterThan(0);
    expect(state.tick(2_000_000)).toBe(0);
  });

  it('looks the same at 30, 60 and 120 Hz', () => {
    const run = (fps: number) => {
      const state = flow(1);
      state.happened('artifact', 0);
      for (let t = 0; t < 90_000; t += 1000 / fps) state.tick(t);
      return state.tick(90_000);
    };
    expect(run(30)).toBeCloseTo(run(120), 2);
    expect(run(60)).toBeCloseTo(run(120), 2);
  });

  it('at middle sensitivity blooms over a minute and lingers after work stops', () => {
    const state = flow();
    const levels = new Map<number, number>();
    for (let t = 0; t <= 180_000; t += 100) {
      if (t < 60_000 && t % 1000 === 0) state.happened('artifact', t);
      const value = state.tick(t);
      if (t % 15_000 === 0) levels.set(t, value);
    }
    expect(levels.get(15_000)).toBeLessThan(0.25);
    expect(levels.get(30_000)).toBeLessThan(0.65);
    expect(levels.get(60_000)).toBeGreaterThan(0.8);
    // No switch-off when the person pauses: 15 seconds later, still glowing.
    expect(levels.get(75_000)).toBeGreaterThan(0.65);
    expect(levels.get(120_000)).toBeGreaterThan(0.1);
    expect(levels.get(180_000)).toBeLessThan(0.05);
  });
});
