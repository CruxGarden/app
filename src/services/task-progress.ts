import type { ToolCall } from '@/api/types';

export const PROGRESS_PROMPT =
  'For longer work, call report_progress at meaningful milestones with your best estimate and current activity. Use null when uncertain and revise the estimate if the scope changes.';

/** An estimate supplied by the agent, never inferred from elapsed time or tool count. */
export interface ReportedProgress {
  percent: number | null;
  message: string;
  reportedAt: string;
}
export interface ProgressDisplay {
  percent: number | null;
  message: string;
  running: boolean;
  complete: boolean;
}

export function progressInput(
  input: Record<string, unknown>,
): Omit<ReportedProgress, 'reportedAt'> | null {
  const { percent, message } = input;
  if (
    percent !== null &&
    (typeof percent !== 'number' || !Number.isFinite(percent) || percent < 0 || percent > 100)
  )
    return null;
  if (typeof message !== 'string' || !message.trim() || message.length > 160) return null;
  return { percent, message: message.trim() };
}

/** Both built-in tools and hosted agents' discovered-tool envelope reach this seam. */
export function progressFromCall(call: ToolCall | undefined): ReportedProgress | undefined {
  if (
    !call ||
    call.error ||
    call.result === undefined ||
    (typeof call.result === 'string' && call.result.startsWith('Error'))
  )
    return;
  let input = call.input;
  if (call.name !== 'report_progress') {
    if (
      !['garden_call_tool', 'mcp__crux_garden__garden_call_tool'].includes(call.name) ||
      input.name !== 'report_progress'
    )
      return;
    if (!input.input || typeof input.input !== 'object' || Array.isArray(input.input)) return;
    input = input.input as Record<string, unknown>;
  }
  const progress = progressInput(input);
  return progress ? { ...progress, reportedAt: new Date().toISOString() } : undefined;
}

/** Completion belongs to the runner. A reported 100% cannot finish an active turn. */
export function progressDisplay(
  status: string | undefined,
  reported?: ReportedProgress,
): ProgressDisplay | undefined {
  const running = ['planning', 'running', 'checking'].includes(status ?? '');
  const complete = status === 'done';
  if (!running && !reported) return;
  return {
    percent: complete
      ? 100
      : reported?.percent == null
        ? null
        : Math.min(99, Math.round(reported.percent)),
    message: reported?.message ?? 'Working — estimate not available yet',
    running,
    complete,
  };
}
