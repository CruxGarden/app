/**
 * What a person should know before installing a community Tool: who
 * publishes it, which version, how large, where it comes from (credit to the
 * upstream project), its licence, that it runs in a sandbox, and what it asks
 * for. The API adds `toolSummary` to Explore rows and public tool pages; a
 * built-in tool keeps the upstream credit its manifest carries.
 */

export interface ToolSummary {
  name: string;
  version?: string;
  publisher: string;
  upstreamUrl?: string;
  license?: string;
  sizeBytes?: number;
  permissions?: string[];
  sandboxed: true;
}

/** Read `toolSummary` from a listing (top level, or under meta), tolerating its absence. */
export function toolSummaryOf(crux: {
  toolSummary?: unknown;
  meta?: Record<string, unknown> | null;
  author_username?: string;
}): ToolSummary | null {
  const raw = (crux.toolSummary ?? crux.meta?.toolSummary) as Partial<ToolSummary> | undefined;
  if (!raw || typeof raw !== 'object' || typeof raw.name !== 'string') return null;
  const publisher =
    typeof raw.publisher === 'string' && raw.publisher ? raw.publisher : crux.author_username;
  if (!publisher) return null;
  return {
    name: raw.name,
    publisher,
    sandboxed: true,
    ...(typeof raw.version === 'string' && raw.version ? { version: raw.version } : {}),
    ...(typeof raw.upstreamUrl === 'string' && /^https:\/\//.test(raw.upstreamUrl)
      ? { upstreamUrl: raw.upstreamUrl }
      : {}),
    ...(typeof raw.license === 'string' && raw.license ? { license: raw.license } : {}),
    ...(typeof raw.sizeBytes === 'number' && raw.sizeBytes >= 0
      ? { sizeBytes: raw.sizeBytes }
      : {}),
    ...(Array.isArray(raw.permissions)
      ? { permissions: raw.permissions.filter((p): p is string => typeof p === 'string') }
      : {}),
  };
}

export function formatToolSize(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return '';
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** The API's fixed permission vocabulary (ADR 0084), in plain words. */
export const PERMISSION_LABELS: Record<string, string> = {
  document: 'its own document in the Crux',
  'file-drops': 'files you drop into the Crux',
  'public-edition': 'a public edition when you share',
};

export interface TrustRow {
  label: string;
  value: string;
  href?: string;
}

/** The facts as label/value rows, in reading order; empty facts are left out. */
export function trustRows(summary: ToolSummary): TrustRow[] {
  const rows: TrustRow[] = [
    { label: 'Publisher', value: `@${summary.publisher.replace(/^@/, '')}` },
  ];
  if (summary.version) rows.push({ label: 'Version', value: summary.version });
  if (summary.sizeBytes !== undefined)
    rows.push({ label: 'Size', value: formatToolSize(summary.sizeBytes) });
  if (summary.upstreamUrl)
    rows.push({
      label: 'Built on',
      value: summary.upstreamUrl.replace(/^https:\/\//, '').replace(/\/$/, ''),
      href: summary.upstreamUrl,
    });
  if (summary.license) rows.push({ label: 'Licence', value: summary.license });
  rows.push({
    label: 'Can use',
    value: summary.permissions?.length
      ? summary.permissions.map((p) => PERMISSION_LABELS[p] ?? p).join(', ')
      : 'Nothing beyond its own editor',
  });
  return rows;
}

/** The sentence that goes with every Tool's details. */
export const SANDBOX_NOTE = 'Runs in a sandbox.';
