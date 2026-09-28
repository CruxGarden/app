import { ipcMain, type BrowserWindow, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';

/** The only documents allowed to own the privileged desktop bridge. */
export function isGardenUrl(target: string, devServer?: string): boolean {
  try {
    const url = new URL(target);
    if (url.username || url.password) return false;
    // Chromium canonicalizes our standard-scheme entry URL, crux-app:///index.html,
    // to crux-app://index.html/. Client-side routes keep that host.
    if (url.protocol === 'crux-app:') return !url.host || url.host === 'index.html';
    if (!devServer) return false;
    const dev = new URL(devServer);
    return ['http:', 'https:'].includes(dev.protocol) && url.origin === dev.origin;
  } catch {
    return false;
  }
}

/** All desktop IPC enters through this boundary, including fire-and-forget replies. */
export function gardenIpc(getWindow: () => BrowserWindow | null, devServer?: string) {
  const trusted = (event: IpcMainEvent | IpcMainInvokeEvent) => {
    const window = getWindow();
    return (
      !!window &&
      !window.isDestroyed() &&
      event.sender === window.webContents &&
      event.senderFrame === window.webContents.mainFrame &&
      isGardenUrl(event.senderFrame.url, devServer)
    );
  };
  return {
    handle(channel: string, listener: (event: IpcMainInvokeEvent, ...args: any[]) => unknown) {
      ipcMain.handle(channel, (event, ...args) => {
        if (!trusted(event)) throw new Error(`${channel} is only available to Crux Garden`);
        return listener(event, ...args);
      });
    },
    on(channel: string, listener: (event: IpcMainEvent, ...args: any[]) => void) {
      ipcMain.on(channel, (event, ...args) => {
        // An untrusted send has no reply channel; ignore it without crashing the host.
        if (trusted(event)) listener(event, ...args);
      });
    },
  };
}

export type GardenIpc = ReturnType<typeof gardenIpc>;
