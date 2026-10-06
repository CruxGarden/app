/** Flow: creative activity gathers into a glow, then gently settles (ADR 0014).
 * No content or activity history is retained. Events carry only their kind.
 */
export type FlowActivity =
  | 'writing'
  | 'interaction'
  | 'arranging'
  | 'artifact'
  | 'crux'
  | 'collaboration'
  | 'tool';
const listeners = new Set<(kind: FlowActivity) => void>();
export function reportFlowActivity(kind: FlowActivity): void {
  for (const listener of listeners) listener(kind);
}
export function onFlowActivity(listener: (kind: FlowActivity) => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

export interface FlowSettings {
  enabled: boolean;
  sensitivity: number;
}
export const DEFAULT_FLOW: FlowSettings = { enabled: false, sensitivity: 0.5 };
export const FLOW_HALF_LIFE_MS = 20_000;
const FLOOR = 0.0005;
const WEIGHT: Record<FlowActivity, number> = {
  writing: 0.25,
  interaction: 0.65,
  arranging: 0.8,
  artifact: 1,
  crux: 1.5,
  collaboration: 1,
  tool: 1,
};

export function flowSettings(enabled: string, sensitivity: string): FlowSettings {
  const value = Number(sensitivity);
  return {
    enabled: enabled === 'on',
    sensitivity:
      sensitivity.trim() && Number.isFinite(value)
        ? Math.max(0, Math.min(1, value))
        : DEFAULT_FLOW.sensitivity,
  };
}
export function readFlowSettings(): FlowSettings {
  const style = getComputedStyle(document.documentElement);
  return flowSettings(
    style.getPropertyValue('--flow-enabled').trim(),
    style.getPropertyValue('--flow-sensitivity'),
  );
}

/** A continuous reservoir followed by a soft envelope. Accumulation is never
 * quantised: tiny contributions at low sensitivity must not disappear.
 * Only the emitted value is quantised, to avoid repainting an entire material
 * for imperceptible changes. No flashing, periodic pulse or token counting.
 */
export class FlowState {
  private settings = { ...DEFAULT_FLOW };
  private energy = 0;
  private glow = 0;
  private at: number | null = null;
  private lastEvent = new Map<FlowActivity, number>();

  configure(settings: FlowSettings, now: number): void {
    this.advance(now);
    this.settings = settings;
    if (!settings.enabled) {
      this.energy = this.glow = 0;
      this.lastEvent.clear();
    }
  }

  happened(kind: FlowActivity, now: number): void {
    this.advance(now);
    if (!this.settings.enabled) return;
    // One gesture/save/tool burst, not every pixel moved, generated artifact
    // or streamed token. Sustained work still contributes throughout a turn.
    const interval = kind === 'collaboration' ? 2500 : 400;
    if (now - (this.lastEvent.get(kind) ?? -Infinity) < interval) return;
    this.lastEvent.set(kind, now);
    const gain = 0.006 * Math.pow(75, this.settings.sensitivity);
    this.energy = Math.min(1, this.energy + gain * WEIGHT[kind]);
  }

  private advance(now: number): void {
    const elapsed = this.at === null ? 0 : Math.max(0, now - this.at);
    this.at = now;
    if (!elapsed || !this.settings.enabled) return;
    // Exact response to an exponentially decaying input: independent of
    // refresh rate, and no jump or false glow after a suspended window wakes.
    const decay = Math.LN2 / FLOW_HALF_LIFE_MS;
    // At the middle setting the envelope takes about a minute to bloom.
    // Its release follows the reservoir over a further minute or two; brief
    // pauses leave light to build on. Only the sensitive end answers quickly.
    const riseMs = 2400 + 35_200 * (1 - this.settings.sensitivity);
    const follow = 1 / (this.energy > this.glow ? riseMs : 12_000);
    const e = Math.exp(-decay * elapsed);
    const g = Math.exp(-follow * elapsed);
    const difference = follow - decay;
    const response = Math.abs(difference) < 1e-10 ? elapsed * e : (e - g) / difference;
    this.glow = this.glow * g + this.energy * follow * response;
    this.energy *= e;
    if (this.energy < FLOOR && this.glow < FLOOR) this.energy = this.glow = 0;
  }

  tick(now: number): number {
    this.advance(now);
    return Math.round(this.glow * 256) / 256;
  }
  get settled(): boolean {
    return this.energy === 0 && this.glow === 0;
  }
}
