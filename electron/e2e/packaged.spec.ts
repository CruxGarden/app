import { test, expect, _electron as electron } from '@playwright/test';
import { existsSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
    const dir = mkdtempSync(join(tmpdir(), 'crux-packaged-'));
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env))
      if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
    env.CRUX_USER_DATA = join(dir, 'userData');
    env.CRUX_GARDEN_ROOT = join(dir, 'garden');
    const app = await electron.launch({ executablePath: exe, env });
    try {
      const page = await app.firstWindow();
      await page.waitForLoadState('domcontentloaded');
      expect(page.url().startsWith('crux-app://')).toBe(true);
      // The Gateway is the first thing a fresh install shows
      await expect(page.getByRole('heading', { name: 'Crux Garden' })).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByText('where ideas grow')).toBeVisible();
      const info = await app.evaluate(async ({ app: a }) => ({
        packaged: a.isPackaged,
        name: a.getName(),
        version: a.getVersion(),
        userData: a.getPath('userData'),
      }));
      expect(info.packaged).toBe(true);
      expect(info.name).toBe('Crux Garden');
      expect(info.userData).toBe(join(dir, 'userData'));
      expect(existsSync(join(dir, 'userData', 'cruxgarden.db'))).toBe(true);
      await page.screenshot({ path: 'e2e/.results/packaged-gateway.png' });
    } finally {
      await app.close();
    }
  });
});
