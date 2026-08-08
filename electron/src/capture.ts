const { BrowserWindow, session } = require('electron');

/**
 * Screenshot a local preview URL in a hidden window — snapshot thumbnails on
 * desktop (the preview serves files verbatim, so there is no injected capture
 * script; ADR 0003).
 *
 * Validating the input URL is not enough: `loadURL` follows redirects, and the
 * page can navigate itself (meta refresh, location =) inside the settle
 * window, which would silently screenshot a remote page. So containment is
 * enforced where it can actually be violated — every navigation is checked,
 * and the window runs in its own ephemeral session so it shares no cookies or
 * storage with the app.
 */

function isLoopbackHttp(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'http:' &&
      (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost')
    );
  } catch {
    return false;
  }
}

const LOAD_TIMEOUT_MS = 15000;
const SETTLE_MS = 700;

export async function capturePreviewUrl(url: string): Promise<Buffer> {
  if (!isLoopbackHttp(url)) {
    throw new Error('capture is limited to local preview URLs');
  }

  // Ephemeral, non-persistent partition: no app cookies, no shared storage,
  // and none of the app session's request shims.
  const captureSession = session.fromPartition(`crux-capture-${Date.now()}`, { cache: false });

  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      session: captureSession,
    },
  });

  // Containment: refuse to leave loopback, by redirect or in-page navigation.
  const blockOffsite = (event: { preventDefault(): void }, target: string) => {
    if (!isLoopbackHttp(target)) event.preventDefault();
  };
  win.webContents.on('will-navigate', blockOffsite);
  win.webContents.on('will-redirect', blockOffsite);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  // Belt and braces: drop any request that resolves off loopback.
  captureSession.webRequest.onBeforeRequest((details: any, callback: any) => {
    callback({ cancel: !isLoopbackHttp(details.url) });
  });

  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('capture timed out')), LOAD_TIMEOUT_MS),
  );

  try {
    await Promise.race([win.loadURL(url), timeout]);
    // Let fonts, images, and client-side rendering settle before the shot
    await Promise.race([new Promise((resolve) => setTimeout(resolve, SETTLE_MS)), timeout]);

    // A blocked navigation can leave the window somewhere unexpected — never
    // screenshot a page we didn't sanction.
    const finalUrl = win.webContents.getURL();
    if (finalUrl && !isLoopbackHttp(finalUrl)) {
      throw new Error('capture aborted: preview navigated off the local server');
    }

    const image = await Promise.race([win.webContents.capturePage(), timeout]);
    // Pin output size regardless of the display's scale factor, so thumbnails
    // (and their fingerprints) don't differ per machine.
    return image.resize({ width: 1280, height: 900 }).toJPEG(85);
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}
