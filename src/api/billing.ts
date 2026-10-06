import client from './client';
import type { Plan } from './usage';

/** Mirrors the API's BillingModule (ADR 0012, Stripe). */
export type BillingInterval = 'month' | 'year';

/** What a paid plan includes of the included collaborator (API policy.ts). */
export interface IncludedCollaboration {
  fiveHourMicrodollars: number;
  thirtyDayMicrodollars: number;
  effort: 'low' | 'medium' | 'high';
}
export type CatalogPlanDetails = Plan & { blurb?: string };
/** Something about the subscription needs the person: a failed or unfinished payment. */
export interface BillingAttention {
  kind: 'payment_failed' | 'payment_incomplete' | 'unpaid';
  message: string;
  action: 'portal' | 'checkout';
}
export interface Invoice {
  id: string;
  number: string | null;
  date: string;
  totalCents: number;
  currency: string;
  status: string;
  hostedUrl: string | null;
  pdfUrl: string | null;
}

export interface BillingMe {
  plan: CatalogPlanDetails;
  status: string;
  interval: BillingInterval | null;
  renewsAt: string | null;
  cancelAtPeriodEnd: boolean;
  trialEndsAt: string | null;
  graceEndsAt: string | null;
  pendingCheckout: boolean;
  canManage: boolean;
  provider: string;
  canSimulate?: boolean;
  canMonitor?: boolean;
  /** null when nothing needs attention; absent on an older server. */
  attention?: BillingAttention | null;
  /** Whether a new checkout would start with a trial; absent means unknown. */
  trialEligible?: boolean;
  /** When a scheduled cancellation (cancel_at or period end) takes effect. */
  endsAt?: string | null;
}

/** Statuses after which a new checkout is the way back to a paid plan. */
export const ENDED_STATUSES: readonly string[] = ['none', 'canceled', 'incomplete_expired'];

/** The date a scheduled cancellation takes effect, or null when none is scheduled. */
export function scheduledEnd(
  me: Pick<BillingMe, 'plan' | 'cancelAtPeriodEnd' | 'renewsAt' | 'endsAt'>,
): string | null {
  if (me.plan.id === 'free' || !me.cancelAtPeriodEnd) return null;
  return me.endsAt ?? me.renewsAt ?? null;
}

/** GET /account's suspension fields; absent on an older server. */
export interface AccountStanding {
  suspended?: boolean;
  suspendedReason?: string | null;
}
export async function accountStanding(): Promise<AccountStanding> {
  const { data } = await client.get<AccountStanding>('/account');
  return { suspended: data?.suspended === true, suspendedReason: data?.suspendedReason ?? null };
}

export interface CatalogPrice {
  interval: BillingInterval;
  priceId: string;
  amount: number;
  currency: string;
}
export interface CatalogPlan {
  plan: CatalogPlanDetails;
  prices: CatalogPrice[];
  /** Absent on an older server; null on plans without included collaboration. */
  includedCollaboration?: IncludedCollaboration | null;
}
export type TaxBehavior = 'exclusive' | 'inclusive' | 'automatic' | null;
export interface Catalog {
  plans: CatalogPlan[];
  trialDays: number;
  provider: string;
  instant: boolean;
  /** How listed prices relate to tax; absent on an older server. */
  taxBehavior?: TaxBehavior;
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
export type PaidPlanId = 'gardener' | 'gardener_plus';
const PAID_PLAN_IDS: readonly PaidPlanId[] = ['gardener', 'gardener_plus'];
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
export async function resumeCheckout(): Promise<{ url: string }> {
  const { data } = await client.post<{ url: string }>('/billing/checkout/resume');
  return data;
}
export async function cancelCheckout(): Promise<BillingMe> {
  const { data } = await client.post<BillingMe>('/billing/checkout/cancel');
  return data;
}
export async function portal(): Promise<{ url: string }> {
  const { data } = await client.post<{ url: string }>('/billing/portal');
  return data;
}
/** Most recent first. An older server without the route answers 404: no list. */
export async function invoices(): Promise<Invoice[]> {
  const { data } = await client.get<Invoice[]>('/billing/invoices');
  return Array.isArray(data) ? data : [];
}
export async function sync(): Promise<BillingMe> {
  const { data } = await client.post<BillingMe>('/billing/sync');
  return data;
}

export type SimulationAction =
  | 'activate'
  | 'payment_failed'
  | 'unpaid'
  | 'cancel'
  | 'cancel_at_period_end'
  | 'renew'
  | 'change_plan';
export async function simulate(
  action: SimulationAction,
  planId?: string,
  interval?: BillingInterval,
): Promise<BillingMe> {
  const { data } = await client.post<BillingMe>('/billing/simulation', {
    action,
    planId,
    interval,
  });
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
  // Hosted invoice pages and their PDFs (Settings → Plan → Invoices)
  'invoice.stripe.com',
  'pay.stripe.com',
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

/** A missing paid price is unavailable, never a free offer or another interval. */
export function formatPlanPrice(entry: CatalogPlan, interval: BillingInterval): string {
  if (entry.plan.id === 'free') return 'Free';
  const price = entry.prices.find((candidate) => candidate.interval === interval);
  if (!price) return 'Unavailable';
  return `${formatPrice(price.amount, price.currency)}/${interval === 'year' ? 'yr' : 'mo'}`;
}

/** Dollars from microdollars, in plain US currency: $4, $0.75, $1.10. */
export function formatMicrodollars(microdollars: number): string {
  const cents = Math.max(0, Math.floor(microdollars / 10_000));
  return formatPrice(cents, 'usd');
}

/** How deeply the included collaborator thinks on a plan, in plain words. */
export function effortLabel(effort: IncludedCollaboration['effort']): string {
  return effort === 'high'
    ? 'Deeper thinking on every reply'
    : effort === 'medium'
      ? 'Balanced thinking on every reply'
      : 'Quick, lighter thinking';
}

/**
 * What a plan buys of included collaboration, in plain units. Null when the
 * plan has none or the server does not say (an older API).
 */
export function allowanceLines(entry: Pick<CatalogPlan, 'includedCollaboration'>): string[] | null {
  const included = entry.includedCollaboration;
  if (!included) return null;
  return [
    `${formatMicrodollars(included.thirtyDayMicrodollars)} of included collaboration every 30 days, up to ${formatMicrodollars(included.fiveHourMicrodollars)} in any 5 hours`,
    effortLabel(included.effort),
  ];
}

/** The tax line beneath prices; null when the catalog does not say. */
export function taxLine(behavior: TaxBehavior | undefined): string | null {
  if (behavior === 'inclusive') return 'Prices include tax.';
  if (behavior === 'exclusive' || behavior === 'automatic') return 'Prices plus applicable tax.';
  return null;
}

/** Whether to offer a trial: a signed-in account only when eligible; a visitor when trials exist. */
export function offersTrial(
  catalog: Pick<Catalog, 'trialDays'>,
  me?: Pick<BillingMe, 'trialEligible'> | null,
): boolean {
  if (!(catalog.trialDays > 0)) return false;
  if (!me) return true;
  return me.trialEligible !== false;
}

/** The button an attention notice leads to. */
export function attentionAction(attention: BillingAttention): {
  kind: 'portal' | 'checkout';
  label: string;
} {
  return attention.action === 'portal'
    ? { kind: 'portal', label: 'Manage billing' }
    : { kind: 'checkout', label: 'Choose a plan' };
}

/** Admin diagnostics deliberately omit email, payment URLs and provider payloads. */
export interface BillingHealth {
  provider: string;
  emailDelivery: 'ses' | 'logging';
  scheduler: { enabled: boolean; running: boolean; lastRun: string | null; lastRunFailed: boolean };
  prices: { available: boolean; missing: { planId: string; interval: string }[] | null };
  counters: {
    failed: number;
    stale: number;
    unchecked: number;
    due: number;
    webhookFailures: number;
    pendingCheckouts: number;
    ambiguousCheckouts: number;
    closingAccounts: number;
    pendingNotifications: number;
    failedNotifications: number;
    latestCompletedWebhook: string | null;
  };
  problems: {
    accounts: { account_id: string; failure_code: string }[];
    deliveries: unknown[];
    checkouts: unknown[];
  };
}
export async function operations(): Promise<BillingHealth> {
  return (await client.get<BillingHealth>('/billing/operations')).data;
}
export async function reconcileAccount(
  accountId: string,
): Promise<{ status: 'busy' | 'failed' | 'verified' }> {
  return (
    await client.post<{ status: 'busy' | 'failed' | 'verified' }>('/billing/operations/reconcile', {
      accountId,
    })
  ).data;
}
