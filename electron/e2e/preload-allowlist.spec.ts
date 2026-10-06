import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { INSTALLATION_COMMANDS } from '../src/bridge';

/**
 * The sandboxed preload cannot import bridge.ts, so it repeats the
 * installation-command allow-list by hand. A name in bridge.ts but not in
 * preload would fail silently in the renderer; this keeps the two equal.
 */
test('preload repeats the installation allow-list exactly', () => {
  const preload = fs.readFileSync(path.join(__dirname, '..', 'src', 'preload.ts'), 'utf8');
  const block = /installation: Object\.fromEntries\(([\s\S]*?)\]\.map\(/.exec(preload);
  expect(block, 'preload installation block').toBeTruthy();
  const names = [...block![1].matchAll(/'([A-Za-z]+)'/g)].map((m) => m[1]);
  expect(names).toEqual([...INSTALLATION_COMMANDS]);
});
