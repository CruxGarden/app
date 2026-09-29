import { test, expect, _electron as electron } from '@playwright/test';
import { existsSync, mkdtempSync, realpathSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

/**
 * Packaged-build smoke (opt-in): launches the .app electron-builder produced —
 * asar, unpacked native modules, bundled web app, crux-app:// protocol — on a
 * throwaway garden, and checks the Gateway renders. This is the check that
 * `npx electron .` cannot give. Run after `npm run dist:mac`:
 *   CRUX_PACKAGED=1 npx playwright test e2e/packaged.spec.ts
 * CRUX_PACKAGED_APP overrides the executable path.
 */
const arch = process.arch === 'arm64' ? 'mac-arm64' : 'mac';
const exe =
  process.env.CRUX_PACKAGED_APP ||
  join(__dirname, '..', 'release', arch, 'Crux Garden.app', 'Contents', 'MacOS', 'Crux Garden');

test.describe('packaged app', () => {
  test.skip(!process.env.CRUX_PACKAGED, 'set CRUX_PACKAGED=1 after npm run dist:mac');

  test('the built .app launches, serves the bundled web app, and opens SQLite', async () => {
    expect(existsSync(exe), `no packaged app at ${exe}`).toBe(true);
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'crux-packaged-')));
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env))
      if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
    env.CRUX_TEST_PROFILE = dir;
    env.CRUX_USER_DATA = join(dir, 'ignored-userData');
    env.CRUX_SELFTEST = '1';
    env.CRUX_AI_MOCK = '1';
    env.CRUX_AGENT_MOCK = '1';
    env.CRUX_FAKE_MEDIA = '1';
    env.CRUX_DEV_SERVER = 'http://127.0.0.1:1';
    env.CRUX_API_URL = 'http://127.0.0.1:1';
    env.CRUX_MEDIA_API = 'http://127.0.0.1:1';
    env.CRUX_V2 = '1';
    env.CRUX_AI = 'on';
    env.CRUX_SILENT = '1';
    env.CRUX_PLAIN_TITLES = '1';
    env.CRUX_AUTOBACKUP_QUIET_MS = '1';
    env.CRUX_GARDEN_ROOT = join(dir, 'ignored-garden');
    const app = await electron.launch({ executablePath: exe, env });
    try {
      const page = await app.firstWindow();
      await page.waitForLoadState('domcontentloaded');
      expect(page.url().startsWith('crux-app://')).toBe(true);
      // The Gateway is the first thing a fresh install shows
      await expect(page.getByRole('heading', { name: 'Crux Garden' })).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByText('grow anything')).toBeVisible();
      const info = await app.evaluate(async ({ app: a }) => ({
        packaged: a.isPackaged,
        name: a.getName(),
        version: a.getVersion(),
        userData: a.getPath('userData'),
      }));
      expect(info.packaged).toBe(true);
      expect(info.name).toBe('Crux Garden');
      expect(info.userData).toBe(join(dir, 'userData'));
      expect(await page.evaluate(() => window.electronAPI!.desktop.config())).toMatchObject({
        gardenRoot: join(dir, 'garden'),
      });
      expect(existsSync(join(dir, 'ignored-userData'))).toBe(false);
      expect(existsSync(join(dir, 'ignored-garden'))).toBe(false);
      const fixtureFiles = await app.evaluate(({ app }) => {
        const fs = process.getBuiltinModule('fs');
        const path = process.getBuiltinModule('path');
        return ['dist/selftest.js', 'dist/sqlite-native.js', 'e2e/agent-mock.cjs'].filter((file) =>
          fs.existsSync(path.join(app.getAppPath(), file)),
        );
      });
      expect(fixtureFiles).toEqual([]);

      expect(existsSync(join(dir, 'userData', 'cruxgarden.db'))).toBe(true);
      const launch = await page.evaluate(async () => {
        const api = window.electronAPI!;
        let write = 'accepted';
        try {
          await api.sqlite.run("INSERT INTO settings VALUES ('packaged-fixture', 'refused')");
        } catch (error) {
          write = String(error);
        }
        return { config: api.config, test: api.test, write };
      });
      expect.soft(launch.write).toContain('Raw SQL writes are closed');
      expect.soft(launch.config).toEqual({ apiUrl: null, v2: false });
      expect.soft(launch.test).toEqual({
        mediaApiBase: null,
        aiMock: false,
        agentMock: false,
        silent: false,
        ai: null,
        plainTitles: false,
        autoBackupQuietMs: null,
      });
      const fakeMedia = await app.evaluate(({ app }) =>
        app.commandLine.hasSwitch('use-fake-ui-for-media-stream'),
      );
      expect.soft(fakeMedia).toBe(false);
      const database = await page.evaluate(() =>
        window.electronAPI!.sqlite.get('SELECT sqlite_version() AS version'),
      );
      expect(database).toEqual({ version: expect.stringMatching(/^\d+\.\d+\.\d+$/) });
      const nativeTools = await page.evaluate(() => window.electronAPI!.native.tools());
      // Optional document compilers belong to the person, not an unchecked
      // copy from whichever machine happened to build the release.
      for (const name of ['pandoc', 'typst'])
        expect(nativeTools.find((tool) => tool.tool === name)?.source).not.toBe('resources');
      const nativeVersion = JSON.parse(
        readFileSync(join(__dirname, '../scripts/ffmpeg-sources.json'), 'utf8'),
      ).ffmpeg.version;
      for (const name of ['ffmpeg', 'ffprobe']) {
        const tool = nativeTools.find((tool) => tool.tool === name)!;
        expect(tool.source).toBe('resources');
        expect(tool.version).toMatch(
          new RegExp(`^${name} version ${nativeVersion.replaceAll('.', '\\.')}`),
        );
        expect(tool.path).toContain('.app/Contents/Resources/bin/');
        const license = execFileSync(tool.path!, ['-L'], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        });
        expect(license).toContain('GNU General Public License');
        expect(license).not.toContain('not legally redistributable');
        expect(existsSync(join(dirname(tool.path!), 'corresponding-source.tar.gz'))).toBe(true);
        expect(readFileSync(join(dirname(tool.path!), 'NOTICE.txt'), 'utf8')).toContain(
          'GPL-3.0-or-later',
        );
      }
      const resources = join(dirname(dirname(exe)), 'Resources');
      expect(readFileSync(join(resources, 'LICENSE'), 'utf8')).toContain('MIT License');
      const notices = readFileSync(join(resources, 'app', 'THIRD-PARTY-NOTICES.txt'), 'utf8');
      expect(notices).toContain('react@19.');
      expect(notices).toContain('monaco-editor@');
      expect(notices).toContain('wa-sqlite@');
      expect(notices).toContain('Permission is hereby granted');
      for (const font of ['Inter', 'Outfit', 'JetBrainsMono', 'CormorantGaramond'])
        expect(readFileSync(join(resources, 'app', 'fonts', `${font}-OFL.txt`), 'utf8')).toContain(
          'SIL OPEN FONT LICENSE',
        );
      await page.screenshot({ path: 'e2e/.results/packaged-gateway.png' });
    } finally {
      await app.close();
    }
  });
});
