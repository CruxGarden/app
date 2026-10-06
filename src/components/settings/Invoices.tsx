import * as billingApi from '@/api/billing';
import { useInvoices } from '@/hooks/useInvoices';
import { SectionLabel } from '@/components/ui';
import { linkClass } from '@/components/ui/button-class';
import { formatDate } from '@/lib/format';
import { openWeb } from '@/services/desktop';

const STATUS: Record<string, string> = {
  paid: 'Paid',
  open: 'Due',
  void: 'Void',
  uncollectible: 'Unpaid',
  draft: 'Draft',
};

/** Hosted invoice links open in the system browser, only on known billing hosts. */
function open(url: string | null) {
  if (url && billingApi.isBillingUrl(url)) void openWeb(url);
}

export function InvoiceList({ invoices }: { invoices: billingApi.Invoice[] }) {
  return (
    <ul className="flex flex-col text-xxs" data-testid="invoice-list">
      {invoices.map((invoice) => (
        <li
          key={invoice.id}
          className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-1.5 border-t border-border/(--tint-medium) first:border-t-0"
        >
          <span className="text-text">
            {formatDate(invoice.date)}
            {invoice.number ? (
              <span className="font-mono text-text-muted"> · {invoice.number}</span>
            ) : null}
          </span>
          <span className="flex items-baseline gap-3 font-mono text-text-muted">
            <span>{billingApi.formatPrice(invoice.totalCents, invoice.currency)}</span>
            <span>{STATUS[invoice.status] ?? invoice.status}</span>
            {invoice.hostedUrl && billingApi.isBillingUrl(invoice.hostedUrl) && (
              <button type="button" className={linkClass()} onClick={() => open(invoice.hostedUrl)}>
                View
              </button>
            )}
            {invoice.pdfUrl && billingApi.isBillingUrl(invoice.pdfUrl) && (
              <button type="button" className={linkClass()} onClick={() => open(invoice.pdfUrl)}>
                PDF
              </button>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Settings → Plan → Invoices. Nothing at all until there is an invoice to show. */
export default function Invoices({ accountId }: { accountId: string }) {
  const state = useInvoices(accountId);
  if (state.status === 'loading') return null;
  if (state.status === 'unavailable')
    return (
      <p className="text-xxs text-text-muted mt-3" data-testid="invoices">
        Invoices are unavailable right now. Manage billing also lists them.
      </p>
    );
  if (state.invoices.length === 0) return null;
  return (
    <section className="mt-4 flex flex-col gap-1" aria-label="Invoices" data-testid="invoices">
      <SectionLabel as="h3">Invoices</SectionLabel>
      <InvoiceList invoices={state.invoices} />
    </section>
  );
}
