import { PublicApiError, reportCrux, type CruxReport, type ReportReason } from '@/api/public';

/** What a visitor reads in the reason list. */
export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  illegal: 'It is illegal',
  harmful: 'It is harmful or abusive',
  spam: 'It is spam or a scam',
  copyright: 'It uses my work without permission',
  other: 'Something else',
};

export const REPORT_DETAILS_MAX = 2000;

export interface ReportDraft {
  reason: ReportReason | '';
  details: string;
  email: string;
}

export const EMPTY_REPORT: ReportDraft = { reason: '', details: '', email: '' };

export type ReportOutcome =
  | { status: 'sent' }
  | { status: 'invalid'; field: 'reason' | 'details' | 'email'; message: string }
  | { status: 'rate-limited'; message: string }
  | { status: 'failed'; message: string };

/** The first thing wrong with a draft, or null when it can be sent. */
export function validateReport(
  draft: ReportDraft,
): Extract<ReportOutcome, { status: 'invalid' }> | null {
  if (!draft.reason)
    return { status: 'invalid', field: 'reason', message: 'Choose a reason for the report.' };
  if (draft.details.length > REPORT_DETAILS_MAX)
    return {
      status: 'invalid',
      field: 'details',
      message: `Keep the details under ${REPORT_DETAILS_MAX.toLocaleString('en')} characters.`,
    };
  const email = draft.email.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return {
      status: 'invalid',
      field: 'email',
      message: 'Enter a valid email address, or leave it empty.',
    };
  return null;
}

/** The request body for a draft: empty optional fields are left out, not sent blank. */
export function reportPayload(cruxId: string, draft: ReportDraft): CruxReport {
  const details = draft.details.trim();
  const email = draft.email.trim();
  return {
    cruxId,
    reason: draft.reason as ReportReason,
    ...(details ? { details } : {}),
    ...(email ? { email } : {}),
  };
}

/**
 * Validate and send. Never throws and never touches the draft: on anything
 * but `sent`, what the visitor typed is still theirs to send again.
 */
export async function submitReport(
  cruxId: string,
  draft: ReportDraft,
  send: typeof reportCrux = reportCrux,
  signal?: AbortSignal,
): Promise<ReportOutcome> {
  const invalid = validateReport(draft);
  if (invalid) return invalid;
  try {
    await send(reportPayload(cruxId, draft), signal);
    return { status: 'sent' };
  } catch (error) {
    if (error instanceof PublicApiError && error.status === 429)
      return {
        status: 'rate-limited',
        message: 'Too many reports from here just now. Try again later.',
      };
    return {
      status: 'failed',
      message: 'The report could not be sent. Check your connection and try again.',
    };
  }
}
