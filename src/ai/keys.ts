import { useIncludedAccess } from '@/services/included-access';
import type { Crux } from '@/api/types';
import { getStoredTokens } from '@/api/client';
import { SettingsKey, API_KEY_PREFIX } from '@/lib/constants';
import { resolveModel } from './providers';
import { LOCAL_API_KEY } from './local';
import { getSetting, setSetting } from '@/services/settings';
import { getSecret, setSecret, deleteSecret } from '@/services/secrets';

/** Get an API key from the encrypted native store. */
export async function getApiKey(providerId: string): Promise<string | null> {
  if (providerId === 'included')
    return (await getStoredTokens()).accessToken ? 'included-session' : null;
  // Local inference authenticates nothing — never blocks on a missing key
  if (providerId === 'ollama' || providerId === 'lmstudio') return LOCAL_API_KEY;

  return getSecret(API_KEY_PREFIX + providerId);
}

/** Save an API key to the platform secret store */
export async function setApiKey(providerId: string, apiKey: string): Promise<void> {
  await setSecret(API_KEY_PREFIX + providerId, apiKey);
}

/** Remove an API key from the platform secret store */
export async function removeApiKey(providerId: string): Promise<void> {
  await deleteSecret(API_KEY_PREFIX + providerId);
}

/** Resolve implicit choices; an explicit per-Crux selection never follows account changes. */
export function defaultModelNow(): string {
  const access = useIncludedAccess.getState();
  const included = access.usage
    ? access.usage.eligible
    : access.accountId && access.status !== 'ready';
  return resolveModel(
    getSetting(SettingsKey.DefaultModel) || (included ? 'garden-included' : null),
  );
}
/** Losing subscription/session access must not move an included conversation to BYOK. */
export function automaticModel(storedModel?: string): string {
  if (!getSetting(SettingsKey.DefaultModel) && storedModel === 'garden-included')
    return 'garden-included';
  return defaultModelNow();
}
export function cruxModel(crux: Crux | null): string {
  return !crux?.meta?.settings?.model || crux.meta.settings.modelAutomatic === true
    ? automaticModel(crux?.meta?.settings?.model)
    : resolveModel(crux?.meta?.settings?.model);
}
/** Get the default model from settings, or verified subscription access. */
export async function getDefaultModel(): Promise<string> {
  const chosen = getSetting(SettingsKey.DefaultModel);
  if (chosen) return resolveModel(chosen);
  const { refreshIncludedAccess } = await import('@/services/included-access');
  // Creation stays local and immediate even while the account service is offline.
  // Unknown signed-in access stays on the included route until verification completes.
  void refreshIncludedAccess();
  return defaultModelNow();
}

/** Save the default model to settings */
export async function setDefaultModel(model: string): Promise<void> {
  setSetting(SettingsKey.DefaultModel, model);
}
