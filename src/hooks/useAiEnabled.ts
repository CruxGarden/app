import { useUIStore } from '@/stores/uiStore';

/**
 * Whether AI tools are on (Settings → AI, `SettingsKey.AiEnabled`). The one
 * gate for everything that is AI: with it off the person sees nothing of the
 * collaborator, the Keeper, models or generation, and every task has a way
 * by hand (Daniel, 2026-09-27: "there should be an equal valid way to use
 * Crux Garden without AI if it's turned off — they shouldn't see anything
 * that is AI"). Read from the app-wide store, never a workspace's own.
 */
export function useAiEnabled(): boolean {
  return useUIStore((s) => s.aiEnabled);
}

/** The same answer outside React (services, tool registries, keyboard handlers). */
export function aiEnabledNow(): boolean {
  return useUIStore.getState().aiEnabled;
}
