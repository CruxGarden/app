import { useCallback, useSyncExternalStore } from 'react';
import { getSetting, onSettingChange } from '@/services/settings';

/** Observe the settings owner directly instead of keeping a second component copy. */
export function useSetting(key: string): string | null {
  const subscribe = useCallback(
    (notify: () => void) =>
      onSettingChange((changed) => {
        if (changed === key) notify();
      }),
    [key],
  );
  const read = useCallback(() => getSetting(key), [key]);
  return useSyncExternalStore(subscribe, read, read);
}
