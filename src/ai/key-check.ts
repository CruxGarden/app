import { PROVIDERS } from './providers';

/**
 * Does the provider accept this key? (EF07) Asked once, when a key is saved:
 *
 *   valid      the provider answered the listing
 *   refused    the provider said the key itself is wrong or revoked
 *   unchecked  nothing could be learned — offline, a timeout, a busy provider,
 *              a key scoped away from listing models, or a provider with no check
 *
 * Saving never waits on this and never depends on it. The key travels in a
 * request header to the provider it belongs to and appears in no log or error.
 */
export type KeyCheckResult = 'valid' | 'refused' | 'unchecked';

const TIMEOUT_MS = 8000;

export async function checkApiKey(
  providerId: string,
  apiKey: string,
  options: { fetch?: typeof fetch; signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<KeyCheckResult> {
  const check = PROVIDERS[providerId]?.keyCheck;
  if (!check || !apiKey) return 'unchecked';
  const send = options.fetch ?? globalThis.fetch;
  if (!send) return 'unchecked';
  const timeout = AbortSignal.timeout(options.timeoutMs ?? TIMEOUT_MS);
  try {
    const response = await send(check.url, {
      method: 'GET',
      headers: check.headers(apiKey),
      signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
      cache: 'no-store',
      credentials: 'omit',
    });
    if (response.ok) return 'valid';
    if (response.status === 401) return 'refused';
    // Google answers a malformed or unknown key with 400 API_KEY_INVALID. A 403
    // anywhere is a real key without this permission — not a refusal of the key.
    if (response.status === 400) {
      const body = await response.text().catch(() => '');
      if (/API_KEY_INVALID|API key not valid/i.test(body)) return 'refused';
    }
    return 'unchecked';
  } catch {
    return 'unchecked';
  }
}

/** The line shown under the key field for each state of the check. */
export function keyCheckMessage(state: 'checking' | KeyCheckResult, providerName: string): string {
  switch (state) {
    case 'checking':
      return 'Saved. Checking this key…';
    case 'valid':
      return `Saved. ${providerName} accepted this key.`;
    case 'refused':
      return `This key was refused by ${providerName}. It is saved; replace it with a working key.`;
    case 'unchecked':
      return 'Could not check this key (you may be offline). Saved anyway.';
  }
}
