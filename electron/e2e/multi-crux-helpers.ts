import { togglePanel } from './panel-helpers';
import { expect, type Page } from '@playwright/test';
export async function enterGarden(page: Page) {
  await page.getByRole('button', { name: /enter/i }).click();
  await page.getByText('Plant a new garden').click();
  await page.getByRole('button', { name: 'Welcome' }).click();
  await expect(page.getByRole('button', { name: 'Add Crux' })).toBeVisible();
}
/**
 * After a relaunch the app opens on the Garden's Home and brings workspaces
 * back lazily: Enter, then open the one wanted (by title, else the first not
 * yet loaded) from the switcher. Resolves once its workspace is in front.
 */
export async function reenterWorkspace(page: Page, title?: string) {
  await page.getByRole('button', { name: /enter/i }).click();
  await expect(page.getByRole('button', { name: 'Add Crux', exact: true })).toBeVisible({
    timeout: 60_000,
  });
  await page.getByRole('button', { name: 'Switch Crux workspace' }).click();
  const dialog = page.getByRole('dialog', { name: 'Switch Crux workspace' });
  const entry = title
    ? dialog.getByRole('button', {
        name: new RegExp(`^(✓ )?${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} `),
      })
    : dialog.getByRole('button', { name: / Not loaded/ }).first();
  await entry.click();
  await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 60_000 });
}
/** From a Crux, Garden location → Close crux lands on its Garden's Home (the workspace stays open). */
export async function goHome(page: Page) {
  if (/\/c\//.test(page.url())) {
    await page.getByRole('button', { name: 'Garden location', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Garden location', exact: true })
      .getByRole('button', { name: 'Close crux', exact: true })
      .click();
  }
  await expect(page.getByTestId('pane-body-home')).toBeVisible({ timeout: 15_000 });
}
export async function createCrux(page: Page, title: string) {
  // The garden breadcrumb remains reachable while existing workspaces stay open.
  if (/\/c\//.test(page.url())) {
    await page.getByRole('button', { name: 'Garden location', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Garden location', exact: true })
      .getByRole('button', { name: 'Close crux', exact: true })
      .click();
  }
  await page.getByRole('button', { name: 'Add Crux' }).click();
  await page.getByRole('button', { name: /^Blank/ }).click();
  await page.getByPlaceholder('My Crux').fill(title);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.locator('[data-workspace-id]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Switch Crux workspace' })).toContainText(title);
  return (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
}
export async function switchCrux(page: Page, title: string) {
  await page.getByRole('button', { name: 'Switch Crux workspace' }).click();
  const dialog = page.getByRole('dialog', { name: 'Switch Crux workspace' });
  await dialog.getByRole('button', { name: new RegExp(`^(✓ )?${title} `) }).click();
  await expect(page.getByRole('button', { name: 'Switch Crux workspace' })).toContainText(title);
}
export async function storedCrux(page: Page, id: string) {
  return page.evaluate(async (id) => {
    const row = (await window.electronAPI!.sqlite.get('SELECT meta FROM cruxes WHERE id = ?', [
      id,
    ])) as { meta: string };
    return JSON.parse(row.meta);
  }, id);
}
/**
 * The fingerprint the store holds for one of a Crux's (or Working Copy's)
 * files, read from its current content head — files are a manifest projection,
 * not rows in an artifacts table. Null until the file is ingested.
 */
export async function storedFingerprint(page: Page, cruxId: string, path: string) {
  return page.evaluate(
    async ([cruxId, path]) => {
      const content = window.electronAPI!.sqlite.fileContent!;
      const head = await content.head(cruxId!);
      if (!head) return null;
      const { entries } = await content.list({ cruxId: cruxId!, expected: head });
      return entries.find((file) => file.path === path)?.fingerprint ?? null;
    },
    [cruxId, path],
  );
}
export async function addArtifact(page: Page, path: string) {
  const newFile = page.getByRole('button', { name: 'New file', exact: true });

  if (!(await page.getByTestId('pane-body-artifacts').isVisible()))
    await togglePanel(page, 'Toggle artifacts');
  await newFile.click();
  const input = page.getByRole('tree').getByRole('textbox');
  await input.fill(path);
  await input.press('Enter');
  await page.getByRole('tree').getByText(path, { exact: true }).click();
  await expect(page.locator('.monaco-editor textarea').first()).toBeVisible();
}

/**
 * The Mood browser's shelf (Daniel, 2026-09-19): the earlier renders and the
 * Office study sit collapsed under the bundled set. Open it before picking one.
 */
export async function openMoodShelf(page: Page) {
  const shelf = page.getByTestId('shelved-moods');
  if (!(await shelf.evaluate((el) => (el as HTMLDetailsElement).open)))
    await shelf.locator('summary').click();
}

/**
 * Wear a material Mood from the Mood browser's picker (open the Mood menu
 * first): the id names its material, hue and mode — `plasma-fjord`,
 * `soft-black`, `umber`… (MaterialMoods.tsx).
 */
export async function wearMaterial(page: Page, id: string) {
  const hues: Record<string, [string, string]> = {
    neutral: ['soft-white', 'soft-black'],
    gray: ['soft-gray', 'graphite'],
    parchment: ['parchment', 'umber'],
    fjord: ['fjord', 'harbor'],
    blush: ['blush', 'mulberry'],
    sage: ['sage', 'moss'],
    lilac: ['lilac', 'plum'],
  };
  const material = id.startsWith('plasma-') ? 'Plasma' : 'Soft';
  const tone = id.replace(/^plasma-/, '');
  const hue = Object.entries(hues).find(([, [l, d]]) => l === tone || d === tone);
  if (!hue) throw new Error(`${id} is not a material Mood`);
  const [hueName, [light]] = hue;
  const mode = light === tone ? 'Light' : 'Dark';
  const picker = page.getByTestId('material-moods');
  await picker.getByTestId('material-material').getByRole('button', { name: material }).click();
  await picker.getByTestId('material-mode').getByRole('button', { name: mode }).click();
  await picker
    .getByTestId('material-hue')
    .getByRole('button', { name: hueName.charAt(0).toUpperCase() + hueName.slice(1), exact: true })
    .click();
}

/**
 * Turn the automatic check on or off for the crux in view. The switch lives
 * with the Crux's other settings in the Metadata pane since 2026-09-20 — it
 * used to sit under the composer, where two words could not say what it
 * checked (Daniel: "useful feature but doesn't belong in the collaboration
 * pane").
 */
export async function setAutoCheck(page: Page, on: boolean) {
  const body = page.getByTestId('pane-body-details');
  const wasOpen = await body.isVisible().catch(() => false);
  if (!wasOpen) await togglePanel(page, 'Toggle details');
  await expect(body).toBeVisible({ timeout: 30_000 });
  const toggle = body.getByRole('switch', { name: 'Check when done' });
  await expect(toggle).toBeVisible({ timeout: 30_000 });
  if ((await toggle.getAttribute('aria-checked')) !== String(on)) await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', String(on));
  // Leave the workspace as it was found: a journey that did not ask for this
  // pane has its own layout, and an extra one moves everything else along.
  if (!wasOpen) {
    await togglePanel(page, 'Toggle details');
    await expect(body).toBeHidden({ timeout: 30_000 });
  }
}
