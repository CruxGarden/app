import { afterEach, describe, expect, it, vi } from 'vitest';
import { PublicApiError, reportCrux } from '@/api/public';
import {
  REPORT_DETAILS_MAX,
  REPORT_REASON_LABELS,
  reportPayload,
  submitReport,
  validateReport,
  type ReportDraft,
} from './report';

const CRUX = '5c0ffee5-0000-4000-8000-00000000c0de';
const draft = (change: Partial<ReportDraft> = {}): ReportDraft => ({
  reason: 'spam',
  details: 'Sells fake tickets.',
  email: 'reader@example.invalid',
  ...change,
});

afterEach(() => vi.unstubAllGlobals());

describe('report a published creation', () => {
  it('names every reason the API accepts', () => {
    expect(Object.keys(REPORT_REASON_LABELS).sort()).toEqual(
      ['copyright', 'harmful', 'illegal', 'other', 'spam'].sort(),
    );
  });

  it('sends the report and says so', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    expect(await submitReport(CRUX, draft(), send)).toEqual({ status: 'sent' });
    expect(send).toHaveBeenCalledWith(
      {
        cruxId: CRUX,
        reason: 'spam',
        details: 'Sells fake tickets.',
        email: 'reader@example.invalid',
      },
      undefined,
    );
  });

  it('leaves optional fields out rather than sending them blank', () => {
    expect(reportPayload(CRUX, draft({ details: '  ', email: '' }))).toEqual({
      cruxId: CRUX,
      reason: 'spam',
    });
  });

  it('a rate limit asks the visitor to try again later and keeps what they typed', async () => {
    const typed = draft();
    const copy = { ...typed };
    const outcome = await submitReport(
      CRUX,
      typed,
      vi.fn().mockRejectedValue(new PublicApiError(429)),
    );
    expect(outcome.status).toBe('rate-limited');
    expect(outcome).toMatchObject({ message: expect.stringMatching(/try again later/i) });
    expect(typed).toEqual(copy);
  });

  it('a failure is reported, never thrown, and keeps what they typed', async () => {
    const typed = draft({ details: 'x'.repeat(REPORT_DETAILS_MAX) });
    const copy = { ...typed };
    for (const error of [new PublicApiError(500), new TypeError('Failed to fetch')]) {
      const outcome = await submitReport(CRUX, typed, vi.fn().mockRejectedValue(error));
      expect(outcome.status).toBe('failed');
    }
    expect(typed).toEqual(copy);
  });

  it('refuses a missing reason, over-long details and a malformed address without sending', async () => {
    const send = vi.fn();
    expect(validateReport(draft({ reason: '' }))?.field).toBe('reason');
    expect(validateReport(draft({ details: 'x'.repeat(REPORT_DETAILS_MAX + 1) }))?.field).toBe(
      'details',
    );
    expect(validateReport(draft({ email: 'not-an-address' }))?.field).toBe('email');
    expect(validateReport(draft({ email: '', details: '' }))).toBeNull();
    expect((await submitReport(CRUX, draft({ reason: '' }), send)).status).toBe('invalid');
    expect(send).not.toHaveBeenCalled();
  });
});

describe('reportCrux', () => {
  it('POSTs JSON to /explore/reports and maps a refusal to its status', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    await reportCrux({ cruxId: CRUX, reason: 'copyright', details: 'Mine.' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/explore\/reports$/);
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('content-type')).toBe('application/json');
    expect(JSON.parse(String(init.body))).toEqual({
      cruxId: CRUX,
      reason: 'copyright',
      details: 'Mine.',
    });

    fetchMock.mockResolvedValue(new Response('', { status: 429 }));
    await expect(reportCrux({ cruxId: CRUX, reason: 'spam' })).rejects.toMatchObject({
      status: 429,
    });
  });
});
