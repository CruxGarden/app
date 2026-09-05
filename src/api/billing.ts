import client from './client';
import type { Plan } from './usage';

/** Mirrors the API's BillingModule (ADR 0012, Stripe). */
export type BillingInterval = 'month' | 'year';

export interface BillingMe {
  plan: Plan & { blurb?: string };
  status: string;
  interval: BillingInterval | null;
  renewsAt: string | null;
  cancelAtPeriodEnd: boolean;
  trialEndsAt: string | null;
  canManage: boolean;
  provider: string;
}

export interface CatalogPrice {
  interval: BillingInterval;
  priceId: string;
  amount: number;
  currency: string;
}
export interface CatalogPlan {
  plan: Plan & { blurb?: string };
  prices: CatalogPrice[];
}
export interface Catalog {
  plans: CatalogPlan[];
  trialDays: number;
  provider: string;
  instant: boolean;
}

export async function plans(): Promise<Catalog> {
  const { data } = await client.get<Catalog>('/billing/plans');
  return data;
}
export async function me(): Promise<BillingMe> {
  const { data } = await client.get<BillingMe>('/billing/me');
  return data;
}
/** The plans that can be bought; mirrors the API's enum (contract-check.ts keeps them equal). */
export type PaidPlanId = 'grower';
const PAID_PLAN_IDS: readonly PaidPlanId[] = ['grower'];
/** Body of POST /billing/checkout — asserted against the API contract in contract-check.ts. */
export interface CheckoutBody {
  planId: PaidPlanId;
  interval: BillingInterval;
}
export async function checkout(
  planId: string,
  interval: BillingInterval,
): Promise<{ url: string }> {
  if (!(PAID_PLAN_IDS as readonly string[]).includes(planId))
    throw new Error(`"${planId}" is not a plan you can buy`);
  const body: CheckoutBody = { planId: planId as PaidPlanId, interval };
  const { data } = await client.post<{ url: string }>('/billing/checkout', body);
  return data;
}
export async function portal(): Promise<{ url: string }> {
  const { data } = await client.post<{ url: string }>('/billing/portal');
  return data;
}
export async function sync(): Promise<BillingMe> {
  const { data } = await client.post<BillingMe>('/billing/sync');
  return data;
}

/**
 * Hosts a checkout/portal URL from the API may point at before we hand it to
 * the system browser: Stripe's hosted pages, our own return pages, and the
 * mock provider's stand-ins (nursery + desktop e2e). Anything else is refused —
 * the URL comes from a server response, not from the user.
 */
const BILLING_HOSTS = new Set([
  'checkout.stripe.com',
  'billing.stripe.com',
  'crux.garden',
  'www.crux.garden',
  'billing.mock',
]);

export function isBillingUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const host = parsed.hostname.toLowerCase();
  if (parsed.protocol === 'https:') return BILLING_HOSTS.has(host);
  // Local API in development (mock provider) returns http:// on loopback
  if (parsed.protocol === 'http:') return host === 'localhost' || host === '127.0.0.1';
  return false;
}

/** Prices are USD cents; format in en-US so tests and users see the same string. */
export function formatPrice(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
      minimumFractionDigits: amount % 100 === 0 ? 0 : 2,
    }).format(amount / 100);
  } catch {
    return `${(amount / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}
