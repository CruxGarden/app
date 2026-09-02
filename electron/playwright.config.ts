import { defineConfig } from '@playwright/test';

/**
 * UI tests drive the REAL desktop app (Playwright's Electron support) against
 * a throwaway userData dir + garden root — see e2e/launch.ts. Run:
 *   npm run test:e2e            (needs a built web app: npm run build:all)
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1, // one Electron instance at a time
  reporter: [['list']],
  outputDir: './e2e/.results',
});
