import { createHash } from 'node:crypto';

function positiveInteger(value: string, name: string) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1) throw new Error(`${name} must be a positive integer`);
  return n;
}
export const sizes = (process.env.CRUX_PERF_FILES ?? '1000,10000,50000')
  .split(',')
  .map((s) => positiveInteger(s, 'CRUX_PERF_FILES'));
export const snapshots = positiveInteger(
  process.env.CRUX_PERF_SNAPSHOTS ?? '3',
  'CRUX_PERF_SNAPSHOTS',
);
export const fileBytes = positiveInteger(process.env.CRUX_PERF_BYTES ?? '1024', 'CRUX_PERF_BYTES');
export const phaseTimeout = positiveInteger(
  process.env.CRUX_PERF_PHASE_TIMEOUT_MS ?? '180000',
  'CRUX_PERF_PHASE_TIMEOUT_MS',
);
if (fileBytes < 128) throw new Error('CRUX_PERF_BYTES must be at least 128');
if (new Set(sizes).size !== sizes.length) throw new Error('CRUX_PERF_FILES must be unique');

export const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const pad = (n: number, digits = 3) => String(n).padStart(digits, '0');
export function pathFor(i: number) {
  const extra = i % 10 === 9 ? 'deep/inside/the/archive/' : '';
  return `notes/shelf-${pad(Math.floor(i / 1000))}/chapter-${pad(Math.floor(i / 100) % 10)}/${extra}note-${pad(i, 6)}.md`;
}
export function contentFor(i: number, revision: number) {
  return `# Note ${pad(i, 6)}\nRevision ${revision}\n\n${pathFor(i)}\n`.padEnd(fileBytes, '.');
}
