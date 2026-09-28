import { defineConfig } from '@playwright/test';

/** Browser boundaries that need real Chromium, without the desktop or a Vite build. */
export default defineConfig({
  testDir: './e2e-browser',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  workers: 1,
  reporter: [['list']],
  outputDir: './e2e-browser/.results',
  use: {
    browserName: 'chromium',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
