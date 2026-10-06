import { describe, it, expect } from 'vitest';
import {
  allowanceLines,
  attentionAction,
  formatMicrodollars,
  formatPrice,
  formatPlanPrice,
  isBillingUrl,
  offersTrial,
  scheduledEnd,
  taxLine,
  type CatalogPlan,
} from './billing';

describe('formatPrice', () => {
  it('formats USD cents in en-US regardless of the runner locale', () => {
    expect(formatPrice(500, 'usd')).toBe('$5');
    expect(formatPrice(1250, 'USD')).toBe('$12.50');
    expect(formatPrice(120000, 'usd')).toBe('$1,200');
  });
  it('falls back to a plain string for an unknown currency', () => {
    expect(formatPrice(500, 'not-a-currency')).toBe('5.00 NOT-A-CURRENCY');
  });
});

describe('isBillingUrl', () => {
  it('accepts Stripe hosted pages and our return pages', () => {
    expect(isBillingUrl('https://checkout.stripe.com/c/pay/cs_test_123')).toBe(true);
    expect(isBillingUrl('https://billing.stripe.com/p/session/abc')).toBe(true);
    expect(isBillingUrl('https://crux.garden/billing/success?session_id=cs_mock')).toBe(true);
    expect(isBillingUrl('https://billing.mock/portal')).toBe(true);
  });
  it('accepts the local API only over loopback http', () => {
    expect(isBillingUrl('http://localhost:3000/billing/return')).toBe(true);
    expect(isBillingUrl('http://127.0.0.1:3000/billing/return')).toBe(true);
    expect(isBillingUrl('http://checkout.stripe.com/x')).toBe(false);
  });
  it('refuses everything else', () => {
    expect(isBillingUrl('https://evil.example/checkout.stripe.com')).toBe(false);
    expect(isBillingUrl('https://checkout.stripe.com.evil.example/')).toBe(false);
    expect(isBillingUrl('javascript:alert(1)')).toBe(false);
    expect(isBillingUrl('file:///etc/passwd')).toBe(false);
    expect(isBillingUrl('not a url')).toBe(false);
  });
});

describe('plan price availability', () => {
  it('never substitutes a monthly price or Free for an unavailable yearly paid plan', () => {
    const entry = {
      plan: { id: 'gardener' },
      prices: [{ interval: 'month', priceId: 'monthly', amount: 500, currency: 'usd' }],
    } as CatalogPlan;
    expect(formatPlanPrice(entry, 'month')).toBe('$5/mo');
    expect(formatPlanPrice(entry, 'year')).toBe('Unavailable');
    expect(formatPlanPrice({ ...entry, prices: [] }, 'month')).toBe('Unavailable');
    expect(
      formatPlanPrice({ plan: { id: 'free' }, prices: [] } as unknown as CatalogPlan, 'year'),
    ).toBe('Free');
  });
});

describe('plan copy in plain units', () => {
  const plan = (included: CatalogPlan['includedCollaboration']) => ({
    includedCollaboration: included,
  });
  it('states the allowance in dollars and the thinking depth', () => {
    expect(
      allowanceLines(
        plan({ fiveHourMicrodollars: 750_000, thirtyDayMicrodollars: 4_000_000, effort: 'medium' }),
      ),
    ).toEqual([
      '$4 of included collaboration every 30 days, up to $0.75 in any 5 hours',
      'Balanced thinking on every reply',
    ]);
    expect(
      allowanceLines(
        plan({ fiveHourMicrodollars: 2_000_000, thirtyDayMicrodollars: 8_000_000, effort: 'high' }),
      )?.[1],
    ).toBe('Deeper thinking on every reply');
  });
  it('says nothing for a plan without, or a server that does not report, an allowance', () => {
    expect(allowanceLines(plan(null))).toBeNull();
    expect(allowanceLines(plan(undefined))).toBeNull();
  });
  it('floors microdollars to cents so an allowance is never overstated', () => {
    expect(formatMicrodollars(1_109_999)).toBe('$1.10');
    expect(formatMicrodollars(-5)).toBe('$0');
  });
  it('words tax by the catalog behaviour and stays silent when unknown', () => {
    expect(taxLine('inclusive')).toBe('Prices include tax.');
    expect(taxLine('exclusive')).toBe('Prices plus applicable tax.');
    expect(taxLine('automatic')).toBe('Prices plus applicable tax.');
    expect(taxLine(null)).toBeNull();
    expect(taxLine(undefined)).toBeNull();
  });
  it('offers a trial only when trials exist and the account is eligible', () => {
    expect(offersTrial({ trialDays: 0 })).toBe(false);
    expect(offersTrial({ trialDays: 14 })).toBe(true);
    expect(offersTrial({ trialDays: 14 }, { trialEligible: false })).toBe(false);
    expect(offersTrial({ trialDays: 14 }, { trialEligible: true })).toBe(true);
    // An older server that does not say keeps the catalog's answer.
    expect(offersTrial({ trialDays: 14 }, {})).toBe(true);
  });
  it('maps attention to the action that fixes it', () => {
    expect(attentionAction({ kind: 'unpaid', message: 'x', action: 'portal' })).toEqual({
      kind: 'portal',
      label: 'Manage billing',
    });
    expect(
      attentionAction({ kind: 'payment_incomplete', message: 'x', action: 'checkout' }),
    ).toEqual({ kind: 'checkout', label: 'Choose a plan' });
  });
  it('opens hosted invoices and their PDFs, but nothing that merely looks like them', () => {
    expect(isBillingUrl('https://invoice.stripe.com/i/acct_1/test_123')).toBe(true);
    expect(isBillingUrl('https://pay.stripe.com/invoice/acct_1/test_123/pdf')).toBe(true);
    expect(isBillingUrl('https://invoice.stripe.com.evil.example/')).toBe(false);
  });

  it('reads a scheduled end from endsAt, falling back to the period end', () => {
    const me = {
      plan: { id: 'gardener' } as never,
      cancelAtPeriodEnd: true,
      renewsAt: '2026-11-01T00:00:00Z',
      endsAt: '2026-10-20T00:00:00Z',
    };
    expect(scheduledEnd(me)).toBe('2026-10-20T00:00:00Z');
    expect(scheduledEnd({ ...me, endsAt: undefined })).toBe('2026-11-01T00:00:00Z');
    expect(scheduledEnd({ ...me, cancelAtPeriodEnd: false })).toBeNull();
    expect(scheduledEnd({ ...me, plan: { id: 'free' } as never })).toBeNull();
  });
});
