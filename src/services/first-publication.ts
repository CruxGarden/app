import { getServices } from './index';
import { SettingsKey } from '@/lib/constants';
import { getSetting, setSettingDurably } from './settings';

let pending: Promise<unknown> = Promise.resolve();
/** One acknowledgement per installation, even if two Cruxes finish publishing together. */
export function claimFirstPublication(cruxId: string): Promise<boolean> {
  const operation = pending
    .catch(() => {})
    .then(async () => {
      if (getSetting(SettingsKey.FirstPublication)) return false;
      const earlier = (await getServices().crux.listAll()).some(
        (crux) => crux.id !== cruxId && !!crux.meta?.publishedAt,
      );
      await setSettingDurably(SettingsKey.FirstPublication, cruxId);
      return !earlier && getSetting(SettingsKey.CelebratePublication) !== 'false';
    });
  pending = operation;
  return operation;
}
