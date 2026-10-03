import { defineConfig } from '@playwright/test';

const gateSpecs = [
  '**/journeys/*.spec.ts',
  '**/ipc-security.spec.ts',
  '**/desktop-cli.spec.ts',
  '**/secrets.spec.ts',
  '**/function-secrets.spec.ts',
  '**/auth-credentials.spec.ts',
  '**/settings-secrets.spec.ts',
  '**/settings-navigation.spec.ts',
  '**/settings-clarity.spec.ts',
  '**/recovery-storage.spec.ts',
  '**/artifact-file-safety.spec.ts',
  '**/files.spec.ts',
  '**/file-drop.spec.ts',
  '**/upload-skills-apex.spec.ts',
  '**/publication-account.spec.ts',
  '**/garden-backup-account.spec.ts',
  '**/garden-package-refusal.spec.ts',
  '**/workspace-package-share.spec.ts',
  '**/task-close-ownership.spec.ts',
  '**/community-tool.spec.ts',
  '**/navigation-neighborhood.spec.ts',
  '**/growth-graph-mood.spec.ts',
  '**/plasma-panel-separation.spec.ts',
  '**/creation-picker.spec.ts',
  '**/accessibility.spec.ts',
  '**/folder-authorization.spec.ts',
  '**/graphics-fallback.spec.ts',
  '**/notes-save-navigation.spec.ts',
  '**/composer-paste.spec.ts',
  '**/workload-limits.spec.ts',
  '**/parallel-tasks.spec.ts',
  '**/zen-vibecoding.spec.ts',
  '**/welcome-crux.spec.ts',
  '**/documentation.spec.ts',
  '**/renderer-reload.spec.ts',
  '**/account-recovery.spec.ts',
  '**/account-closure.spec.ts',
  '**/package-imports.spec.ts',
  '**/publication-teardown.spec.ts',
  '**/workspace-permissions.spec.ts',
  '**/native-document-security.spec.ts',
  '**/typst-offline.spec.ts',
  '**/native-media-security.spec.ts',
  '**/media-import.spec.ts',
  '**/media-download.spec.ts',
  '**/toolchain-bridge.spec.ts',
  '**/updater-bridge.spec.ts',
  '**/editor-history-draft.spec.ts',
  '**/garden-membership-bridge.spec.ts',
  '**/www-browser.spec.ts',
];

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
  projects: [
    { name: 'unit', testMatch: '**/*.unit.spec.ts' },
    { name: 'gate', testMatch: gateSpecs },
    { name: 'desktop', testIgnore: ['**/*.unit.spec.ts', ...gateSpecs] },
  ],
  reporter: [['list']],
  outputDir: './e2e/.results',
  use: { screenshot: 'only-on-failure', trace: 'retain-on-failure' },
});
