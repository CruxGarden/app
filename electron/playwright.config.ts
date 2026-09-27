import { defineConfig } from '@playwright/test';

/**
 * UI tests drive the REAL desktop app (Playwright's Electron support) against
 * a throwaway userData dir + garden root — see e2e/launch.ts. Run:
 *   npm run test:e2e            (needs a built web app: npm run build:all)
 * Throwaway Gardens are swept before and after a run (e2e/temp-gardens.ts);
 * CRUX_E2E_KEEP=1 keeps them all for inspection.
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1, // one Electron instance at a time
  reporter: [['list']],
  outputDir: './e2e/.results',
  use: { screenshot: 'only-on-failure', trace: 'retain-on-failure' },
});
