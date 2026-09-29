import { defineConfig } from '@playwright/test';

/**
 * The public website (crux.garden) in a real browser: Landing, Plans, the
 * billing return pages, Explore, public crux and garden pages. Vite serves a
 * production public-site build; the mock API from e2e/api-mock.ts answers on a fixed
 * port the site is pointed at. Run: npm run test:web
 */
export default defineConfig({
  testDir: './e2e-web',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: [['list']],
  outputDir: './e2e-web/.results',
  use: {
    baseURL: 'http://127.0.0.1:8123',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    browserName: 'chromium',
  },
  webServer: {
    // Public visitors do not create projects, so this fixture needs no tool
    // templates. Build first: development dependency discovery can reload a
    // page mid-journey, and these checks should exercise what visitors receive.
    command:
      'CRUX_BUNDLE_TOOLS=none VITE_PUBLIC_SITE=1 VITE_API_URL=http://127.0.0.1:8124 VITE_PREVIEW_ORIGIN= VITE_PUBLISH_ORIGIN_TEMPLATE= VITE_PUBLISHED_CONTENT_URL=http://127.0.0.1:8124/published npx vite build --outDir electron/.web-build && npx vite preview --outDir electron/.web-build --host 127.0.0.1 --port 8123 --strictPort',
    cwd: '..',
    url: 'http://127.0.0.1:8123',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
