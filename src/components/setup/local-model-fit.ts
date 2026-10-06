import type { LocalModelHardware } from '../../../electron/src/bridge';
export interface LocalModelChoice {
  name: string;
  label: string;
  approxBytes: number;
}
/** Download sizes: https://ollama.com/library/qwen3 (checked 2026-10-06).
 * Fit is our conservative estimate, not a model benchmark or a guarantee.
 * Reserve 4 GiB for the system, 35% headroom for context/runtime, and use at most 75% RAM.
 */
export const LOCAL_MODEL_CHOICES: LocalModelChoice[] = [
  { name: 'qwen3:1.7b', label: 'Qwen3 1.7B', approxBytes: 1_400_000_000 },
  { name: 'qwen3:4b', label: 'Qwen3 4B', approxBytes: 2_500_000_000 },
  { name: 'qwen3:8b', label: 'Qwen3 8B', approxBytes: 5_200_000_000 },
  { name: 'qwen3:14b', label: 'Qwen3 14B', approxBytes: 9_300_000_000 },
];
export function rankLocalModels(hardware: LocalModelHardware | null) {
  const ramBudget = hardware
    ? Math.max(0, Math.min(hardware.memoryBytes * 0.75, hardware.memoryBytes - 4 * 1024 ** 3))
    : 0;
  const fastBudget = hardware?.unifiedMemory ? ramBudget : (hardware?.gpuMemoryBytes ?? 0) * 0.85;
  return LOCAL_MODEL_CHOICES.map((model) => {
    const needed = model.approxBytes * 1.35 + 1024 ** 3;
    const fit = !hardware
      ? 'unknown'
      : needed <= fastBudget
        ? 'accelerated'
        : needed <= ramBudget
          ? 'memory'
          : 'tight';
    return {
      ...model,
      fit,
      detail:
        fit === 'accelerated'
          ? 'Fits estimated GPU memory budget'
          : fit === 'memory'
            ? 'Fits RAM; GPU fit unknown or too small, may be slower'
            : fit === 'tight'
              ? 'Likely too large for available memory'
              : 'Memory could not be detected',
    };
  }).sort((a, b) => {
    const rank = (fit: string) => ['accelerated', 'memory', 'unknown', 'tight'].indexOf(fit);
    return (
      rank(a.fit) - rank(b.fit) ||
      (a.fit === 'tight' || a.fit === 'unknown'
        ? a.approxBytes - b.approxBytes
        : b.approxBytes - a.approxBytes)
    );
  });
}
