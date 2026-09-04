/**
 * Auto-update (ADR 0007/0008): electron-updater against GitHub Releases.
 * Checks are visible and disableable; nothing downloads without the user's
 * click. State is pushed to the renderer as it changes. Only packaged, signed
 * builds can actually update — in dev this reports `disabled`.
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

export interface UpdateState {
  status: UpdateStatus;
  currentVersion: string;
  availableVersion: string | null;
  progress: number | null;
  error: string | null;
  autoCheck: boolean;
  lastCheckedAt: string | null;
}

export interface UpdaterDeps {
  app: any;
  autoCheck: () => boolean;
  setAutoCheck: (on: boolean) => void;
  log: { info(m: string): void; error(m: string): void };
  onChange: (state: UpdateState) => void;
}

export class Updater {
  private state: UpdateState;
  private updater: any = null;

  constructor(private readonly deps: UpdaterDeps) {
    const packaged = !!deps.app.isPackaged;
    this.state = {
      status: packaged ? 'idle' : 'disabled',
      currentVersion: deps.app.getVersion(),
      availableVersion: null,
      progress: null,
      error: null,
      autoCheck: deps.autoCheck(),
      lastCheckedAt: null,
    };
    if (packaged) this.wire();
  }

  private wire(): void {
    try {
      const { autoUpdater } = require('electron-updater');
      this.updater = autoUpdater;
      autoUpdater.autoDownload = false;
      autoUpdater.autoInstallOnAppQuit = true;
      autoUpdater.logger = {
        info: (m: unknown) => this.deps.log.info(`updater: ${String(m)}`),
        warn: (m: unknown) => this.deps.log.info(`updater: ${String(m)}`),
        error: (m: unknown) => this.deps.log.error(`updater: ${String(m)}`),
        debug: () => {},
      };
      autoUpdater.on('checking-for-update', () => this.set({ status: 'checking', error: null }));
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
      autoUpdater.on('error', (err: Error) =>
        this.set({ status: 'error', error: err?.message || String(err) }),
      );
    } catch (err) {
      this.deps.log.error(`updater unavailable: ${(err as Error).message}`);
      this.set({ status: 'disabled' });
    }
  }

  private set(patch: Partial<UpdateState>): void {
    this.state = { ...this.state, ...patch };
    this.deps.onChange(this.state);
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
    try {
      await this.updater.checkForUpdates();
    } catch (err) {
      this.set({ status: 'error', error: (err as Error).message });
    }
    return this.state;
  }

  async download(): Promise<UpdateState> {
    if (!this.updater || this.state.status !== 'available') return this.state;
    try {
      await this.updater.downloadUpdate();
    } catch (err) {
      this.set({ status: 'error', error: (err as Error).message });
    }
    return this.state;
  }

  install(): void {
    if (this.updater && this.state.status === 'downloaded') this.updater.quitAndInstall();
  }

  setAutoCheck(on: boolean): UpdateState {
    this.deps.setAutoCheck(on);
    this.set({ autoCheck: on });
    return this.state;
  }
}
