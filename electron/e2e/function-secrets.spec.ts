import { test, expect } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, createCrux, storedCrux, reenterWorkspace } from './multi-crux-helpers';
import { openPanel } from './panel-helpers';
import { fixtureKeychain } from './secret-storage-fixture';

test('Function secrets recover from failed saves, survive restart and reach only the local handler', async () => {
  const first = await launchApp();
  let app = first.app;
  let page = first.page;
  const value = 'fixture-private-function-token';
  try {
    await fixtureKeychain(app, false);
    await enterGarden(page);
    const id = await createCrux(page, 'Function Keys');
    const folder = (await storedCrux(page, id)).projectFolder as string;
    writeFileSync(join(folder, 'index.html'), '<!doctype html><h1>Function Keys</h1>');
    mkdirSync(join(folder, 'functions'), { recursive: true });
    writeFileSync(
      join(folder, 'functions', 'secret_probe.js'),
      `export default async function (req, ctx) {
      const token = ctx.secrets.get('TOKEN');
      return { present: !!token, length: (token || '').length };
    }`,
    );
    await openPanel(page, 'publish', 'Toggle share');
    let functions = page.getByTestId('functions-section');
    await expect(functions.getByTestId('function-secret_probe')).toBeVisible();
    let secrets = functions.getByTestId('function-secrets');
    await secrets.getByRole('textbox', { name: 'Secret name' }).fill('TOKEN');
    await secrets.getByLabel('Secret value', { exact: true }).fill(value);
    await secrets.getByRole('button', { name: 'Set', exact: true }).click();
    await expect(functions.getByText(/Secure credential storage is unavailable/)).toBeVisible();
    await expect(secrets.getByLabel('Secret value', { exact: true })).toHaveValue(value);
    const storageKey = 'cruxgarden:fn-secrets:' + id;
    expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBeNull();

    await fixtureKeychain(app, true);
    await secrets.getByRole('button', { name: 'Set', exact: true }).click();
    await expect(functions.getByRole('status')).toContainText('Secret TOKEN set here');
    await expect(secrets.getByLabel('Secret value', { exact: true })).toHaveValue('');
    const stored = readFileSync(join(first.dir, 'userData', 'secrets.json'), 'utf8');
    expect(stored).not.toContain(value);
    expect(
      await page.evaluate(
        (key) => window.electronAPI!.sqlite.all('SELECT key FROM settings WHERE key = ?', [key]),
        storageKey,
      ),
    ).toEqual([]);
    await functions
      .getByTestId('function-secret_probe')
      .getByRole('button', { name: 'Run', exact: true })
      .click();
    await expect(functions.getByTestId('function-result-secret_probe')).toContainText(
      `"length": ${value.length}`,
    );
    await expect(functions.getByTestId('function-result-secret_probe')).toContainText(
      '"present": true',
    );

    await app.close();
    const next = await launchApp({ dir: first.dir });
    app = next.app;
    page = next.page;
    await fixtureKeychain(app, true);
    await reenterWorkspace(page, 'Function Keys');
    await openPanel(page, 'publish', 'Toggle share');
    functions = page.getByTestId('functions-section');
    secrets = functions.getByTestId('function-secrets');
    await expect(secrets.getByText('TOKEN', { exact: true })).toBeVisible();
    await functions
      .getByTestId('function-secret_probe')
      .getByRole('button', { name: 'Run', exact: true })
      .click();
    await expect(functions.getByTestId('function-result-secret_probe')).toContainText(
      '"present": true',
    );
    await secrets.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(secrets.getByText('TOKEN', { exact: true })).toHaveCount(0);
    await functions
      .getByTestId('function-secret_probe')
      .getByRole('button', { name: 'Run', exact: true })
      .click();
    await expect(functions.getByTestId('function-result-secret_probe')).toContainText(
      '"present": false',
    );
    expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBeNull();
  } finally {
    await app.close();
  }
});
