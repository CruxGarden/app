import { test } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden } from './multi-crux-helpers';
import { LOCAL_API, LOCAL_API_LOG, useLocalApi, signInLocally } from './local-api-helpers';

/**
 * The API address is a setting of the garden (ADR 0049's first step): point
 * the app at an API running on this machine from Settings → Connection and
 * sign in there, with the code the API's mock mailer logs. Opt-in — see
 * local-api-helpers.ts for the environment.
 */
test.skip(
  !LOCAL_API || !LOCAL_API_LOG,
  'set CRUX_LOCAL_API and CRUX_LOCAL_API_LOG to run against a local API',
);

test('the garden meets an API on this machine from Settings → Connection', async () => {
  test.setTimeout(120000);
  const { app, page } = await launchApp();
  try {
    await enterGarden(page);
    await useLocalApi(page);
    await signInLocally(page);
    await page.screenshot({ path: 'e2e/.results/local-api-connected.png' });
  } finally {
    await app.close();
  }
});
