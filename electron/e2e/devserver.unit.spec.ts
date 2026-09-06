import { test, expect } from '@playwright/test';

/** Port selection for the dev server (compiled to dist/dev-server.js by `npm run build`) — no Electron needed. */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { pickPort } = require('../dist/dev-server.js') as typeof import('../src/dev-server');

test.describe('dev server port choice', () => {
  const ephemeral = async () => 54321;

  test('takes the preferred port when it is legal and free', async () => {
    expect(await pickPort(4321, async () => true, ephemeral)).toEqual({
      port: 4321,
      fallback: false,
    });
  });

  test('falls back to an ephemeral port when the preferred one is taken, and says so', async () => {
    expect(await pickPort(4321, async () => false, ephemeral)).toEqual({
      port: 54321,
      fallback: true,
    });
  });

  test('ignores illegal preferences without calling them a fallback', async () => {
    const never = async () => {
      throw new Error('should not probe');
    };
    for (const bad of [undefined, 0, 80, 70000, 4321.5, NaN]) {
      expect(await pickPort(bad as number | undefined, never, ephemeral)).toEqual({
        port: 54321,
        fallback: false,
      });
    }
  });
});
