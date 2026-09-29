import {
  dialog,
  type BrowserWindow,
  type WebContents,
  type WebFrameMain,
  type Streams,
} from 'electron';
import { isGardenUrl } from './garden-ipc';
import { chooseDisplaySource } from './display-source-picker';

/** Browser interaction permissions still require Chromium's own gesture checks. */
const INTERACTION_PERMISSIONS = new Set(['clipboard-sanitized-write', 'fullscreen', 'pointerLock']);

type RequestDetails = {
  isMainFrame: boolean;
  requestingUrl?: string;
  securityOrigin?: string;
};
type Requester = { frame: WebFrameMain; url: string; owner: object; label: string };

function originOf(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.username || url.password) return undefined;
    return url.protocol === 'crux-app:' ? `crux-app://${url.host}` : url.origin;
  } catch {
    return undefined;
  }
}

/**
 * Consent belongs to a live document in this window and an active preview server.
 * Sensitive permissions are approved for one request, never cached by loopback port.
 */
export function installWorkspacePermissions(
  window: BrowserWindow,
  previewOwner: (origin: string) => object | undefined,
  devServer?: string,
): void {
  const session = window.webContents.session;
  const appOwner = {};
  let prompting = false;

  const identify = (frame: WebFrameMain): Requester | undefined => {
    if (window.isDestroyed() || frame.detached) return undefined;
    if (!window.webContents.mainFrame.framesInSubtree.includes(frame)) return undefined;
    const url = frame.url;
    if (frame === window.webContents.mainFrame && isGardenUrl(url, devServer))
      return { frame, url, owner: appOwner, label: 'Crux Garden' };
    const origin = originOf(url);
    const owner = origin && previewOwner(origin);
    return owner ? { frame, url, owner, label: `The preview at ${origin}` } : undefined;
  };
  const unchanged = (requester: Requester): boolean => {
    const current = identify(requester.frame);
    return current?.owner === requester.owner && current.url === requester.url;
  };
  const requestingFrame = (
    contents: WebContents | null,
    details: RequestDetails,
    requestingOrigin?: string,
  ): Requester | undefined => {
    if (window.isDestroyed() || contents !== window.webContents) return undefined;
    const origin = originOf(
      details.securityOrigin || requestingOrigin || details.requestingUrl || '',
    );
    if (!origin || origin === 'null') return undefined;
    for (const frame of contents.mainFrame.framesInSubtree) {
      if (details.isMainFrame !== (frame === contents.mainFrame)) continue;
      if (originOf(frame.url) !== origin) continue;
      // Permission checks in cross-origin frames omit requestingUrl.
      if (details.requestingUrl && frame.url !== details.requestingUrl) continue;
      const requester = identify(frame);
      if (requester) return requester;
    }
    return undefined;
  };

  session.setPermissionCheckHandler(
    (contents, permission, origin, details) =>
      INTERACTION_PERMISSIONS.has(permission) && !!requestingFrame(contents, details, origin),
  );
  session.setPermissionRequestHandler((contents, permission, callback, details) => {
    const requester = requestingFrame(contents, details);
    if (!requester) return callback(false);
    if (INTERACTION_PERMISSIONS.has(permission)) return callback(true);
    // The separate display handler requires an explicit source choice every time.
    if (permission === 'display-capture') return callback(true);
    let access: string;
    let detail = 'Allow this request? Your operating system may also ask for permission.';
    if (permission === 'media' && 'mediaTypes' in details && details.mediaTypes) {
      if (details.mediaTypes.some((type) => type !== 'video' && type !== 'audio'))
        return callback(false);
      // Electron labels both getDisplayMedia and legacy desktop capture as
      // media with no device types. Never auto-approve that ambiguous request:
      // legacy capture can bypass the display-source handler entirely.
      if (details.mediaTypes.length === 0) {
        access = 'screen, windows, or system audio';
        detail =
          'The preview may choose what it captures. Allow only if you trust it. Standard screen sharing also asks you to choose a screen or window.';
      } else
        access = details.mediaTypes
          .map((type) => (type === 'video' ? 'camera' : 'microphone'))
          .join(' and ');
    } else if (permission === 'clipboard-read') {
      access = 'clipboard contents';
    } else {
      return callback(false);
    }
    if (prompting) return callback(false);
    prompting = true;
    void dialog
      .showMessageBox(window, {
        type: 'question',
        message: `${requester.label} wants access to your ${access}.`,
        detail,
        buttons: ['Deny', 'Allow once'],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      })
      .then(
        ({ response }) => {
          // Chromium can synchronously continue into the display-source handler.
          prompting = false;
          callback(response === 1 && unchanged(requester));
        },
        () => {
          prompting = false;
          callback(false);
        },
      );
  });
  session.setDisplayMediaRequestHandler(
    (request, callback) => {
      // Electron accepts an absent result to cancel. Its 41.x declaration omits
      // that case; an empty object instead throws and can terminate the app.
      const respond = callback as (streams?: Streams) => void;
      const requester = request.frame && identify(request.frame);
      if (
        !requester ||
        !request.userGesture ||
        !request.videoRequested ||
        prompting ||
        originOf(request.securityOrigin) !== originOf(requester.url)
      )
        return respond();
      prompting = true;
      void chooseDisplaySource(window, requester.label, request.audioRequested).then(
        (streams) => {
          prompting = false;
          respond(unchanged(requester) ? streams : undefined);
        },
        () => {
          prompting = false;
          respond();
        },
      );
    },
    { useSystemPicker: false },
  );
}
