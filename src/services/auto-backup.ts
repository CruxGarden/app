/**
 * Automatic backup (RESILIENCE-PLAN §2a) — a garden setting, off by default.
 * When on and signed in: a crux that changed is backed up once it goes quiet
 * (a snapshot landed and QUIET_MS passed with no further snapshot, coalesced),
 * and the whole garden is backed up once a day while the app is open. Pushes
 * respect the plan: a 402 pauses automatic backups with a visible reason until
 * the setting is toggled again or the next day. The share-time backup
 * (`PublishPane`) is the other half of the same setting.
 *
 * The scheduler is pure (injected clock and timers) so its coalescing and
 * pause rules are unit-tested; `startAutoBackup()` wires it to the app.
 */
import { getSetting, setSetting } from '@/services/settings';
import { SettingsKey } from '@/lib/constants';

export const DEFAULT_QUIET_MS = 10 * 60_000;
export const GARDEN_EVERY_MS = 24 * 60 * 60_000;

export interface SchedulerDeps {
  now: () => number;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
  /** Back one crux up; resolves when done, rejects on failure. */
  backupCrux: (cruxId: string) => Promise<void>;
  backupGarden: () => Promise<void>;
  enabled: () => boolean;
  signedIn: () => boolean;
  lastGardenBackupAt: () => number | null;
  /** A pause note (a plan limit) or null. */
  paused: () => string | null;
  pause: (reason: string) => void;
  quietMs?: number;
}

export function isOverLimit(err: unknown): string | null {
  const e = err as { response?: { status?: number; data?: { message?: string } } };
  if (e?.response?.status !== 402) return null;
  return e.response?.data?.message || 'Your plan’s storage is full.';
}

export class AutoBackupScheduler {
  private timers = new Map<string, unknown>();
  private running = new Set<string>();
  private gardenRunning = false;
  constructor(private readonly deps: SchedulerDeps) {}

  private active(): boolean {
    return this.deps.enabled() && this.deps.signedIn() && !this.deps.paused();
  }

  /** A snapshot landed in a crux: (re)start its quiet timer. */
  cruxChanged(cruxId: string): void {
    if (!this.active()) return;
    const existing = this.timers.get(cruxId);
    if (existing) this.deps.clearTimeout(existing);
    const quiet = this.deps.quietMs ?? DEFAULT_QUIET_MS;
    this.timers.set(
      cruxId,
      this.deps.setTimeout(() => {
        this.timers.delete(cruxId);
        void this.runCrux(cruxId);
      }, quiet),
    );
  }

  async runCrux(cruxId: string): Promise<void> {
    if (!this.active() || this.running.has(cruxId)) return;
    this.running.add(cruxId);
    try {
      await this.deps.backupCrux(cruxId);
    } catch (err) {
      const over = isOverLimit(err);
      if (over) this.deps.pause(over);
      // anything else (offline, a closed workspace): the next change tries again
      else console.warn('[auto-backup] crux backup failed:', err);
    } finally {
      this.running.delete(cruxId);
    }
  }

  /** Once a day, the whole garden. Call on start and every hour. */
  async tickGarden(): Promise<void> {
    if (!this.active() || this.gardenRunning) return;
    const last = this.deps.lastGardenBackupAt();
    if (last !== null && this.deps.now() - last < GARDEN_EVERY_MS) return;
    this.gardenRunning = true;
    try {
      await this.deps.backupGarden();
    } catch (err) {
      const over = isOverLimit(err);
      if (over) this.deps.pause(over);
    } finally {
      this.gardenRunning = false;
    }
  }

  /** How many cruxes are waiting to go quiet (tests, the Sync pane). */
  pending(): number {
    return this.timers.size;
  }

  stop(): void {
    for (const t of this.timers.values()) this.deps.clearTimeout(t);
    this.timers.clear();
  }
}

// ── Settings ────────────────────────────────────────────────────────────────

export function isAutoBackupOn(): boolean {
  return getSetting(SettingsKey.AutoBackup) === 'true';
}
export function setAutoBackup(on: boolean): void {
  setSetting(SettingsKey.AutoBackup, on ? 'true' : 'false');
  if (on) setSetting(SettingsKey.AutoBackupPaused, ''); // toggling on lifts a pause
  window.dispatchEvent(new Event(AUTO_BACKUP_CHANGED));
}
export function autoBackupPause(): string | null {
  return getSetting(SettingsKey.AutoBackupPaused) || null;
}
export function lastGardenBackupAt(): string | null {
  return getSetting(SettingsKey.LastGardenBackupAt) || null;
}
export const AUTO_BACKUP_CHANGED = 'crux:auto-backup-changed';

// ── Wiring ──────────────────────────────────────────────────────────────────

let scheduler: AutoBackupScheduler | null = null;
let hourly: ReturnType<typeof setInterval> | null = null;

/** Idempotent; called from bootstrap. Returns the scheduler for tests. */
export async function startAutoBackup(): Promise<AutoBackupScheduler> {
  if (scheduler) return scheduler;
  const [
    { useAuthStore },
    { getWorkspace, useWorkspaceRegistry },
    { backupCrux },
    gardenIo,
    syncApi,
    { GROWTH_CHANGED_EVENT },
    { autoBackupQuietMsKnob },
  ] = await Promise.all([
    import('@/stores/authStore'),
    import('@/stores/workspaceRegistry'),
    import('@/services/backup'),
    import('@/services/garden-io'),
    import('@/api/sync'),
    import('@/services/growth'),
    import('@/lib/platform'),
  ]);
  const knob = autoBackupQuietMsKnob();
  const s = new AutoBackupScheduler({
    now: () => Date.now(),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    enabled: isAutoBackupOn,
    signedIn: () => useAuthStore.getState().isAuthenticated,
    paused: autoBackupPause,
    pause: (reason) => {
      setSetting(SettingsKey.AutoBackupPaused, reason);
      window.dispatchEvent(new Event(AUTO_BACKUP_CHANGED));
    },
    lastGardenBackupAt: () => {
      const at = lastGardenBackupAt();
      return at ? new Date(at).getTime() : null;
    },
    quietMs: knob ?? DEFAULT_QUIET_MS,
    backupCrux: async (cruxId) => {
      const w = getWorkspace(cruxId);
      if (!w) return; // closed since; the daily garden backup has it
      const { backupOf, snapshotsBehind } = await import('@/services/backup');
      const st = w.data.getState();
      if (backupOf(st.crux) && snapshotsBehind(st.crux, st.growthCount) === 0) return;
      await backupCrux(w.data);
      window.dispatchEvent(new Event(AUTO_BACKUP_CHANGED));
    },
    backupGarden: async () => {
      const result = await gardenIo.exportGarden({});
      await syncApi.pushGarden(result.blob);
      setSetting(SettingsKey.LastGardenBackupAt, new Date().toISOString());
      window.dispatchEvent(new Event(AUTO_BACKUP_CHANGED));
    },
  });
  scheduler = s;
  // Two ways to learn a snapshot landed: the Growth tools announce it; the
  // store's own snapshots (auto-snapshot after a turn) move growthCount. Watch
  // every open workspace's store for the count rising.
  window.addEventListener(GROWTH_CHANGED_EVENT, (e) => {
    const d = (e as CustomEvent<{ cruxId: string; kind: string }>).detail;
    if (d?.kind === 'snapshot' && d.cruxId) s.cruxChanged(d.cruxId);
  });
  const watched = new Set<string>();
  const watch = () => {
    for (const entry of useWorkspaceRegistry.getState().entries) {
      if (watched.has(entry.id)) continue;
      const w = getWorkspace(entry.id);
      if (!w) continue;
      watched.add(entry.id);
      let last = w.data.getState().growthCount;
      const unsubscribe = w.data.subscribe((st) => {
        if (st.growthCount > last) s.cruxChanged(entry.id);
        last = st.growthCount;
      });
      w.cleanup.add(() => {
        unsubscribe();
        watched.delete(entry.id);
      });
    }
  };
  watch();
  useWorkspaceRegistry.subscribe(watch);
  void s.tickGarden();
  hourly = setInterval(() => void s.tickGarden(), 60 * 60_000);
  return s;
}

export function stopAutoBackup(): void {
  scheduler?.stop();
  scheduler = null;
  if (hourly) clearInterval(hourly);
  hourly = null;
}
