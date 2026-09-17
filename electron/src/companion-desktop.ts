import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { figmaLayout, type WindowRect } from './figma-layout';
const exec = promisify(execFile);

// Static script, data passed through argv. No user text becomes executable code.
// A conservative POC: one standard window for the configured app, with identity/geometry checked
// again before each mutation. Never guess which of several windows to move.
const SCRIPT = String.raw`
function run(argv) {
  var input = JSON.parse(argv[0]);
  var se = Application('System Events');
  var ps = se.applicationProcesses.whose({bundleIdentifier: input.bundleId})();
  if (ps.length === 0) throw new Error('Open ' + input.label + ', then retry.');
  if (ps.length > 1) throw new Error('More than one ' + input.label + ' session is open. Arrange manually, or keep one session open for automatic placement.');
  var p = ps[0];
  var windows = p.windows().filter(function(w) { return w.subrole() === 'AXStandardWindow'; });
  if (windows.length !== 1) throw new Error('Keep one ' + input.label + ' window open for automatic placement, or arrange manually.');
  var w = windows[0];
  try { if (w.attributes.byName('AXFullScreen').value()) throw new Error('Leave ' + input.label + ' full screen before arranging.'); }
  catch (e) { if (String(e).indexOf('Leave ' + input.label) !== -1) throw e; }
  function snapshot() {
    var pos = w.position(), size = w.size();
    return {pid:p.unixId(), title:w.name(), bounds:{x:pos[0],y:pos[1],width:size[0],height:size[1]}};
  }
  var before = snapshot();
  if (input.action === 'inspect') return JSON.stringify(before);
  if (input.action !== 'set') throw new Error('Unknown placement action.');
  var expected = input.expected;
  if (!expected || before.pid !== expected.pid || before.title !== expected.title ||
      JSON.stringify(before.bounds) !== JSON.stringify(expected.bounds))
    throw new Error('The ' + input.label + ' window changed. It was left in place; arrange it manually or retry.');
  var b = input.bounds;
  if (![b.x,b.y,b.width,b.height].every(Number.isFinite) || b.width < 400 || b.height < 300)
    throw new Error('Invalid window size.');
  function place(bounds) {
    // macOS clamps growth at the current screen edge. Shrink first so moving
    // right/down can fit, then move before growing at the new origin.
    var current = w.size();
    w.size = [Math.min(current[0],bounds.width),Math.min(current[1],bounds.height)];
    w.position = [bounds.x,bounds.y];
    w.size = [bounds.width,bounds.height];
  }
  try {
    place(b);
    return JSON.stringify(snapshot());
  } catch (error) {
    try { place(before.bounds); }
    catch (_) { throw new Error('Placement failed and ' + input.label + ' could not be restored. Arrange its window manually.'); }
    throw error;
  }
}`;
interface FigmaWindow {
  pid: number;
  title: string;
  bounds: WindowRect;
}
async function command(input: Record<string, unknown>): Promise<FigmaWindow> {
  try {
    const { stdout } = await exec(
      '/usr/bin/osascript',
      ['-l', 'JavaScript', '-e', SCRIPT, JSON.stringify(input)],
      { timeout: 15000, maxBuffer: 16384 },
    );
    return JSON.parse(stdout);
  } catch (error) {
    const stderr = (error as Error & { stderr?: string }).stderr;
    const message = stderr?.trim() || (error as Error).message;
    if (/not authorized|not allowed|assistive access|-1743|-1719/i.test(message))
      throw new Error(
        'macOS needs Accessibility and Automation access for window placement. Allow Crux Garden (or Electron in development) in System Settings, then retry.',
        { cause: error },
      );
    throw new Error(message.replace(/Command failed:[\s\S]*?\n/, '').slice(-500), { cause: error });
  }
}

export class CompanionDesktop {
  private previous: {
    garden: WindowRect;
    minimum: number[];
    figma: FigmaWindow;
    arranged: FigmaWindow;
  } | null = null;
  private busy = false;
  constructor(
    private window: () => any,
    private screen: any,
    private preferences: any,
    private app: 'figma' | 'blender' = 'figma',
  ) {}
  private get config() {
    return this.app === 'blender'
      ? { label: 'Blender', bundleId: 'org.blenderfoundation.blender' }
      : { label: 'Figma', bundleId: 'com.figma.Desktop' };
  }
  private command(input: Record<string, unknown>) {
    return command({ ...input, ...this.config });
  }
  async open() {
    await exec('/usr/bin/open', ['-b', this.config.bundleId], { timeout: 10000 });
  }
  status() {
    return {
      arranged: !!this.previous,
      accessibility: this.preferences.isTrustedAccessibilityClient(false),
    };
  }
  async arrange(side: 'left' | 'right') {
    if (this.busy) throw new Error('Window placement is already running.');
    this.busy = true;
    try {
      if (this.previous) throw new Error('Restore the previous layout before arranging again.');
      const win = this.window();
      if (!win || win.isFullScreen() || win.isMaximized())
        throw new Error('Restore Garden to a normal window before arranging.');
      const layout = figmaLayout(this.screen.getDisplayMatching(win.getBounds()).workArea, side);
      if (!this.preferences.isTrustedAccessibilityClient(false)) {
        this.preferences.isTrustedAccessibilityClient(true);
        throw new Error(
          'Allow Crux Garden (or Electron in development) in macOS Accessibility settings, then retry.',
        );
      }
      await this.open();
      const figma = await this.command({ action: 'inspect' });
      const garden = win.getBounds();
      const minimum = win.getMinimumSize();
      const arranged = await this.command({ action: 'set', expected: figma, bounds: layout.figma });
      this.previous = { garden, minimum, figma, arranged };
      if (
        Object.keys(layout.figma).some(
          (k) =>
            Math.abs(arranged.bounds[k as keyof WindowRect] - layout.figma[k as keyof WindowRect]) >
            3,
        )
      ) {
        await this.restoreInner();
        throw new Error(
          `${this.config.label} could not fit the requested space. Its layout was restored; arrange manually.`,
        );
      }
      try {
        win.setMinimumSize(420, 600);
        win.setBounds(layout.garden);
      } catch (error) {
        await this.restoreInner();
        throw error;
      }
      return this.status();
    } finally {
      this.busy = false;
    }
  }
  async restore() {
    if (this.busy) throw new Error('Window placement is already running.');
    this.busy = true;
    try {
      await this.restoreInner();
      return this.status();
    } finally {
      this.busy = false;
    }
  }
  private async restoreInner() {
    const previous = this.previous;
    if (!previous) return;
    try {
      const restored = await this.command({
        action: 'set',
        expected: previous.arranged,
        bounds: previous.figma.bounds,
      });
      if (
        Object.keys(previous.figma.bounds).some(
          (key) =>
            Math.abs(
              restored.bounds[key as keyof WindowRect] -
                previous.figma.bounds[key as keyof WindowRect],
            ) > 3,
        )
      )
        throw new Error(
          `${this.config.label} could not return to its original size. Arrange its window manually.`,
        );
    } finally {
      const win = this.window();
      if (win && !win.isDestroyed()) {
        win.setMinimumSize(...previous.minimum);
        const area = this.screen.getDisplayMatching(previous.garden).workArea;
        const width = Math.min(previous.garden.width, area.width);
        const height = Math.min(previous.garden.height, area.height);
        win.setBounds({
          width,
          height,
          x: Math.max(area.x, Math.min(previous.garden.x, area.x + area.width - width)),
          y: Math.max(area.y, Math.min(previous.garden.y, area.y + area.height - height)),
        });
      }
      this.previous = null;
    }
  }
}
