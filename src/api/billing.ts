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
export async function checkout(
  planId: string,
  interval: BillingInterval,
): Promise<{ url: string }> {
  const { data } = await client.post<{ url: string }>('/billing/checkout', { planId, interval });
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

export function formatPrice(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency.toUpperCase(),
      minimumFractionDigits: amount % 100 === 0 ? 0 : 2,
    }).format(amount / 100);
  } catch {
    return `${(amount / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}
