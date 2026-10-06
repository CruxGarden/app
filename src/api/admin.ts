/**
 * Host moderation (CR08, ADR 0081 / 0083): reports, takedowns and account
 * suspension. Every route is admin-only; the API answers 403 to anyone else.
 */
import client from './client';

export interface ReportSummary {
  open: number;
  resolvedLast30d: number;
  takenDown: number;
}

export type ReportStatus = 'open' | 'resolved' | 'dismissed';

export interface AdminReport {
  id: string;
  cruxId: string;
  authorId?: string;
  cruxSlug?: string;
  cruxTitle?: string;
  reason: string;
  details?: string;
  reporterEmail?: string;
  status: ReportStatus;
  resolutionNote?: string;
  created: string;
}

export interface Takedown {
  id: string;
  cruxId: string;
  reason: string;
  reportId?: string;
  lifted?: string | null;
  created: string;
}

export interface AdminAccount {
  id: string;
  email: string;
  username: string | null;
  role: string;
  created: string | null;
  suspended: string | null;
  suspendedReason: string | null;
}

export async function reportSummary(): Promise<ReportSummary> {
  return (await client.get<ReportSummary>('/admin/reports/summary')).data;
}

export async function reports(status: ReportStatus = 'open'): Promise<AdminReport[]> {
  return (await client.get<AdminReport[]>('/admin/reports', { params: { status, perPage: 50 } }))
    .data;
}

export async function updateReport(
  id: string,
  status: ReportStatus,
  resolutionNote?: string,
): Promise<AdminReport> {
  return (
    await client.patch<AdminReport>(`/admin/reports/${id}`, {
      status,
      ...(resolutionNote ? { resolutionNote } : {}),
    })
  ).data;
}

export async function takedowns(): Promise<Takedown[]> {
  return (await client.get<Takedown[]>('/admin/takedowns', { params: { active: 'true' } })).data;
}

export async function takeDown(cruxId: string, reason: string, reportId?: string) {
  return (
    await client.post<Takedown>('/admin/takedowns', {
      cruxId,
      reason,
      ...(reportId ? { reportId } : {}),
    })
  ).data;
}

export async function liftTakedown(cruxId: string): Promise<Takedown> {
  return (await client.delete<Takedown>(`/admin/takedowns/${cruxId}`)).data;
}

export async function searchAccounts(query: string): Promise<AdminAccount[]> {
  return (await client.get<AdminAccount[]>('/admin/accounts', { params: { query } })).data;
}

export async function suspendAccount(id: string, reason: string): Promise<AdminAccount> {
  return (await client.post<AdminAccount>(`/admin/accounts/${id}/suspend`, { reason })).data;
}

export async function unsuspendAccount(id: string): Promise<AdminAccount> {
  return (await client.post<AdminAccount>(`/admin/accounts/${id}/unsuspend`, {})).data;
}

/** True for the API's "you are not an admin" (and "not signed in") answers. */
export function isForbidden(error: unknown): boolean {
  const status = (error as { response?: { status?: number } })?.response?.status;
  return status === 401 || status === 403;
}

/** Who may see the operator screen: the API decides; the role only spares a request. */
export function operatorAccess(
  authenticated: boolean,
  role: string | null | undefined,
): 'denied' | 'check' {
  return authenticated && role === 'admin' ? 'check' : 'denied';
}
