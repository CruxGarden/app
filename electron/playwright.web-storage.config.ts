import { defineConfig } from '@playwright/test';

/** SQLite worker integration needs module imports; public UI tests use the production build. */
export default defineConfig({
  testDir: './e2e-web',
  testMatch: '**/recovery-content.spec.ts',
  timeout: 60_000,
  workers: 1,
  reporter: [['list']],
  outputDir: './e2e-web/.storage-results',
  use: {
    baseURL: 'http://127.0.0.1:8133',
    browserName: 'chromium',
    trace: 'retain-on-failure',
  },
  webServer: {
    command:
      'CRUX_BUNDLE_TOOLS=none VITE_PUBLIC_SITE=1 npx vite --host 127.0.0.1 --port 8133 --strictPort',
    cwd: '..',
    url: 'http://127.0.0.1:8133',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
