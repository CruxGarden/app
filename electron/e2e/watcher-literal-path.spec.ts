import { test, expect } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { launchApp } from './launch';
import { enterGarden, createCrux, storedCrux, reenterWorkspace } from './multi-crux-helpers';
import { fileText } from './content-helpers';

test('external files in a Garden location with braces and brackets are ingested and survive restart', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'crux-e2e-{red,blue}[notes]-'));
  let instance = await launchApp({ dir, ai: false });
  try {
    await enterGarden(instance.page);
    const id = await createCrux(instance.page, 'Literal location');
    const folder = (await storedCrux(instance.page, id)).projectFolder;
    writeFileSync(join(folder, 'external.txt'), 'External work');
    await expect.poll(() => fileText(instance.page, id, 'external.txt')).toBe('External work');
    await instance.app.close();
    instance = await launchApp({ dir, ai: false });
    await reenterWorkspace(instance.page, 'Literal location');
    expect(await fileText(instance.page, id, 'external.txt')).toBe('External work');
  } finally {
    await instance.app.close();
  }
});
