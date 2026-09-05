import client from './client';

/** Mirrors the API's DomainsModule (ADR 0011). */
export type DomainStatus = 'pending_dns' | 'issuing' | 'active' | 'failed';
export interface DnsRecord {
  type: 'CNAME' | 'TXT';
  name: string;
  value: string;
}
export interface CustomDomain {
  id: string;
  cruxId: string;
  hostname: string;
  status: DomainStatus;
  error: string | null;
  records: DnsRecord[];
  created: string;
  updated: string;
}

export async function list(cruxId: string): Promise<CustomDomain[]> {
  const { data } = await client.get<CustomDomain[]>(`/cruxes/${cruxId}/domains`);
  return data;
}

/** Body of POST /cruxes/:id/domains — asserted against the API contract in contract-check.ts. */
export interface AddDomainBody {
  hostname: string;
}
export async function add(cruxId: string, hostname: string): Promise<CustomDomain> {
  const body: AddDomainBody = { hostname };
  const { data } = await client.post<CustomDomain>(`/cruxes/${cruxId}/domains`, body);
  return data;
}

export async function verify(id: string): Promise<CustomDomain> {
  const { data } = await client.post<CustomDomain>(`/domains/${id}/verify`);
  return data;
}

export async function remove(id: string): Promise<void> {
  await client.delete(`/domains/${id}`);
}
