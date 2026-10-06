import { SettingsKey } from '@/lib/constants';
import { useSetting } from './useSetting';

/** Installation-wide presentation preference, independent of AI and permissions. */
export function useAdvancedMode(): boolean {
  return useSetting(SettingsKey.AdvancedMode) === 'true';
}
