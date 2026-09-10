import { defineConfig } from '@playwright/test';

// Opt-in: hardware-dependent measurements must not make the ordinary UI gate flaky.
export default defineConfig({
  testDir: './performance',
  timeout: 30 * 60_000,
  expect: { timeout: 60_000 },
  workers: 1,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'performance/.results/playwright.json' }]],
  outputDir: 'performance/.results/runs',
  // Recording every frame of a large import distorts both time and memory.
  use: { actionTimeout: 60_000, trace: 'off', video: 'off', screenshot: 'only-on-failure' },
});
