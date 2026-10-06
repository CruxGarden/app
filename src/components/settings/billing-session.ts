import type * as Billing from '@/api/billing';

export interface BillingSettingsState {
  me: Billing.BillingMe | null;
  catalog: Billing.Catalog | null;
  busy: string | null;
  error: string | null;
  waiting: boolean;
  notice: string | null;
}
export const emptyBillingSettings = (): BillingSettingsState => ({
  me: null,
  catalog: null,
  busy: null,
  error: null,
  waiting: false,
  notice: null,
});

interface Dependencies {
  api: Pick<
    typeof Billing,
    | 'me'
    | 'plans'
    | 'sync'
    | 'checkout'
    | 'portal'
    | 'simulate'
    | 'resumeCheckout'
    | 'cancelCheckout'
  >;
  open: (url: string) => Promise<boolean>;
  usageChanged: () => void;
  /** Account identity is checked again after every await, before another action. */
  isCurrent: () => boolean;
  /** Clock for the focus re-check interval (tests pass their own). */
  now?: () => number;
}

/** A window focus re-checks at most this often unless a checkout is pending. */
export const FOCUS_RECHECK_MS = 5 * 60_000;

function planIdentity(me: Billing.BillingMe): string {
  return JSON.stringify([
    me.plan.id,
    me.status,
    me.interval,
    me.renewsAt,
    me.cancelAtPeriodEnd,
    me.trialEndsAt,
    me.graceEndsAt,
    me.provider,
    me.attention?.kind ?? null,
  ]);
}

/** A checkout that the server refused because a payment needs fixing first (409). */
function conflictMessage(error: unknown): string | null {
  const response = (error as { response?: { status?: number; data?: { message?: unknown } } })
    ?.response;
  if (response?.status !== 409) return null;
  const message = response.data?.message;
  return typeof message === 'string' && message
    ? message
    : 'A payment on your current subscription needs attention first. Open Manage billing to fix it.';
}

/** Owns one mounted account's requests and browser-return polling. Disposal
 * invalidates responses as well as timers; a new account gets a new session.
 */
export class BillingSettingsSession {
  private state = emptyBillingSettings();
  private disposed = false;
  private readVersion = 0;
  private waitVersion = 0;
  private waitingFrom: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private checkedAt = 0;

  constructor(
    private readonly dependencies: Dependencies,
    private readonly changed: (state: BillingSettingsState) => void,
  ) {}

  private get active() {
    return !this.disposed && this.dependencies.isCurrent();
  }
  private update(patch: Partial<BillingSettingsState>) {
    if (!this.active) return;
    this.state = { ...this.state, ...patch };
    this.changed(this.state);
  }
  dispose() {
    this.disposed = true;
    this.readVersion++;
    this.stopWaiting();
  }
  private stopWaiting() {
    this.waitVersion++;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.waitingFrom = null;
    this.update({ waiting: false });
  }
  private now() {
    return (this.dependencies.now ?? Date.now)();
  }
  private absorb(me: Billing.BillingMe) {
    if (!this.active) return;
    this.checkedAt = this.now();
    const identity = planIdentity(me);
    const changed = this.state.me && identity !== planIdentity(this.state.me);
    this.update({ me, error: null });
    if (changed) this.dependencies.usageChanged();
    if (this.waitingFrom !== null && identity !== this.waitingFrom) {
      this.stopWaiting();
      this.update({ notice: 'Plan status checked.' });
    }
  }
  async load() {
    const version = ++this.readVersion;
    try {
      const [me, catalog] = await Promise.all([
        this.dependencies.api.me(),
        this.dependencies.api.plans(),
      ]);
      if (!this.active || version !== this.readVersion) return;
      this.update({ catalog });
      this.absorb(me);
    } catch {
      if (this.active && version === this.readVersion)
        this.update({ error: 'Plans are unavailable right now. Check again to retry.' });
    }
  }
  async refresh(quiet = false) {
    if (!this.active) return;
    const version = ++this.readVersion;
    try {
      const me = await this.dependencies.api.sync();
      if (!this.active || version !== this.readVersion) return;
      this.absorb(me);
      if (!quiet && !this.state.waiting) this.update({ notice: 'Plan status checked.' });
      if (!this.state.catalog) await this.load();
    } catch {
      if (this.active && version === this.readVersion && !quiet)
        this.update({
          error:
            'Could not verify your plan. Check again to retry; avoid starting another checkout.',
        });
    }
  }
  /**
   * Window focus: re-check only while a checkout is pending (or the browser
   * return is being awaited), or when the last check is old. Never a notice —
   * coming back to the window is not a request to be told anything.
   */
  async focus() {
    if (!this.active || this.state.busy) return;
    const pending = this.state.waiting || !!this.state.me?.pendingCheckout;
    if (!pending && this.now() - this.checkedAt < FOCUS_RECHECK_MS) return;
    await this.refresh(true);
  }
  /**
   * The browser handed the person back through a crux-garden:// billing link.
   * Verify with the server at once; the link itself proves nothing.
   */
  async returned(status: 'success' | 'cancel') {
    if (!this.active) return;
    const before = this.state.me ? planIdentity(this.state.me) : null;
    await this.refresh(true);
    if (!this.active) return;
    const after = this.state.me ? planIdentity(this.state.me) : null;
    if (status === 'cancel' && before === after) {
      this.stopWaiting();
      this.update({
        notice: this.state.me?.pendingCheckout
          ? 'Checkout closed. Resume it or cancel it below.'
          : 'Checkout closed. Your plan is unchanged.',
      });
    }
  }
  private startWaiting(from: Billing.BillingMe) {
    this.stopWaiting();
    const version = this.waitVersion;
    this.waitingFrom = planIdentity(from);
    this.update({ waiting: true, notice: null });
    const started = Date.now();
    let delay = 3000;
    const tick = async () => {
      this.timer = null;
      if (!this.active || version !== this.waitVersion) return;
      await this.refresh(true);
      if (!this.active || version !== this.waitVersion) return;
      if (Date.now() - started >= 5 * 60_000) {
        this.stopWaiting();
        this.update({
          notice:
            'No plan change confirmed yet. If you completed checkout, check again. If you closed checkout, your last verified plan is shown above.',
        });
        return;
      }
      delay = Math.min(15_000, Math.round(delay * 1.5));
      this.timer = setTimeout(tick, delay);
    };
    this.timer = setTimeout(tick, delay);
  }
  private async run(kind: string, work: () => Promise<void>) {
    if (!this.active || this.state.busy) return;
    this.readVersion++;
    this.update({ busy: kind, error: null, notice: null });
    try {
      await work();
    } catch (error) {
      if (!this.active) return;
      const conflict = conflictMessage(error);
      const message = (error as { response?: { data?: { message?: string } } })?.response?.data
        ?.message;
      this.update({
        error:
          conflict ||
          (typeof message === 'string' && message) ||
          'Billing could not complete. Check your plan before trying again.',
      });
      // The refusal means the server knows something this view does not yet
      // show (an unpaid or unfinished subscription): fetch it, keep the reason.
      if (conflict) {
        await this.refresh(true);
        this.update({ error: conflict });
      }
    } finally {
      this.update({ busy: null });
    }
  }
  async choose(planId: string, interval: Billing.BillingInterval) {
    const me = this.state.me;
    const catalog = this.state.catalog;
    if (
      !me ||
      !catalog ||
      !catalog.plans.some(
        (entry) => entry.plan.id === planId && entry.prices.some((p) => p.interval === interval),
      )
    )
      return;
    await this.run(planId, async () => {
      if (
        me.provider === 'simulation' &&
        me.canSimulate &&
        !(['none', 'canceled', 'incomplete_expired'] as string[]).includes(me.status)
      ) {
        this.absorb(await this.dependencies.api.simulate('change_plan', planId, interval));
        return;
      }
      const { url } = await this.dependencies.api.checkout(planId, interval);
      if (!this.active) return;
      if (catalog.instant) await this.refresh();
      else {
        this.update({ me: { ...me, pendingCheckout: true } });
        await this.openAndWait(url, me);
      }
    });
  }
  async resumeCheckout() {
    const me = this.state.me;
    if (!me?.pendingCheckout) return;
    await this.run('checkout-resume', async () => {
      const { url } = await this.dependencies.api.resumeCheckout();
      if (this.active) await this.openAndWait(url, me);
    });
  }
  async cancelCheckout() {
    await this.run('checkout-cancel', async () => {
      const me = await this.dependencies.api.cancelCheckout();
      if (!this.active) return;
      this.absorb(me);
      this.stopWaiting();
      this.update({
        notice:
          me.plan.id !== 'free'
            ? 'Checkout had already completed. Your plan status has been refreshed.'
            : 'Pending checkout canceled.',
      });
    });
  }
  async manage() {
    const me = this.state.me;
    if (!me) return;
    await this.run('portal', async () => {
      const { url } = await this.dependencies.api.portal();
      if (this.active) await this.openAndWait(url, me);
    });
  }
  private async openAndWait(url: string, from: Billing.BillingMe) {
    const opened = await this.dependencies.open(url);
    if (!this.active) return;
    if (!opened)
      this.update({
        error: 'Could not open the billing page. Check your plan before trying again.',
      });
    else this.startWaiting(from);
  }
  async simulate(action: Billing.SimulationAction) {
    await this.run(action, async () => this.absorb(await this.dependencies.api.simulate(action)));
  }
}
