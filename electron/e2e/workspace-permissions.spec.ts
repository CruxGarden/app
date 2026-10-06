import { test, expect } from '@playwright/test';
import { launchApp } from './launch';

/** Fake devices exercise Chromium's real permission path without camera or microphone access. */
test('only live workspace frames can ask for media, and every request needs consent', async () => {
  const instance = await launchApp({ args: ['--use-fake-device-for-media-stream'] });
  try {
    const unknownUrl = await instance.app.evaluate(async ({ dialog }) => {
      const state = { allow: false, prompts: [] as string[], server: null as any };
      (globalThis as any).permissionProof = state;
      dialog.showMessageBox = (async (_window: unknown, options: any) => {
        state.prompts.push(options.message);
        return { response: state.allow ? 1 : 0, checkboxChecked: false };
      }) as typeof dialog.showMessageBox;
      const server = process.getBuiltinModule('http').createServer((_req, res) => {
        res.setHeader('Content-Type', 'text/html');
        res.end('<!doctype html><title>Outside preview</title>');
      });
      state.server = server;
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    });
    const ownedUrl = await instance.page.evaluate(async () => {
      const api = window.electronAPI!;
      const folder = await api.project.createFolder('permission-proof');
      await api.project.writeFile(
        folder,
        'index.html',
        new TextEncoder().encode('<!doctype html><title>Owned preview</title>'),
      );
      return api.preview.start(folder);
    });
    const mount = async (url: string) => {
      await instance.page.evaluate((url) => {
        document.querySelector('#permission-proof')?.remove();
        const frame = document.createElement('iframe');
        frame.id = 'permission-proof';
        // This fixture lives outside the app's layout. Keep its real controls
        // above the full-screen entry so clicks exercise media user activation.
        Object.assign(frame.style, {
          position: 'fixed',
          inset: '16px',
          width: '400px',
          height: '200px',
          zIndex: '2147483647',
        });
        frame.allow = 'camera; microphone; geolocation; display-capture';
        frame.src = url;
        document.body.append(frame);
      }, url);
      const frame = instance.page.frameLocator('#permission-proof');
      await expect
        .poll(() => frame.locator('body').evaluate(() => document.title))
        .toContain('preview');
      return frame;
    };
    const capture = async (url: string) => {
      const frame = await mount(url);
      return frame.locator('body').evaluate(async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
          const kinds = stream.getTracks().map((track) => track.kind);
          stream.getTracks().forEach((track) => track.stop());
          return kinds.join(',');
        } catch (error) {
          return (error as Error).name;
        }
      });
    };
    expect(await capture(unknownUrl)).toBe('NotAllowedError');
    expect(await instance.app.evaluate(() => (globalThis as any).permissionProof.prompts)).toEqual(
      [],
    );
    const otherWindow = await instance.app.evaluate(async ({ BrowserWindow }, url) => {
      const extra = new BrowserWindow({
        show: false,
        webPreferences: { contextIsolation: true, nodeIntegration: false },
      });
      try {
        await extra.loadURL(url);
        return await extra.webContents.executeJavaScript(
          `navigator.mediaDevices.getUserMedia({video:true}).then(stream => { stream.getTracks().forEach(track => track.stop()); return 'UNEXPECTED'; }, error => error.name)`,
        );
      } finally {
        extra.destroy();
      }
    }, ownedUrl);
    expect(otherWindow).toBe('NotAllowedError');
    expect(await capture(ownedUrl)).toBe('NotAllowedError');
    expect(
      await instance.app.evaluate(() => (globalThis as any).permissionProof.prompts.length),
    ).toBe(1);
    await instance.app.evaluate(() => {
      (globalThis as any).permissionProof.allow = true;
    });
    expect(await capture(ownedUrl)).toBe('video');
    expect(
      await instance.app.evaluate(() => (globalThis as any).permissionProof.prompts.length),
    ).toBe(2);
    // A prior approval must not silently approve the next request.
    await instance.app.evaluate(() => {
      (globalThis as any).permissionProof.allow = false;
    });
    expect(await capture(ownedUrl)).toBe('NotAllowedError');
    const frame = instance.page.frameLocator('#permission-proof');
    expect(
      await frame
        .locator('body')
        .evaluate(async () => (await navigator.permissions.query({ name: 'geolocation' })).state),
    ).toBe('denied');
    await instance.app.evaluate(({ desktopCapturer }) => {
      (globalThis as any).permissionProof.displayRequests = 0;
      desktopCapturer.getSources = async () => {
        (globalThis as any).permissionProof.displayRequests++;
        return [];
      };
    });
    const requestDisplay = async (url: string, error = 'NotAllowedError') => {
      const frame = await mount(url);
      await frame.locator('body').evaluate(() => {
        const button = document.createElement('button');
        button.textContent = 'Share a screen';
        button.onclick = async () => {
          document.body.dataset.capture = 'pending';
          try {
            const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            stream.getTracks().forEach((track) => track.stop());
            document.body.dataset.capture = 'UNEXPECTED';
          } catch (error) {
            document.body.dataset.capture = (error as Error).name;
          }
        };
        document.body.append(button);
      });
      // Each request replaces the iframe beneath the previous pointer position.
      // Leave that discarded surface before clicking the new real control.
      await instance.page.mouse.move(0, 0);
      await frame.getByRole('button', { name: 'Share a screen' }).click();
      try {
        await expect(frame.locator('body')).toHaveAttribute('data-capture', error);
      } catch (failure) {
        console.log(
          'Display consent diagnostic',
          await instance.app.evaluate(() => {
            const state = (globalThis as any).permissionProof;
            return { prompts: state.prompts, displayRequests: state.displayRequests };
          }),
          await frame.locator('body').evaluate(() => ({
            capture: document.body.dataset.capture,
            focused: document.hasFocus(),
          })),
        );
        throw failure;
      }
    };
    // Denied generic media consent never reaches source enumeration.
    await requestDisplay(ownedUrl);
    expect(
      await instance.app.evaluate(() => (globalThis as any).permissionProof.displayRequests),
    ).toBe(0);
    await instance.app.evaluate(() => {
      (globalThis as any).permissionProof.allow = true;
    });
    await requestDisplay(ownedUrl, 'AbortError');
    expect(
      await instance.app.evaluate(() => (globalThis as any).permissionProof.displayRequests),
    ).toBe(1);
    await requestDisplay(unknownUrl);
    expect(
      await instance.app.evaluate(() => (globalThis as any).permissionProof.displayRequests),
    ).toBe(1);
  } finally {
    await instance.app
      .evaluate(() => (globalThis as any).permissionProof?.server.close())
      .catch(() => {});
    await instance.app.close();
  }
});

test('screen sharing requires a chosen source, explicit audio, and an unchanged live owner', async () => {
  const instance = await launchApp();
  try {
    const url = await instance.page.evaluate(async () => {
      const api = window.electronAPI!;
      const folder = await api.project.createFolder('screen-permission-proof');
      await api.project.writeFile(
        folder,
        'index.html',
        new TextEncoder().encode('<!doctype html><body>Screen proof</body>'),
      );
      const url = await api.preview.start(folder);
      const frame = document.createElement('iframe');
      frame.id = 'screen-proof';
      frame.src = url;
      document.body.append(frame);
      return url;
    });
    await expect(instance.page.frameLocator('#screen-proof').locator('body')).toHaveText(
      'Screen proof',
    );
    const results = await instance.app.evaluate(
      async ({ app, BrowserWindow, desktopCapturer, dialog, Menu }, url) => {
        const window = BrowserWindow.getAllWindows()[0];
        const session = window.webContents.session;
        const load = process
          .getBuiltinModule('module')
          .createRequire(process.getBuiltinModule('path').join(app.getAppPath(), 'package.json'));
        const { installWorkspacePermissions } = load(
          './dist/workspace-permissions.js',
        ) as typeof import('../src/workspace-permissions');
        const frame = window.webContents.mainFrame.framesInSubtree.find(
          (frame) => frame.url === url + '/',
        )!;
        const original = {
          register: session.setDisplayMediaRequestHandler,
          sources: desktopCapturer.getSources,
          menu: Menu.buildFromTemplate,
          dialog: dialog.showMessageBox,
        };
        let handler: NonNullable<Parameters<typeof session.setDisplayMediaRequestHandler>[0]>;
        let owner: object | undefined = {};
        let useSystemPicker: boolean | undefined;
        let choose: string | undefined;
        let audioChoice = 0;
        let sourcesRead = 0;
        let changeOwner = false;
        let detach = false;
        const sources = [
          { id: 'screen:proof', name: 'Test screen' },
          { id: 'window:proof', name: 'Test window' },
        ];
        try {
          session.setDisplayMediaRequestHandler = (callback, options) => {
            handler = callback!;
            useSystemPicker = options?.useSystemPicker;
          };
          desktopCapturer.getSources = async () => {
            sourcesRead++;
            return sources as any;
          };
          Menu.buildFromTemplate = (items) =>
            ({
              popup: async (options: any) => {
                if (changeOwner) owner = {};
                if (detach)
                  await window.webContents.executeJavaScript(
                    "document.querySelector('#screen-proof').remove()",
                  );
                const item = items.find((item) => item.label === choose);
                (item as any)?.click?.();
                options.callback();
              },
            }) as any;
          dialog.showMessageBox = (async () => ({
            response: audioChoice,
            checkboxChecked: false,
          })) as typeof dialog.showMessageBox;
          installWorkspacePermissions(window, (origin) => (origin === url ? owner : undefined));
          const request = {
            frame,
            securityOrigin: url,
            userGesture: true,
            videoRequested: true,
            audioRequested: false,
          };
          const capture = (extra = {}) =>
            new Promise<any>((resolve) => {
              handler!({ ...request, ...extra }, (streams) => setImmediate(() => resolve(streams)));
            });
          const cancelled = await capture();
          const withoutGesture = await capture({ userGesture: false });
          const spoofedOrigin = await capture({ securityOrigin: 'https://example.org' });
          const readsBeforeChoice = sourcesRead;
          choose = 'Test window';
          const selected = await capture();
          const audioCancelled = await capture({ audioRequested: true });
          audioChoice = 1;
          const videoOnly = await capture({ audioRequested: true });
          audioChoice = 2;
          const withAudio = await capture({ audioRequested: true });
          changeOwner = true;
          const changedOwner = await capture();
          changeOwner = false;
          detach = true;
          const detached = await capture();
          return {
            useSystemPicker,
            cancelled,
            withoutGesture,
            spoofedOrigin,
            readsBeforeChoice,
            selected,
            audioCancelled,
            videoOnly,
            withAudio,
            changedOwner,
            detached,
          };
        } finally {
          session.setDisplayMediaRequestHandler = original.register;
          desktopCapturer.getSources = original.sources;
          Menu.buildFromTemplate = original.menu;
          dialog.showMessageBox = original.dialog;
        }
      },
      url,
    );
    expect(results.useSystemPicker).toBe(false);
    expect(results.cancelled).toBeUndefined();
    expect(results.withoutGesture).toBeUndefined();
    expect(results.spoofedOrigin).toBeUndefined();
    expect(results.readsBeforeChoice).toBe(1);
    expect(results.selected).toEqual({ video: { id: 'window:proof', name: 'Test window' } });
    expect(results.audioCancelled).toBeUndefined();
    expect(results.videoOnly).toEqual(results.selected);
    expect(results.withAudio).toEqual({ ...results.selected, audio: 'loopback' });
    expect(results.changedOwner).toBeUndefined();
    expect(results.detached).toBeUndefined();
  } finally {
    await instance.app.close();
  }
});
