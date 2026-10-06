import { SettingsKey } from '@/lib/constants';
import { onSettingChange } from '@/services/settings';
import { getSecret, setSecret, deleteSecret } from '@/services/secrets';
import { createKeyedQueue } from '@/lib/keyed-queue';
import { apiBaseUrl } from './connection';

export interface AuthContext {
  endpoint: string;
  revision: number;
}
interface Session {
  endpoint: string;
  accessToken: string;
  refreshToken: string;
}

let revision = 0;
let selectedEndpoint: string | undefined;
let session: Session | null | undefined;
const serialize = createKeyedQueue();
onSettingChange((key) => {
  if (key === SettingsKey.ApiUrl) revision++;
});

/** Capture before starting work; switching away and back also invalidates it. */
export function captureAuth(): AuthContext {
  const endpoint = apiBaseUrl();
  if (selectedEndpoint !== endpoint) {
    selectedEndpoint = endpoint;
    revision++;
  }
  return { endpoint, revision };
}
export function assertAuthCurrent(context: AuthContext): void {
  const current = captureAuth();
  if (current.endpoint !== context.endpoint || current.revision !== context.revision)
    throw new Error('The account connection changed. Please try again.');
}
export function beginAuthentication(): AuthContext {
  revision++;
  return captureAuth();
}
function nativeStorage(): boolean {
  if (typeof window === 'undefined' || !window.electronAPI) return false;
  if (!window.electronAPI.secrets) throw new Error('Secure credential storage is unavailable.');
  return true;
}
function forgetUnboundTokens(): void {
  localStorage.removeItem(SettingsKey.AccessToken);
  localStorage.removeItem(SettingsKey.RefreshToken);
}

/** One encrypted record acknowledges the pair and its destination together.
 * Public browser sessions are memory-only. Unbound old tokens are never used.
 */
export async function getStoredTokens(context = captureAuth()) {
  return serialize('session', async () => {
    assertAuthCurrent(context);
    if (session === undefined) {
      const raw = nativeStorage() ? await getSecret(SettingsKey.AuthSession) : null;
      let parsed: Session | null = null;
      if (raw !== null) {
        try {
          const value: unknown = JSON.parse(raw);
          if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
          const s = value as Session;
          if (
            !s.endpoint ||
            typeof s.endpoint !== 'string' ||
            !s.accessToken ||
            typeof s.accessToken !== 'string' ||
            !s.refreshToken ||
            typeof s.refreshToken !== 'string'
          )
            throw new Error();
          parsed = {
            endpoint: s.endpoint,
            accessToken: s.accessToken,
            refreshToken: s.refreshToken,
          };
        } catch {
          throw new Error(
            'Cannot read the saved account connection. Restore credential storage or sign in again.',
          );
        }
      }
      session = parsed;
    }
    assertAuthCurrent(context);
    return session?.endpoint === context.endpoint
      ? { accessToken: session.accessToken, refreshToken: session.refreshToken }
      : { accessToken: null, refreshToken: null };
  });
}

export async function storeTokens(
  accessToken: string,
  refreshToken: string,
  context = beginAuthentication(),
): Promise<void> {
  if (
    typeof accessToken !== 'string' ||
    !accessToken ||
    typeof refreshToken !== 'string' ||
    !refreshToken
  )
    throw new Error('The server returned incomplete account credentials.');
  return serialize('session', async () => {
    assertAuthCurrent(context);
    const next = { endpoint: context.endpoint, accessToken, refreshToken };
    if (nativeStorage()) await setSecret(SettingsKey.AuthSession, JSON.stringify(next));
    session = next;
    forgetUnboundTokens();
    assertAuthCurrent(context);
  });
}

export async function clearTokens(context = captureAuth()): Promise<void> {
  assertAuthCurrent(context);
  // Invalidate outstanding login/refresh work before the asynchronous disk write.
  revision++;
  return serialize('session', async () => {
    if (nativeStorage()) await deleteSecret(SettingsKey.AuthSession);
    session = null;
    forgetUnboundTokens();
  });
}
