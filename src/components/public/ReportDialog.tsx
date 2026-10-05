import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { REPORT_REASONS, type ReportReason } from '@/api/public';
import { Button, Input, Modal, Select, Textarea } from '@/components/ui';
import { LegalLink } from './LegalLinks';
import {
  EMPTY_REPORT,
  REPORT_DETAILS_MAX,
  REPORT_REASON_LABELS,
  submitReport,
  type ReportDraft,
  type ReportOutcome,
} from './report';

interface ReportDialogProps {
  open: boolean;
  onClose: () => void;
  cruxId: string;
  /** What is being reported, in the visitor's words: the creation's title. */
  title?: string;
}

/**
 * Report a published creation: a reason, optional details, an optional address
 * to answer. Whatever goes wrong, what the visitor typed stays in the form.
 */
export default function ReportDialog({ open, onClose, cruxId, title }: ReportDialogProps) {
  const [draft, setDraft] = useState<ReportDraft>(EMPTY_REPORT);
  const [outcome, setOutcome] = useState<ReportOutcome | null>(null);
  const [sending, setSending] = useState(false);
  const request = useRef<AbortController | null>(null);
  const id = useId();

  // A different creation is a different report; the same one keeps its draft
  // across closing and reopening until it has been sent.
  useEffect(() => {
    setDraft(EMPTY_REPORT);
    setOutcome(null);
  }, [cruxId]);
  useEffect(() => () => request.current?.abort(), []);

  const edit = (change: Partial<ReportDraft>) => {
    setDraft((current) => ({ ...current, ...change }));
    if (outcome?.status !== 'sent') setOutcome(null);
  };

  const close = () => {
    request.current?.abort();
    setSending(false);
    // A sent report is finished; anything else keeps the draft for another try.
    if (outcome?.status === 'sent') setDraft(EMPTY_REPORT);
    setOutcome(null);
    onClose();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (sending) return;
    const controller = new AbortController();
    request.current = controller;
    setSending(true);
    setOutcome(null);
    const result = await submitReport(cruxId, draft, undefined, controller.signal);
    if (controller.signal.aborted) return;
    setSending(false);
    setOutcome(result);
  };

  const invalid = outcome?.status === 'invalid' ? outcome : null;
  const sent = outcome?.status === 'sent';

  return (
    <Modal
      open={open}
      onClose={close}
      size="md"
      title="Report this creation"
      subtitle={title ? `“${title}”` : undefined}
    >
      {sent ? (
        <div className="space-y-4">
          <p role="status" className="text-sm text-text">
            Thank you. Your report was sent and will be reviewed.
          </p>
          <div className="flex justify-end">
            <Button size="sm" onClick={close} autoFocus>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <form
          onSubmit={(event) => void submit(event)}
          noValidate
          className="space-y-4 overflow-y-auto"
        >
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-reason`} className="text-xs text-text-muted">
              What is wrong with it?
            </label>
            <Select
              id={`${id}-reason`}
              value={draft.reason}
              autoFocus
              data-autofocus=""
              required
              aria-invalid={invalid?.field === 'reason' || undefined}
              aria-describedby={invalid?.field === 'reason' ? `${id}-error` : undefined}
              error={invalid?.field === 'reason' ? invalid.message : undefined}
              onChange={(event) => edit({ reason: event.target.value as ReportReason | '' })}
            >
              <option value="" disabled>
                Choose a reason
              </option>
              {REPORT_REASONS.map((reason) => (
                <option key={reason} value={reason}>
                  {REPORT_REASON_LABELS[reason]}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-details`} className="text-xs text-text-muted">
              Details (optional)
            </label>
            <Textarea
              id={`${id}-details`}
              rows={4}
              maxLength={REPORT_DETAILS_MAX}
              value={draft.details}
              aria-describedby={`${id}-count`}
              error={invalid?.field === 'details' ? invalid.message : undefined}
              onChange={(event) => edit({ details: event.target.value })}
            />
            <p id={`${id}-count`} className="text-xxs text-text-muted text-right">
              {draft.details.length.toLocaleString('en')} /{' '}
              {REPORT_DETAILS_MAX.toLocaleString('en')}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-email`} className="text-xs text-text-muted">
              Your email (optional, only used to answer this report)
            </label>
            <Input
              id={`${id}-email`}
              type="email"
              autoComplete="email"
              value={draft.email}
              error={invalid?.field === 'email' ? invalid.message : undefined}
              onChange={(event) => edit({ email: event.target.value })}
            />
          </div>

          {invalid?.field === 'reason' && (
            <p id={`${id}-error`} role="alert" className="text-xs text-error">
              {invalid.message}
            </p>
          )}
          {(outcome?.status === 'rate-limited' || outcome?.status === 'failed') && (
            <p role="alert" className="text-xs text-error">
              {outcome.message}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xxs text-text-muted">
              See what a report stores in <LegalLink to="/privacy">Privacy</LegalLink>.
            </p>
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" size="sm" loading={sending}>
                {outcome?.status === 'failed' || outcome?.status === 'rate-limited'
                  ? 'Send again'
                  : 'Send report'}
              </Button>
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}
