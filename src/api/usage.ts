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
export interface AccountUsage {
  period: { start: string; end: string };
  plan: Plan;
  storageBytes: number;
  bandwidthBytes: number;
  requests: number;
  cruxes: CruxUsage[];
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
