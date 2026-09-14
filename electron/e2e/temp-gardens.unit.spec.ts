import { test, expect } from '@playwright/test';
import { mkdtempSync, mkdirSync, existsSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listTempGardens, sweepStaleTempGardens, sweepTempGardens } from './temp-gardens';

test.describe('temp Gardens sweep', () => {
  test('stale gardens go before a run; the newest few survive the teardown', () => {
    const fresh = mkdtempSync(join(tmpdir(), 'crux-e2e-'));
    const old = mkdtempSync(join(tmpdir(), 'crux-e2e-'));
    mkdirSync(join(old, 'userData'), { recursive: true });
    writeFileSync(join(old, 'userData', 'x'), 'x');
    const dayAgo = (Date.now() - 24 * 60 * 60 * 1000) / 1000;
    utimesSync(old, dayAgo, dayAgo);
    expect(listTempGardens().map((g) => g.path)).toEqual(expect.arrayContaining([fresh, old]));

    sweepStaleTempGardens();
    expect(existsSync(old)).toBe(false);
    expect(existsSync(fresh)).toBe(true);

    // The teardown keeps the newest N: with a large N nothing goes; with 0 everything does.
    sweepTempGardens(1000);
    expect(existsSync(fresh)).toBe(true);
    const before = listTempGardens().length;
    sweepTempGardens(Math.max(0, before - 1));
    expect(listTempGardens().length).toBe(Math.max(0, before - 1));
  });

  test('CRUX_E2E_KEEP=1 keeps everything', () => {
    const dir = mkdtempSync(join(tmpdir(), 'crux-e2e-'));
    const dayAgo = (Date.now() - 24 * 60 * 60 * 1000) / 1000;
    utimesSync(dir, dayAgo, dayAgo);
    const previous = process.env.CRUX_E2E_KEEP;
    process.env.CRUX_E2E_KEEP = '1';
    try {
      sweepStaleTempGardens();
      sweepTempGardens(0);
      expect(existsSync(dir)).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.CRUX_E2E_KEEP;
      else process.env.CRUX_E2E_KEEP = previous;
      sweepStaleTempGardens();
    }
  });
});
