import { describe, it, expect } from 'vitest';
import { formatPrice, formatPlanPrice, isBillingUrl, type CatalogPlan } from './billing';

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
