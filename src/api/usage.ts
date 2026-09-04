import client from './client';

/** Mirrors the API's UsageModule (ADR 0011). */
export interface Plan {
  id: string;
  name: string;
  storageBytes: number;
  bandwidthBytesPerPeriod: number;
}
export interface CruxUsage {
  cruxId: string;
  title?: string;
  storageBytes: number;
  files: number;
  bandwidthBytes: number;
  requests: number;
}
export interface SyncObjectUsage {
  kind: 'garden' | 'crux';
  id: string;
  title: string | null;
  bytes: number;
  updated: string;
}
export interface SyncUsage {
  storageBytes: number;
  gardenBytes: number;
  gardenSyncedAt: string | null;
  cruxBytes: number;
  cruxCount: number;
  transferBytes: number;
  uploadBytes: number;
  downloadBytes: number;
  uploads: number;
  downloads: number;
  objects: SyncObjectUsage[];
}
export interface BudgetLine {
  limit: number;
  used: number;
  softLimit: number;
  over: boolean;
  overSoft: boolean;
}
export interface ReconciliationView {
  day: string;
  status: 'ok' | 'gap' | 'nodata';
  meteredBytes: number;
  edgeBytes: number | null;
  gapPct: number | null;
  checkedAt: string;
}
export interface PeriodView {
  period: { start: string; end: string };
  planId: string;
  storageBytes: number;
  publishStorageBytes: number;
  syncStorageBytes: number;
  bandwidthBytes: number;
  publishBandwidthBytes: number;
  syncTransferBytes: number;
  requests: number;
  storageLimit: number;
  bandwidthLimit: number;
  overStorage: boolean;
  overBandwidth: boolean;
  reconciliationStatus: string | null;
  finalizedAt: string;
}
export interface AccountUsage {
  period: { start: string; end: string };
  plan: Plan;
  /** when this period's numbers stop moving (period end + grace) */
  settlement: { finalizesAt: string; isFinal: boolean; graceHours: number };
  budgets: { storage: BudgetLine; bandwidth: BudgetLine };
  reconciliation: ReconciliationView | null;
  /** totals against the plan: publish + sync */
  storageBytes: number;
  bandwidthBytes: number;
  requests: number;
  publish: { storageBytes: number; bandwidthBytes: number; requests: number };
  cruxes: CruxUsage[];
  sync: SyncUsage;
  bandwidthAsOf: string | null;
}

export async function me(): Promise<AccountUsage> {
  const { data } = await client.get<AccountUsage>('/usage/me');
  return data;
}

export async function forCrux(cruxId: string): Promise<CruxUsage> {
  const { data } = await client.get<CruxUsage>(`/cruxes/${cruxId}/usage`);
  return data;
}

export async function periods(): Promise<PeriodView[]> {
  const { data } = await client.get<PeriodView[]>('/usage/periods');
  return data;
}
