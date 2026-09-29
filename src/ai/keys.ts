import { getStoredTokens } from '@/api/client';
import { SettingsKey, API_KEY_PREFIX } from '@/lib/constants';
import { resolveModel } from './providers';
import { LOCAL_API_KEY } from './local';
import { getSetting, setSetting } from '@/services/settings';
import { getSecret, setSecret, deleteSecret } from '@/services/secrets';

/** Get an API key from the encrypted native store. */
export async function getApiKey(providerId: string): Promise<string | null> {
  if (providerId === 'included') return getStoredTokens().accessToken ? 'included-session' : null;
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

/** Get the default model from settings, or return the fallback */
export async function getDefaultModel(): Promise<string> {
  return resolveModel(getSetting(SettingsKey.DefaultModel));
}

/** Save the default model to settings */
export async function setDefaultModel(model: string): Promise<void> {
  setSetting(SettingsKey.DefaultModel, model);
}
