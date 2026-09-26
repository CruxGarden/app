import type { Schedule } from './schedules';

/**
 * A Garden's own schedules travel with the Garden: their definitions are a
 * private payload of the Garden Crux (`meta.gardenSchedules`), the same shape
 * as `meta.gardenCollaboration`. When they next run, what fired and a timer's
 * clock are this device's (the installation list keeps them). A Mood's
 * schedules come from the Mood, so they are not written here.
 */
export type ScheduleDefinition = Pick<Schedule, 'id' | 'title' | 'enabled' | 'trigger' | 'actions'>;

export interface GardenSchedules {
  version: 1;
  schedules: ScheduleDefinition[];
}

export function definitionOf(s: Schedule): ScheduleDefinition {
  return { id: s.id, title: s.title, enabled: s.enabled, trigger: s.trigger, actions: s.actions };
}

function decode(value: unknown): ScheduleDefinition[] | null {
  const state = value as GardenSchedules | undefined;
  if (!state || state.version !== 1 || !Array.isArray(state.schedules)) return null;
  return state.schedules.filter(
    (s) =>
      !!s &&
      typeof s.id === 'string' &&
      typeof s.title === 'string' &&
      typeof s.enabled === 'boolean' &&
      !!s.trigger &&
      Array.isArray(s.actions),
  );
}

/** Every Garden's own schedule definitions, by Garden. Gardens without a payload are absent. */
export async function readGardenSchedules(): Promise<Map<string, ScheduleDefinition[]>> {
  const { getServices } = await import('./index');
  const gardens = (await getServices().crux.listAll()).filter((c) => c.kind === 'garden');
  const out = new Map<string, ScheduleDefinition[]>();
  for (const garden of gardens) {
    const defs = decode(garden.meta?.gardenSchedules);
    if (defs) out.set(garden.id, defs);
  }
  return out;
}

/** The ids of every Garden on this device. */
export async function gardenIds(): Promise<Set<string>> {
  const { getServices } = await import('./index');
  return new Set(
    (await getServices().crux.listAll()).filter((c) => c.kind === 'garden').map((c) => c.id),
  );
}

export async function writeGardenSchedules(
  gardenId: string,
  schedules: ScheduleDefinition[],
): Promise<void> {
  const payload: GardenSchedules = { version: 1, schedules: structuredClone(schedules) };
  const { getServices } = await import('./index');
  await getServices().crux.update(gardenId, { meta: { gardenSchedules: payload } });
}
