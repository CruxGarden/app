import { useCallback, useEffect, useState } from 'react';
import { getApiKey } from '@/ai/keys';

/** The providers a person can paste a key for in setup. */
export const KEY_PROVIDERS = ['anthropic', 'openai', 'google'];

export interface SavedKeys {
  /** Provider id → a key is saved. Empty until the first read finishes. */
  keys: Record<string, boolean>;
  loaded: boolean;
  refresh: () => void;
}

/** Which providers have a saved key. Re-read after a key is saved or removed. */
export function useSavedKeys(): SavedKeys {
  const [keys, setKeys] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState(false);
  const refresh = useCallback(() => {
    void Promise.all(
      KEY_PROVIDERS.map(async (id) => [id, !!(await getApiKey(id).catch(() => null))] as const),
    ).then((entries) => {
      setKeys(Object.fromEntries(entries));
      setLoaded(true);
    });
  }, []);
  useEffect(refresh, [refresh]);
  return { keys, loaded, refresh };
}
