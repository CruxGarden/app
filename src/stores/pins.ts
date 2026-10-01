import { useMemo } from 'react';
import { useSetting } from '@/hooks/useSetting';
import { getSetting, setSetting } from '@/services/settings';
import { SettingsKey } from '@/lib/constants';
import type { PaneType, WorkspaceScope } from './uiStore';

/**
 * Pinned panels keep their square in the top bar while closed. One set for
 * Crux workspaces and one for Garden Home, on this device: pinning Artifacts
 * puts its square in every Crux. Pins are presentation — they never open,
 * close, move or change anything else.
 */
type Pins = Record<WorkspaceScope, PaneType[]>;

function parse(raw: string | null): Pins {
  try {
    const value = JSON.parse(raw ?? '{}') as Partial<Pins>;
    return {
      crux: Array.isArray(value.crux) ? value.crux : [],
      garden: Array.isArray(value.garden) ? value.garden : [],
    };
  } catch {
    return { crux: [], garden: [] };
  }
}

export function pinsFor(scope: WorkspaceScope): PaneType[] {
  return parse(getSetting(SettingsKey.PanelPins))[scope];
}

export function usePinned(scope: WorkspaceScope): PaneType[] {
  const raw = useSetting(SettingsKey.PanelPins);
  return useMemo(() => parse(raw)[scope], [raw, scope]);
}

export function togglePin(scope: WorkspaceScope, pane: PaneType): void {
  const pins = parse(getSetting(SettingsKey.PanelPins));
  const list = pins[scope];
  pins[scope] = list.includes(pane) ? list.filter((p) => p !== pane) : [...list, pane];
  setSetting(SettingsKey.PanelPins, JSON.stringify(pins));
}
