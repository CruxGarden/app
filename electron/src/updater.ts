/**
 * Auto-update (ADR 0007/0008): electron-updater against GitHub Releases.
 * Checks are visible and disableable; nothing downloads without the user's
 * click; a downloaded update installs on quit (or on "Restart to update").
 * State is pushed to the renderer as it changes. Only packaged, signed builds
 * can actually update — in dev this reports `disabled`.
 *
 * The electron-updater instance is injected (`deps.autoUpdater`) so the state
 * machine is unit-testable with a fake (e2e/updater.unit.spec.ts); production
 * resolves the real one when the app is packaged.
 */
export type UpdateStatus =
  | 'disabled'
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error';

/** Which user-facing step failed — the renderer words each differently. */
export type UpdateAction = 'check' | 'download' | 'install';

export interface UpdateState {
  status: UpdateStatus;
  currentVersion: string;
  availableVersion: string | null;
  progress: number | null;
  error: string | null;
  /** Set together with `status: 'error'`; null otherwise. */
  failedAction: UpdateAction | null;
  autoCheck: boolean;
  lastCheckedAt: string | null;
}

/** The slice of electron-updater's AppUpdater we use (an EventEmitter). */
export interface AutoUpdaterLike {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  logger: unknown;
  on(event: string, listener: (...args: any[]) => void): unknown;
  checkForUpdates(): Promise<unknown>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(): void;
}

export interface UpdaterDeps {
  app: { isPackaged: boolean; getVersion(): string };
  autoCheck: () => boolean;
  setAutoCheck: (on: boolean) => void;
  log: { info(m: string): void; error(m: string): void };
  onChange: (state: UpdateState) => void;
  /**
   * The updater to drive. Omit in production: the real electron-updater is
   * loaded when `app.isPackaged`, otherwise updates are `disabled`. Pass a
   * fake to exercise the state machine anywhere.
   */
  autoUpdater?: AutoUpdaterLike;
}

export class Updater {
  private state: UpdateState;
  private updater: AutoUpdaterLike | null = null;
  /** The action whose asynchronous outcome we are waiting on, for error attribution. */
  private pending: UpdateAction | null = null;

  constructor(private readonly deps: UpdaterDeps) {
    const enabled = !!deps.autoUpdater || !!deps.app.isPackaged;
    this.state = {
      status: enabled ? 'idle' : 'disabled',
      currentVersion: deps.app.getVersion(),
      availableVersion: null,
      progress: null,
      error: null,
      failedAction: null,
      autoCheck: deps.autoCheck(),
      lastCheckedAt: null,
    };
    if (enabled) this.wire();
  }

  private wire(): void {
    try {
      const autoUpdater: AutoUpdaterLike =
        this.deps.autoUpdater ?? require('electron-updater').autoUpdater;
      this.updater = autoUpdater;
      autoUpdater.autoDownload = false;
      autoUpdater.autoInstallOnAppQuit = true;
      autoUpdater.logger = {
        info: (m: unknown) => this.deps.log.info(`updater: ${String(m)}`),
        warn: (m: unknown) => this.deps.log.info(`updater: ${String(m)}`),
        error: (m: unknown) => this.deps.log.error(`updater: ${String(m)}`),
        debug: () => {},
      };
      autoUpdater.on('checking-for-update', () =>
        this.set({ status: 'checking', error: null, failedAction: null }),
      );
      autoUpdater.on('update-available', (info: any) =>
        this.set({
          status: 'available',
          availableVersion: info?.version ?? null,
          lastCheckedAt: new Date().toISOString(),
        }),
      );
      autoUpdater.on('update-not-available', () =>
        this.set({
          status: 'not-available',
          availableVersion: null,
          lastCheckedAt: new Date().toISOString(),
        }),
      );
      autoUpdater.on('download-progress', (p: any) =>
        this.set({ status: 'downloading', progress: Math.round(p?.percent ?? 0) }),
      );
      autoUpdater.on('update-downloaded', (info: any) =>
        this.set({
          status: 'downloaded',
          progress: 100,
          availableVersion: info?.version ?? this.state.availableVersion,
        }),
      );
      autoUpdater.on('error', (err: Error) => this.fail(err));
    } catch (err) {
      this.deps.log.error(`updater unavailable: ${(err as Error).message}`);
      this.set({ status: 'disabled' });
    }
  }

  private set(patch: Partial<UpdateState>): void {
    this.state = { ...this.state, ...patch };
    this.deps.onChange(this.state);
  }

  /** Record an error against the action in flight (or the one the status implies). */
  private fail(err: unknown, action: UpdateAction | null = this.pending): void {
    const failedAction: UpdateAction =
      action ??
      (this.state.status === 'downloading'
        ? 'download'
        : this.state.status === 'downloaded'
          ? 'install'
          : 'check');
    const message = (err as Error)?.message || String(err);
    this.deps.log.error(`updater: ${failedAction} failed: ${message}`);
    this.set({ status: 'error', error: message, failedAction, progress: null });
  }

  /** Read through a method so TS does not keep a stale narrowing of `this.state.status` across awaits. */
  private errored(): boolean {
    return this.state.status === 'error';
  }

  getState(): UpdateState {
    return this.state;
  }

  /** On launch: one quiet check if the user hasn't turned checks off. */
  scheduleLaunchCheck(delayMs = 15_000): void {
    if (!this.updater || !this.deps.autoCheck()) return;
    setTimeout(() => void this.check(), delayMs);
  }

  async check(): Promise<UpdateState> {
    if (!this.updater) return this.state;
    if (this.pending) return this.state; // a check or download is already running
    this.pending = 'check';
    try {
      await this.updater.checkForUpdates();
    } catch (err) {
      if (!this.errored()) this.fail(err, 'check');
    } finally {
      this.pending = null;
    }
    return this.state;
  }

  async download(): Promise<UpdateState> {
    if (!this.updater || this.state.status !== 'available') return this.state;
    if (this.pending) return this.state;
    this.pending = 'download';
    try {
      await this.updater.downloadUpdate();
    } catch (err) {
      if (!this.errored()) this.fail(err, 'download');
    } finally {
      this.pending = null;
    }
    return this.state;
  }

  install(): void {
    if (!this.updater || this.state.status !== 'downloaded') return;
    try {
      this.updater.quitAndInstall();
    } catch (err) {
      this.fail(err, 'install');
    }
  }

  setAutoCheck(on: boolean): UpdateState {
    this.deps.setAutoCheck(on);
    this.set({ autoCheck: on });
    return this.state;
  }
}
