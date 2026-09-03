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
export interface AccountUsage {
  period: { start: string; end: string };
  plan: Plan;
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
