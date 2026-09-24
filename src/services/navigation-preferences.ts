import { getServices } from './index';
import { getSqliteClient } from './sqlite/client';
import { setSettingDurably } from './settings';
import { useGardenContext } from '@/stores/gardenContext';

export type NavigationView = 'tree' | 'neighborhood';
export const isNavigationView = (value: unknown): value is NavigationView =>
  value === 'tree' || value === 'neighborhood';
interface UserNavigation {
  version: 1;
  defaultView?: NavigationView;
  always: boolean;
  gardens: Record<string, NavigationView>;
}
export interface ResolvedNavigation {
  view: NavigationView;
  source: string;
  ownView: NavigationView | null;
  defaultView: NavigationView;
  always: boolean;
  lastView: NavigationView | null;
}
const key = (authorId: string) => {
  if (!authorId) throw new Error('Choose a profile before changing navigation.');
  return `cruxgarden:navigation:${authorId}`;
};
async function userPreferences(authorId: string): Promise<UserNavigation> {
  const row = await getSqliteClient().get<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    [key(authorId)],
  );
  if (!row) return { version: 1, always: false, gardens: {} };
  const data = JSON.parse(row.value) as UserNavigation;
  if (
    !data ||
    data.version !== 1 ||
    typeof data.always !== 'boolean' ||
    (data.defaultView !== undefined && !isNavigationView(data.defaultView)) ||
    !data.gardens ||
    typeof data.gardens !== 'object' ||
    Array.isArray(data.gardens) ||
    Object.values(data.gardens).some((v) => !isNavigationView(v))
  )
    throw new Error('Your navigation preferences are unsupported. They have not been replaced.');
  return data;
}
async function gardenPreference(id: string) {
  const row = await getSqliteClient().get<{ title: string; navigation: string | null }>(
    "SELECT title,json_extract(meta, '$.navigation') AS navigation FROM cruxes WHERE id = ? AND kind = 'garden' AND deleted IS NULL",
    [id],
  );
  if (!row) throw new Error('This Garden is unavailable.');
  let view: NavigationView | null = null;
  if (row.navigation !== null) {
    const value = JSON.parse(row.navigation) as { version: number; view: unknown };
    if (!value || value.version !== 1 || !(value.view === null || isNavigationView(value.view)))
      throw new Error(
        'This Garden’s navigation preference is unsupported. It has not been replaced.',
      );
    view = value.view;
  }
  return { view, title: row.title || 'Untitled Garden' };
}
/** The graph owns author intent; the current profile owns personal choices.
 * A URL view is a visit hint below personal overrides, and never silently saved. */
export async function readNavigationPreferences(
  authorId: string,
  gardenId: string,
  visitView?: NavigationView,
): Promise<ResolvedNavigation> {
  const [user, own] = await Promise.all([userPreferences(authorId), gardenPreference(gardenId)]);
  const base = {
    ownView: own.view,
    defaultView: user.defaultView ?? 'tree',
    always: user.always,
    lastView: user.gardens[gardenId] ?? null,
  };
  const result = (view: NavigationView, source: string) => ({ ...base, view, source });
  if (user.always) return result(base.defaultView, 'Your view everywhere');
  if (base.lastView) return result(base.lastView, 'Your choice in this Garden');
  if (visitView) return result(visitView, 'This link');
  let id = gardenId;
  let current = own;
  const seen = new Set<string>();
  while (true) {
    if (seen.has(id)) throw new Error('Navigation inheritance contains a cycle.');
    if (seen.size >= 256) throw new Error('Navigation inheritance is too deep.');
    seen.add(id);
    if (current.view) return result(current.view, current.title);
    const parents = await getSqliteClient().all<{ id: string }>(
      "SELECT DISTINCT source_id AS id FROM dimensions WHERE target_id = ? AND type = 'garden' AND kind = 'membership' AND deleted IS NULL LIMIT 2",
      [id],
    );
    if (!parents.length)
      return result(base.defaultView, user.defaultView ? 'Your default' : 'App default');
    if (parents.length !== 1)
      throw new Error(
        'This Garden has multiple containers. Set its own navigation preference to resolve inheritance.',
      );
    id = parents[0]!.id;
    current = await gardenPreference(id);
  }
}
function changed() {
  useGardenContext.setState((state) => ({ revision: state.revision + 1 }));
}
export async function saveGardenNavigation(gardenId: string, view: NavigationView | null) {
  if (view !== null && !isNavigationView(view))
    throw new Error('Choose Tree, Neighborhood or inherit.');
  const db = getSqliteClient();
  const service = getServices().crux;
  await gardenPreference(gardenId);
  if (getSqliteClient() !== db) throw new Error('The active database changed. Try again.');
  await service.update(gardenId, { meta: { navigation: { version: 1, view } } });
  changed();
}
export interface UserNavigationChange {
  defaultView?: NavigationView;
  always?: boolean;
  gardenId?: string;
  view?: NavigationView | null;
}
// Serialize read/modify/write inside this profile; failed writes cannot poison later work.
let pending: Promise<unknown> = Promise.resolve();
export function saveUserNavigation(authorId: string, change: UserNavigationChange): Promise<void> {
  const captured = { ...change };
  const db = getSqliteClient();
  key(authorId);
  const operation = pending
    .catch(() => {})
    .then(async () => {
      if (getSqliteClient() !== db) throw new Error('The active database changed. Try again.');
      if (captured.defaultView !== undefined && !isNavigationView(captured.defaultView))
        throw new Error('Choose a supported navigation view.');
      if (captured.always !== undefined && typeof captured.always !== 'boolean')
        throw new Error('Always must be a boolean.');
      if (captured.gardenId !== undefined) {
        await gardenPreference(captured.gardenId);
        if (captured.view !== null && !isNavigationView(captured.view))
          throw new Error('Choose a view or clear your choice.');
      }
      const user = await userPreferences(authorId);
      if (captured.defaultView !== undefined) user.defaultView = captured.defaultView;
      if (captured.always !== undefined) user.always = captured.always;
      if (captured.gardenId) {
        if (captured.view === null) delete user.gardens[captured.gardenId];
        else user.gardens[captured.gardenId] = captured.view!;
      }
      const value = JSON.stringify(user);
      if (getSqliteClient() !== db) throw new Error('The active database changed. Try again.');
      await setSettingDurably(key(authorId), value);
      const saved = await db.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', [
        key(authorId),
      ]);
      if (saved?.value !== value)
        throw new Error('Navigation preferences were not saved. Try again.');
      changed();
    });
  pending = operation;
  return operation;
}
