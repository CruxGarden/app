import type { Crux } from '@/api/types';
import { captureGardenId } from '@/stores/gardenContext';
import { hasMoodCruxReference } from '@/services/mood-library';
import { installMood, type MoodPackage } from './packages';

/** Remove the public edition only; keep the saved Mood and its assets. */
export async function unshareMood(
  pkg: MoodPackage,
  deps: {
    findCrux: (id: string) => Promise<Crux | null>;
    unpublish: (crux: Crux) => Promise<unknown>;
  },
): Promise<MoodPackage> {
  const gardenId = captureGardenId();
  const source = hasMoodCruxReference(pkg) ? pkg : undefined;
  if (!pkg.publishedCruxId || !pkg.publishedAt)
    throw new Error('This Mood has no public edition to remove.');
  const crux = await deps.findCrux(pkg.publishedCruxId);
  if (!crux || crux.kind !== 'mood')
    throw new Error('Open the Garden that shared this Mood to unshare it.');
  await deps.unpublish(crux);
  // Keep the publication identity so sharing again uses the same public URL.
  const privateMood = { ...pkg };
  delete privateMood.publishedAt;
  return installMood(privateMood, { source, gardenId });
}
