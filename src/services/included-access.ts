import { create } from 'zustand';
import { includedUsage, type IncludedUsage } from '@/api/inference';
import { captureAuth, assertAuthCurrent } from '@/api/session';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { getSetting, onSettingChange } from './settings';
import { SettingsKey } from '@/lib/constants';
import { onUsageChanged } from '@/lib/usage-events';

interface IncludedAccess {
  accountId: string | null;
  status: 'signed-out' | 'checking' | 'ready' | 'unavailable';
  usage: IncludedUsage | null;
}
export const useIncludedAccess = create<IncludedAccess>(() => ({
  accountId: null,
  status: 'signed-out',
  usage: null,
}));
let revision = 0;
let pending: Promise<void> | null = null;
let owner = '';

/** One account-bound readiness check for onboarding, composers and subscription changes. */
export function refreshIncludedAccess(): Promise<void> {
  const auth = useAuthStore.getState();
  const accountId = auth.isAuthenticated ? (auth.account?.id ?? null) : null;
  const context = captureAuth();
  const key = `${accountId}:${context.endpoint}:${context.revision}`;
  if (key === owner && pending) return pending;
  const changed = key !== owner;
  owner = key;
  const request = ++revision;
  if (!accountId) {
    useIncludedAccess.setState({ accountId: null, status: 'signed-out', usage: null });
    pending = null;
    return Promise.resolve();
  }
  useIncludedAccess.setState({
    accountId,
    status: 'checking',
    ...(changed ? { usage: null } : {}),
  });
  const current = () => {
    assertAuthCurrent(context);
    return (
      request === revision &&
      useAuthStore.getState().isAuthenticated &&
      useAuthStore.getState().account?.id === accountId
    );
  };
  pending = (async () => {
    try {
      const usage = await includedUsage();
      if (!current()) return;
      useIncludedAccess.setState({ status: 'ready', usage });
      // An absent preference means first use. Explicit manual-only choices always win.
      if (usage.eligible && usage.available && getSetting(SettingsKey.AiEnabled) === null)
        useUIStore.getState().setAiEnabled(true);
    } catch {
      try {
        if (current()) useIncludedAccess.setState({ status: 'unavailable' });
      } catch {
        /* A replaced account owns the next result. */
      }
    } finally {
      if (request === revision) pending = null;
    }
  })();
  return pending;
}

let started = false;
export function startIncludedAccess(): void {
  if (started) return;
  started = true;
  useAuthStore.subscribe((next, previous) => {
    if (
      next.account?.id !== previous.account?.id ||
      next.isAuthenticated !== previous.isAuthenticated
    )
      void refreshIncludedAccess();
  });
  onSettingChange((key) => {
    if (key === SettingsKey.ApiUrl) void refreshIncludedAccess();
  });
  onUsageChanged(() => void refreshIncludedAccess());
  if (typeof window !== 'undefined') {
    window.addEventListener('focus', () => void refreshIncludedAccess());
    window.addEventListener('online', () => void refreshIncludedAccess());
  }
  void refreshIncludedAccess();
}
