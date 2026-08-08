const fs = require('fs');
const path = require('path');
const http = require('http');

/**
 * In-app integration self-test — run with CRUX_SELFTEST=1.
 *
 * Exercises the real desktop stack inside the running Electron app: actual
 * safeStorage (macOS Keychain), actual chokidar under the Electron runtime,
 * actual preview server, actual garden root. Results go to the debug log as
 * SELFTEST lines; the app quits when done. Cleans up everything it creates.
 */

function fetchText(url: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res: any) => {
        let body = '';
        res.on('data', (c: string) => (body += c));
        res.on('end', () => resolve({ status: res.statusCode, body }));
      })
      .on('error', reject);
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runSelfTest(ctx: {
  app: any;
  db: any;
  secrets: any;
  projects: any;
  previewServer: any;
  toolchain?: any;
  devServers?: any;
  debugLog: (msg: string) => void;
}): Promise<void> {
  const { app, db, secrets, projects, previewServer, toolchain, devServers, debugLog } = ctx;
  const results: string[] = [];
  const check = (name: string, ok: boolean, detail = '') => {
    results.push(`SELFTEST ${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' — ' + detail}`);
  };

  let folder: string | null = null;
  try {
    // 1. Native SQLite is alive
    try {
      const row = db.get('SELECT COUNT(*) as n FROM cruxes');
      check('sqlite native query', typeof row?.n === 'number', JSON.stringify(row));
    } catch (e: any) {
      check('sqlite native query', false, e.message);
    }

    // 2. safeStorage round-trip against the real Keychain
    try {
      const available = secrets.available();
      check('safeStorage available', available);
      if (available) {
        secrets.set('cruxgarden:selftest', 'round-trip-value');
        check('safeStorage round-trip', secrets.get('cruxgarden:selftest') === 'round-trip-value');
        secrets.delete('cruxgarden:selftest');
        check('safeStorage delete', secrets.get('cruxgarden:selftest') === null);
      }
    } catch (e: any) {
      check('safeStorage round-trip', false, e.message);
    }

    // 3. Project Folder under the real garden root
    try {
      folder = projects.createFolder('selftest-tmp');
      projects.writeFile(folder, 'index.html', new TextEncoder().encode('<h1>selftest</h1>'));
      const read = new TextDecoder().decode(projects.readFile(folder, 'index.html'));
      check('project folder write/read', read === '<h1>selftest</h1>');
    } catch (e: any) {
      check('project folder write/read', false, e.message);
    }

    // 4. Watcher under the Electron runtime (own instance, own collector)
    if (folder) {
      try {
        const { ProjectWatcher } = require('./watcher');
        const batches: any[] = [];
        const testWatcher = new ProjectWatcher((b: any) => batches.push(b));
        testWatcher.watch(folder);
        await sleep(400);
        fs.writeFileSync(path.join(folder, 'external.txt'), 'external edit');
        await sleep(1200);
        const seen = batches.some((b: any) =>
          b.events?.some((e: any) => e.relPath === 'external.txt' && e.type === 'write'));
        check('watcher detects external edit', seen, JSON.stringify(batches));
        await testWatcher.closeAll();
      } catch (e: any) {
        check('watcher detects external edit', false, e.message);
      }
    }

    // 5. Preview server serves the folder + hidden-window screenshot capture
    if (folder) {
      try {
        const base = await previewServer.start(folder);
        const res = await fetchText(base + '/');
        check('preview serves index.html', res.status === 200 && res.body === '<h1>selftest</h1>',
          `status=${res.status}`);
        const trav = await fetchText(base + '/..%2Fescape');
        check('preview traversal blocked', trav.status !== 200, `status=${trav.status}`);

        // Screenshot the served page via the same code the preview:capture IPC uses
        try {
          const { capturePreviewUrl } = require('./capture');
          const jpeg = await capturePreviewUrl(base + '/');
          const isJpeg = jpeg.length > 1000 && jpeg[0] === 0xff && jpeg[1] === 0xd8;
          check('preview screenshot capture', isJpeg, `bytes=${jpeg.length}`);

          // The captured image must actually depict something — a solid frame
          // (blank page, failed load) still passes a byte-length check.
          const { nativeImage } = require('electron');
          const bitmap = nativeImage.createFromBuffer(jpeg).toBitmap();
          let distinct = false;
          for (let i = 4; i < bitmap.length; i += 4) {
            if (bitmap[i] !== bitmap[0] || bitmap[i + 1] !== bitmap[1]) { distinct = true; break; }
          }
          check('capture is not a blank frame', distinct);

          let rejected = false;
          try { await capturePreviewUrl('https://example.com/'); } catch { rejected = true; }
          check('capture rejects non-local URLs', rejected);

          // Redirect containment: a local URL that 302s off-host must never be
          // screenshotted (loadURL follows redirects; the input check can't see it).
          const redirector = http.createServer((_req: any, res: any) => {
            res.writeHead(302, { Location: 'https://example.com/' });
            res.end();
          });
          await new Promise<void>((r) => redirector.listen(0, '127.0.0.1', () => r()));
          const rport = redirector.address().port;
          let contained = false;
          try {
            await capturePreviewUrl(`http://127.0.0.1:${rport}/`);
          } catch {
            contained = true; // aborted, as it should be
          }
          redirector.close();
          check('capture blocks off-host redirects', contained);
        } catch (e: any) {
          check('preview screenshot capture', false, e.message);
        }

        await previewServer.stop(folder);
      } catch (e: any) {
        check('preview serves index.html', false, e.message);
      }
    }
    // 6. Filesystem containment guards (the renderer's whole sandbox)
    try {
      let blobRejected = false;
      try {
        db.blobRead('../../../../etc/passwd');
      } catch {
        blobRejected = true;
      }
      check('blob path rejects non-fingerprint names', blobRejected);

      let outsideRejected = false;
      try {
        projects.writeFile('/tmp', 'crux-selftest-escape.txt', new TextEncoder().encode('x'));
      } catch {
        outsideRejected = true;
      }
      check('project writes outside the garden root are rejected', outsideRejected);
    } catch (e: any) {
      check('filesystem containment guards', false, e.message);
    }

    // 7. FULL ASTRO ROUND-TRIP (opt-in: CRUX_SELFTEST_ASTRO=1 — needs network,
    //    takes a minute or two). Bundled pnpm install → astro dev → astro build.
    if (process.env.CRUX_SELFTEST_ASTRO && toolchain && devServers && folder) {
      try {
        debugLog('SELFTEST astro: writing minimal project…');
        const write = (rel: string, content: string) =>
          projects.writeFile(folder, rel, new TextEncoder().encode(content));
        write('package.json', JSON.stringify({
          name: 'selftest-astro', type: 'module', private: true,
          scripts: { dev: 'astro dev', build: 'astro build' },
          dependencies: { astro: '^5.0.0' },
        }, null, 2));
        write('astro.config.mjs', "import { defineConfig } from 'astro/config';\nexport default defineConfig({});\n");
        write('src/pages/index.astro', '---\n---\n<html><body><h1 id="marker">astro-selftest-ok</h1></body></html>\n');

        debugLog('SELFTEST astro: pnpm install (bundled toolchain)…');
        const install = await toolchain.install(folder);
        check('astro: pnpm install', install.code === 0, install.log.slice(-400));

        if (install.code === 0) {
          debugLog('SELFTEST astro: starting astro dev…');
          const url = await devServers.start(folder);
          const dev = await fetchText(url + '/');
          check('astro: dev server serves page',
            dev.status === 200 && dev.body.includes('astro-selftest-ok'), `status=${dev.status}`);
          await devServers.stop(folder);

          debugLog('SELFTEST astro: astro build…');
          const build = await toolchain.build(folder);
          const hasIndex = build.distFiles.includes('dist/index.html');
          check('astro: build produces dist', build.code === 0 && hasIndex,
            `code=${build.code} files=${build.distFiles.length} ${build.log.slice(-300)}`);
          if (hasIndex) {
            const html = new TextDecoder().decode(projects.readFile(folder, 'dist/index.html'));
            check('astro: built html has content', html.includes('astro-selftest-ok'));
          }
        }
      } catch (e: any) {
        check('astro: round-trip', false, e.message?.slice(0, 400));
      }
    }
  } finally {
    if (folder) {
      try { fs.rmSync(folder, { recursive: true, force: true }); } catch { /* best effort */ }
    }
    for (const line of results) debugLog(line);
    debugLog(`SELFTEST DONE: ${results.filter((r) => r.includes('PASS')).length}/${results.length} passed`);
    app.quit();
  }
}
