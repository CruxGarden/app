import axios, { type InternalAxiosRequestConfig } from 'axios';
import {
  captureAuth,
  assertAuthCurrent,
  getStoredTokens,
  storeTokens,
  clearTokens,
  type AuthContext,
} from './session';

export { apiBaseUrl, normalizeApiUrl, apiUrlIsLaunched, DEFAULT_API_URL } from './connection';
export { getStoredTokens, storeTokens, clearTokens } from './session';

declare module 'axios' {
  interface AxiosRequestConfig {
    authContext?: AuthContext;
    skipAuthentication?: boolean;
    _retry?: boolean;
    _accessToken?: string | null;
  }
}

const client = axios.create({
  timeout: 15000,
  adapter: 'fetch',
  fetchOptions: { redirect: 'error' },
  withCredentials: false,
  headers: { 'Content-Type': 'application/json' },
});

client.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const context = config.authContext ?? captureAuth();
  config.authContext = context;
  assertAuthCurrent(context);
  // Only API-relative paths are accepted. Neither callers nor redirects may
  // turn this authenticated client into a request to another destination.
  const path = config.url ?? '';
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\'))
    throw new Error('API requests require a relative path.');
  const base = new URL(context.endpoint + '/');
  const destination = new URL(path.slice(1), base);
  if (destination.origin !== base.origin || !destination.pathname.startsWith(base.pathname))
    throw new Error('API requests must stay within the configured address.');
  config.baseURL = context.endpoint;
  config.fetchOptions = { ...config.fetchOptions, redirect: 'error' };
  config.headers.delete('Authorization');
  const tokens = config.skipAuthentication ? null : await getStoredTokens(context);
  assertAuthCurrent(context);
  config._accessToken = tokens?.accessToken ?? null;
  if (tokens?.accessToken) config.headers.set('Authorization', `Bearer ${tokens.accessToken}`);
  return config;
});

let refresh: { context: AuthContext; promise: Promise<void> } | undefined;
async function refreshSession(context: AuthContext, rejectedToken: string | null | undefined) {
  const tokens = await getStoredTokens(context);
  if (!tokens.refreshToken) throw new Error('Sign in to reconnect this account.');
  // Another rejected request may have already completed the rotation.
  if (tokens.accessToken !== rejectedToken) return;
  if (
    refresh?.context.endpoint === context.endpoint &&
    refresh.context.revision === context.revision
  )
    return refresh.promise;
  const pending = (async () => {
    try {
      const response = await client.post<{ accessToken: string; refreshToken: string }>(
        '/auth/token',
        { refreshToken: tokens.refreshToken },
        { authContext: context, skipAuthentication: true },
      );
      await storeTokens(response.data.accessToken, response.data.refreshToken, context);
    } catch (error) {
      assertAuthCurrent(context);
      // Offline, unavailable and locked storage are recoverable; retain the pair.
      if ((error as { response?: { status: number } }).response?.status === 401)
        await clearTokens(context);
      throw error;
    }
  })();
  const owner = { context, promise: pending };
  refresh = owner;
  try {
    await pending;
  } finally {
    if (refresh === owner) refresh = undefined;
  }
}

client.interceptors.response.use(
  (response) => {
    assertAuthCurrent(response.config.authContext!);
    return response;
  },
  async (error: unknown) => {
    if (!axios.isAxiosError(error) || !error.config) throw error;
    const original = error.config;
    const context = original.authContext;
    if (!context) throw error;
    assertAuthCurrent(context);
    if (error.response?.status !== 401 || original._retry || original.skipAuthentication)
      throw error;
    if (!original._accessToken) throw error;
    original._retry = true;
    await refreshSession(context, original._accessToken);
    assertAuthCurrent(context);
    return client(original);
  },
);
// Axios errors retain request bodies, headers and native Request objects. None
// of those belong in a UI error, log or telemetry payload.
client.interceptors.response.use(undefined, (error: unknown) => {
  if (!axios.isAxiosError(error)) throw error;
  const status = error.response?.status;
  const safe = new Error(
    status ? `API request failed (${status}).` : 'Could not reach the API. Please try again.',
  );
  if (status) Object.assign(safe, { response: { status } });
  throw safe;
});
export default client;
