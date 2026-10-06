import { getSetting, setSetting } from '@/services/settings';
import { SettingsKey } from '@/lib/constants';

const LIMIT = 8;
/** Explicitly selected topics only; no passive activity tracking. */
export function recentExploreTags(): string[] {
  try {
    const values: unknown = JSON.parse(getSetting(SettingsKey.ExploreRecentTags) || '[]');
    return Array.isArray(values)
      ? [
          ...new Set(
            values.filter(
              (v): v is string => typeof v === 'string' && v.length > 0 && v.length <= 80,
            ),
          ),
        ].slice(0, LIMIT)
      : [];
  } catch {
    return [];
  }
}
/** Topic history is optional: a blocked/full browser store must not block discovery. */
function saveRecentTags(tags: string[]): void {
  try {
    setSetting(SettingsKey.ExploreRecentTags, JSON.stringify(tags));
  } catch {
    // The settings cache still holds the in-session choice when persistence fails.
  }
}
export function rememberExploreTag(tag: string): string[] {
  const next = [tag, ...recentExploreTags().filter((value) => value !== tag)].slice(0, LIMIT);
  saveRecentTags(next);
  return next;
}
export function clearExploreTags(): void {
  saveRecentTags([]);
}
