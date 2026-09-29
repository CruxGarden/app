import { SettingsKey } from '@/lib/constants';
import { getSetting } from '@/services/settings';

/** The API the build was made for (crux.garden in production). */
export const DEFAULT_API_URL: string = import.meta.env.VITE_API_URL || 'http://localhost:3000';

/**
 * The API this garden talks to — a garden setting, not a build constant
 * (ADR 0049's first step): the address the shell was launched with
 * (CRUX_API_URL, a mock API in the e2e suite or a deliberate override) wins,
 * then the address chosen in Settings → Connection, then the build's default.
 * Read at every call, so changing it in Settings takes effect at once.
 */
export function apiBaseUrl(): string {
  const launched = typeof window !== 'undefined' ? window.electronAPI?.config?.apiUrl : null;
  if (launched) return checkedApiUrl(launched);
  const chosen = normalizeApiUrl(getSetting(SettingsKey.ApiUrl));
  return checkedApiUrl(chosen || DEFAULT_API_URL);
}

/** Trims and drops a trailing slash; null or blank means the default. */
export function normalizeApiUrl(value: string | null | undefined): string | null {
  const v = (value ?? '').trim().replace(/\/+$/, '');
  return v ? v : null;
}

/** True when the address came with the launch (an e2e mock API) and cannot be changed in Settings. */
export function apiUrlIsLaunched(): boolean {
  return typeof window !== 'undefined' && !!window.electronAPI?.config?.apiUrl;
}

/** Canonical endpoints never contain userinfo, query strings or fragments. */
function checkedApiUrl(value: string): string {
  const url = new URL(value);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error('Use an HTTP or HTTPS API address without credentials, query or fragment.');
  return url.href.replace(/\/+$/, '');
}
