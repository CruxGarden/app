import { BrowserWindow, session, WebContentsView } from 'electron';
import type { GardenIpc } from './garden-ipc';
import type { BrowserPanelState, BrowserPanelAction, BrowserPanelBounds } from './bridge';

/** WWW is remote content, never the privileged app window or its session. */
export function registerBrowserPanel(getWindow: () => BrowserWindow | null, bridge: GardenIpc) {
  const partition = session.fromPartition('persist:crux-www');
  partition.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  partition.setPermissionCheckHandler(() => false);
  const views = new Map<
    string,
    { view: WebContentsView; window: BrowserWindow; error: string | null }
  >();
  function appWindow() {
    const win = getWindow();
    if (!win || win.isDestroyed()) throw new Error('The app window is closed.');
    return win;
  }
  function owner(raw: unknown): string {
    if (typeof raw !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(raw))
      throw new Error('Invalid browser workspace.');
    return raw;
  }
  const allowed = (raw: string) => {
    try {
      const u = new URL(raw);
      return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password;
    } catch {
      return false;
    }
  };
  function state(id: string): BrowserPanelState {
    const item = views.get(id);
    if (!item || item.view.webContents.isDestroyed())
      return { id, url: '', title: '', loading: false, back: false, forward: false, error: null };
    const wc = item.view.webContents;
    return {
      id,
      url: wc.getURL() === 'about:blank' ? '' : wc.getURL(),
      title: wc.getTitle(),
      loading: wc.isLoading(),
      back: wc.navigationHistory.canGoBack(),
      forward: wc.navigationHistory.canGoForward(),
      error: item.error,
    };
  }
  function publish(id: string) {
    const item = views.get(id);
    if (item && !item.window.isDestroyed())
      item.window.webContents.send('browser:state', state(id));
  }
  function close(id: string) {
    const item = views.get(id);
    if (!item) return;
    views.delete(id);
    if (!item.window.isDestroyed()) item.window.contentView.removeChildView(item.view);
    if (!item.view.webContents.isDestroyed())
      item.view.webContents.close({ waitForBeforeUnload: false });
  }
  function ensure(id: string, win: BrowserWindow) {
    const old = views.get(id);
    if (old && !old.view.webContents.isDestroyed() && old.window === win) return old;
    close(id);
    const view = new WebContentsView({
      webPreferences: {
        session: partition,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        nodeIntegrationInWorker: false,
        nodeIntegrationInSubFrames: false,
        webSecurity: true,
        allowRunningInsecureContent: false,
        webviewTag: false,
      },
    });
    const item = { view, window: win, error: null as string | null };
    views.set(id, item);
    view.setVisible(false);
    win.contentView.addChildView(view);
    const wc = view.webContents;
    const blocked = (url: string) => {
      item.error = `This browser opens HTTP and HTTPS websites. Blocked: ${url.split(':')[0]}`;
      publish(id);
    };
    wc.on('will-navigate', (event, url) => {
      if (!allowed(url)) {
        event.preventDefault();
        blocked(url);
      }
    });
    wc.on('will-redirect', (event, url) => {
      if (!allowed(url)) {
        event.preventDefault();
        blocked(url);
      }
    });
    wc.setWindowOpenHandler(({ url }) => {
      if (allowed(url)) void wc.loadURL(url).catch(() => {});
      else blocked(url);
      return { action: 'deny' };
    });
    wc.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown' || input.isComposing) return;
      const key = input.key.toLowerCase(),
        command = input.meta || input.control;
      if (command && key === 'r') {
        event.preventDefault();
        wc.reload();
        return;
      }
      if (command && key === 'l') {
        event.preventDefault();
        win.webContents.focus();
        win.webContents.send('browser:focus-address', id);
        return;
      }
      if ((command && [',', 'm', 'k'].includes(key)) || (input.control && input.key === 'Tab')) {
        event.preventDefault();
        win.webContents.focus();
        const modifiers: ('meta' | 'control' | 'alt' | 'shift')[] = [];
        if (input.meta) modifiers.push('meta');
        if (input.control) modifiers.push('control');
        if (input.alt) modifiers.push('alt');
        if (input.shift) modifiers.push('shift');
        win.webContents.sendInputEvent({ type: 'keyDown', keyCode: input.key, modifiers });
      }
    });
    wc.on('did-start-loading', () => {
      item.error = null;
      publish(id);
    });
    wc.on('did-stop-loading', () => publish(id));
    wc.on('did-navigate', () => publish(id));
    wc.on('did-navigate-in-page', () => publish(id));
    wc.on('page-title-updated', () => publish(id));
    wc.on('did-fail-load', (_e, code, description, _url, mainFrame) => {
      if (mainFrame && code !== -3) {
        item.error = description;
        publish(id);
      }
    });
    wc.on('render-process-gone', () => {
      item.error = 'The page stopped. Reload to try again.';
      publish(id);
    });
    const dispose = () => close(id);
    const navigation = (
      details: Electron.Event<Electron.WebContentsDidStartNavigationEventParams>,
    ) => {
      if (details.isMainFrame && !details.isSameDocument) dispose();
    };
    win.once('closed', dispose);
    win.webContents.on('did-start-navigation', navigation);
    win.webContents.once('render-process-gone', dispose);
    wc.once('destroyed', () => {
      win.removeListener('closed', dispose);
      win.webContents.removeListener('did-start-navigation', navigation);
      win.webContents.removeListener('render-process-gone', dispose);
    });
    return item;
  }
  partition.on('will-download', (event, _download, contents) => {
    event.preventDefault();
    for (const [id, item] of views)
      if (item.view.webContents === contents) {
        item.error = 'Open this page in your system browser to download files.';
        publish(id);
      }
  });
  bridge.handle(
    'browser:action',
    async (_event, rawId: unknown, action: BrowserPanelAction, rawUrl?: unknown) => {
      const win = appWindow(),
        id = owner(rawId);
      if (!['state', 'navigate', 'back', 'forward', 'reload', 'stop', 'close'].includes(action))
        throw new Error('Unknown browser control.');
      if (action === 'close') {
        close(id);
        return state(id);
      }
      if (
        action === 'navigate' &&
        (typeof rawUrl !== 'string' || rawUrl.length > 8192 || !allowed(rawUrl))
      )
        throw new Error('Enter an HTTP or HTTPS address without embedded credentials.');
      const item = ensure(id, win),
        wc = item.view.webContents;
      item.error = null;
      if (action === 'navigate') void wc.loadURL(rawUrl as string).catch(() => {});
      if (action === 'back' && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
      if (action === 'forward' && wc.navigationHistory.canGoForward())
        wc.navigationHistory.goForward();
      if (action === 'reload') wc.reload();
      if (action === 'stop') wc.stop();
      publish(id);
      return state(id);
    },
  );
  bridge.handle('browser:bounds', (_event, rawId: unknown, bounds: BrowserPanelBounds | null) => {
    const win = appWindow(),
      id = owner(rawId),
      item = views.get(id);
    if (!item || item.window !== win) return;
    if (!bounds) {
      item.view.setVisible(false);
      return;
    }
    if (![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite))
      throw new Error('Invalid browser bounds.');
    const zoom = win.webContents.getZoomFactor(),
      area = win.getContentBounds();
    const x = Math.max(0, Math.min(area.width, Math.round(bounds.x * zoom)));
    const y = Math.max(0, Math.min(area.height, Math.round(bounds.y * zoom)));
    const width = Math.max(0, Math.min(area.width - x, Math.round(bounds.width * zoom)));
    const height = Math.max(0, Math.min(area.height - y, Math.round(bounds.height * zoom)));
    item.view.setBounds({ x, y, width, height });
    item.view.setVisible(width > 0 && height > 0);
  });
}
