import client from './client';
import { assertAuthCurrent, captureAuth, getStoredTokens } from './session';

/** The parent holds account credentials; the relay uses a separate visitor session. */
export function publishedVisitorApi(cruxId: string, origin: string) {
  let cached: { revision: number; endpoint: string; token: string; until: number } | undefined;
  return async (path: string, method = 'GET', body?: unknown) => {
    const context = captureAuth();
    const account = await getStoredTokens(context);
    assertAuthCurrent(context);
    let token: string | undefined;
    if (account.accessToken) {
      if (
        !cached ||
        cached.revision !== context.revision ||
        cached.endpoint !== context.endpoint ||
        cached.until <= Date.now()
      ) {
        const { data } = await client.post<{ accessToken: string; expiresIn: number }>(
          `/published-auth/${encodeURIComponent(cruxId)}/session`,
          { origin },
          { authContext: context },
        );
        assertAuthCurrent(context);
        cached = {
          revision: context.revision,
          endpoint: context.endpoint,
          token: data.accessToken,
          until: Date.now() + (data.expiresIn - 30) * 1000,
        };
      }
      token = cached.token;
    } else cached = undefined;
    const response = await fetch(`${context.endpoint}${path}`, {
      method,
      credentials: 'omit',
      redirect: 'error',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    assertAuthCurrent(context);
    if (!response.ok) {
      if (response.status === 401) cached = undefined;
      throw new Error(`Published request failed (${response.status}).`);
    }
    if (response.status === 204) return null;
    return response.headers.get('Content-Type')?.includes('application/json')
      ? response.json()
      : response.text();
  };
}
