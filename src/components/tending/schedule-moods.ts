import { BUNDLED_MOODS } from '@/lib/moods/bundled-moods';
import { getInstalledMoods } from '@/lib/moods/packages';

/** Every Mood a schedule can wear: the bundled ones and those installed here. */
export const allMoods = () => [
  ...BUNDLED_MOODS.map((m) => ({ id: m.id, name: m.name })),
  ...getInstalledMoods().map((m) => ({ id: m.id, name: m.name })),
];
