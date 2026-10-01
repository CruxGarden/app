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
}

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
  ]);
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
  private absorb(me: Billing.BillingMe) {
    if (!this.active) return;
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
      const message = (error as { response?: { data?: { message?: string } } })?.response?.data
        ?.message;
      this.update({
        error: message || 'Billing could not complete. Check your plan before trying again.',
      });
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
        !['none', 'canceled'].includes(me.status)
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
