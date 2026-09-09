import { test, expect, type Page } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden, createCrux, switchCrux } from './multi-crux-helpers';

/**
 * The garden and the frame around a crux, driven by mouse:
 *  - Home Garden: search filters the cards, "Clear search" on no match, Sort by
 *    Created / Updated reorders, the Public Garden button, the card menu.
 *  - The breadcrumb switcher's garden picker ("Open another Crux…") finds and
 *    opens a crux that has no workspace yet. (The magnifier top right is
 *    Explore — the public, API-backed search — covered by explore.spec.ts;
 *    keyboard MRU switching is covered by multi-crux-keyboard.spec.ts.)
 *  - Panes: every pane opens from its TopBar toggle and closes from its header,
 *    the open set survives a relaunch, and a narrow window says "Widen the pane".
 *  - The Keeper Console: enable AI tools, open with Escape / the TopBar button,
 *    talk to the scripted model, close.
 */

const PANES: { type: string; label: string }[] = [
  { type: 'collaboration', label: 'Collaboration' },
  { type: 'artifacts', label: 'Artifacts' },
  { type: 'workshop', label: 'Workshop' },
  { type: 'details', label: 'Metadata' },
  { type: 'history', label: 'History' },
  { type: 'export', label: 'Export' },
  { type: 'sync', label: 'Sync' },
  { type: 'publish', label: 'Share' },
  { type: 'store', label: 'Store' },
];

/** Open a pane if it is closed; never toggle an open one shut. */
async function ensurePane(page: Page, type: string, toggle: string) {
  const body = page.getByTestId(`pane-body-${type}`);
  if (!(await body.isVisible().catch(() => false)))
    await page.getByRole('button', { name: toggle }).click();
  await expect(body).toBeVisible({ timeout: 30_000 });
}

/** The garden breadcrumb (username) in the TopBar takes you to the Home Garden. */
async function goHome(page: Page) {
  await page.locator('header').getByRole('button').first().click();
  await expect(page.getByText('Home Garden', { exact: true })).toBeVisible({ timeout: 15_000 });
}

/** The crux cards: "Open <title>" buttons inside the page (the MoodBar has "Open Mood" too). */
function cards(page: Page) {
  return page.getByRole('main').getByRole('button', { name: /^Open / });
}

/** Card titles in grid order. */
function cardTitles(page: Page) {
  return cards(page).evaluateAll((els) =>
    els.map((e) => e.getAttribute('aria-label')!.replace(/^Open /, '')),
  );
}

/** Close one open workspace from the switcher (saving nothing — there are no edits). */
async function closeWorkspace(page: Page, title: string) {
  await page.getByRole('button', { name: 'Switch Crux workspace' }).click();
  await page.getByRole('button', { name: `Close ${title} workspace` }).click();
  const dialog = page.getByRole('dialog', { name: 'Close workspace' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Save and close', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

test.describe('home garden, crux picker, panes, console', () => {
  test.setTimeout(150_000);

  test('home garden: search, clear, sort by created/updated, public garden, card menu', async () => {
    const { app, page } = await launchApp();
    try {
      await enterGarden(page);
      await createCrux(page, 'Alpha Bloom');
      await createCrux(page, 'Beta Fern');
      await createCrux(page, 'Gamma Moss');
      // Touch Alpha last so its `updated` is newest while its `created` is oldest.
      await switchCrux(page, 'Alpha Bloom');
      await page.getByRole('button', { name: 'Switch Crux workspace' }).click();
      await page.getByRole('button', { name: 'Rename current Crux…' }).click();
      const rename = page.getByRole('dialog', { name: 'Rename Crux' });
      await rename.getByRole('textbox', { name: 'Crux title' }).fill('Alpha Bloom');
      await rename.getByRole('button', { name: 'Rename', exact: true }).click();
      await expect(rename).toHaveCount(0);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);

      await goHome(page);
      await expect(cards(page)).toHaveCount(3);
      await expect(page.getByRole('button', { name: 'Public Garden' })).toBeVisible();

      // ── Search filters the cards (debounced input) ──
      const search = page.getByPlaceholder('Search cruxes...');
      await search.fill('fern');
      await expect(page.getByRole('button', { name: 'Open Beta Fern' })).toBeVisible();
      await expect(cards(page)).toHaveCount(1);
      await expect(page.getByText('Created', { exact: false }).first()).toBeVisible();

      // ── No match: the empty state offers "Clear search" ──
      await search.fill('no such crux');
      await expect(page.getByText('No cruxes match your search')).toBeVisible();
      await page.getByRole('button', { name: 'Clear search' }).click();
      await expect(search).toHaveValue('');
      await expect(cards(page)).toHaveCount(3);

      // ── Sort: newest created first; Updated puts the freshly renamed Alpha first ──
      expect(await cardTitles(page)).toEqual(['Gamma Moss', 'Beta Fern', 'Alpha Bloom']);
      await page.getByRole('button', { name: 'Updated', exact: true }).click();
      await expect.poll(() => cardTitles(page)).toEqual(['Alpha Bloom', 'Gamma Moss', 'Beta Fern']);
      await expect(page.getByText(/^Updated /).first()).toBeVisible();
      await page.getByRole('button', { name: 'Created', exact: true }).click();
      await expect.poll(() => cardTitles(page)).toEqual(['Gamma Moss', 'Beta Fern', 'Alpha Bloom']);
      await page.screenshot({ path: 'e2e/.results/garden-panes-1-home.png' });

      // ── Card menu: Delete refuses while the workspace is open (ADR 0018) ──
      const gammaCard = page.getByRole('button', { name: 'Open Gamma Moss' }).locator('..');
      await gammaCard.hover();
      await gammaCard.getByRole('button', { name: 'Crux actions' }).click();
      await page.getByRole('menuitem', { name: 'Delete' }).click();
      await expect(page.getByText('Delete Crux')).toBeVisible();
      await page.getByRole('button', { name: 'Delete', exact: true }).click();
      await expect(page.getByRole('alert')).toContainText('Close this Crux workspace');
      await page.keyboard.press('Escape');
      await expect(page.getByText('Delete Crux')).toHaveCount(0);

      // ── Close Gamma's workspace, then the same menu really deletes it ──
      await closeWorkspace(page, 'Gamma Moss');
      await gammaCard.hover();
      await gammaCard.getByRole('button', { name: 'Crux actions' }).click();
      await page.getByRole('menuitem', { name: 'Delete' }).click();
      await page.getByRole('button', { name: 'Delete', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Open Gamma Moss' })).toHaveCount(0, {
        timeout: 15_000,
      });
      await expect(cards(page)).toHaveCount(2);
    } finally {
      await app.close();
    }
  });

  test('breadcrumb switcher: the garden picker finds a closed crux by mouse and opens it', async () => {
    const { app, page } = await launchApp();
    try {
      await enterGarden(page);
      await createCrux(page, 'Alpha Bloom');
      await createCrux(page, 'Beta Fern');
      await goHome(page);
      // Beta has no workspace any more; the picker must still find it in the garden.
      await closeWorkspace(page, 'Beta Fern');

      // Watch for the transient "Opening…" placeholder panes show before the crux loads.
      await page.evaluate(() => {
        const w = window as unknown as { __sawOpening: boolean };
        w.__sawOpening = false;
        new MutationObserver(() => {
          if (document.body.textContent?.includes('Opening…')) w.__sawOpening = true;
        }).observe(document.body, { childList: true, subtree: true, characterData: true });
      });

      await page.getByRole('button', { name: 'Switch Crux workspace' }).click();
      const dialog = page.getByRole('dialog', { name: 'Switch Crux workspace' });
      // Only the open Crux is listed until we ask for the whole garden
      await expect(dialog.getByRole('button', { name: /^Alpha Bloom / })).toBeVisible();
      await expect(dialog.getByRole('button', { name: /^Beta Fern / })).toHaveCount(0);
      await dialog.getByRole('button', { name: 'Open another Crux…' }).click();
      const find = dialog.getByRole('textbox', { name: 'Find a Crux in your garden' });
      await expect(find).toBeFocused();
      await expect(dialog.getByRole('button', { name: /^Beta Fern / })).toBeVisible();
      await find.fill('beta');
      await expect(dialog.getByRole('button', { name: /^Alpha Bloom / })).toHaveCount(0);
      await find.fill('nothing here');
      await expect(dialog.getByRole('status')).toContainText('No matching Cruxes');
      await find.fill('Fern');
      await dialog.getByRole('button', { name: /^Beta Fern / }).click();

      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page).toHaveURL(/\/c\//);
      await expect(page.getByRole('button', { name: 'Switch Crux workspace' })).toContainText(
        'Beta Fern',
      );
      await expect(page.getByTestId('pane-body-collaboration')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByPlaceholder('Send a message...')).toBeVisible({ timeout: 30_000 });
      const sawOpening = await page.evaluate(
        () => (window as unknown as { __sawOpening: boolean }).__sawOpening,
      );
      // The crux usually loads within a frame on a warm garden; when the
      // placeholder was too quick to catch, say so rather than fail.
      if (sawOpening) await expect(page.getByText('Opening…')).toHaveCount(0);
      else
        test.info().annotations.push({
          type: 'note',
          description: '"Opening…" placeholder was too fast to observe on this run',
        });
      await page.screenshot({ path: 'e2e/.results/garden-panes-2-picker.png' });
    } finally {
      await app.close();
    }
  });

  test('panes: toggle open, close from the header, survive a relaunch, ask for room when narrow', async () => {
    const first = await launchApp();
    const { dir } = first;
    try {
      const { page } = first;
      await enterGarden(page);
      await createCrux(page, 'Pane Garden');
      await expect(page.getByTestId('pane-body-collaboration')).toBeVisible({ timeout: 30_000 });

      // Every pane: closes from its own header, opens again from the TopBar toggle.
      // (A new crux may start with more than Collaboration open, so start from open.)
      for (const { type, label } of PANES) {
        const body = page.getByTestId(`pane-body-${type}`);
        const toggle = page.getByRole('button', { name: `Toggle ${label.toLowerCase()}` });
        await ensurePane(page, type, `Toggle ${label.toLowerCase()}`);
        await expect(toggle).toHaveAttribute('aria-pressed', 'true');
        await page.getByTitle(`Close ${label}`).click();
        await expect(body).toHaveCount(0);
        await expect(toggle).toHaveAttribute('aria-pressed', 'false');
        await toggle.click();
        await expect(body).toBeVisible({ timeout: 30_000 });
        await expect(toggle).toHaveAttribute('aria-pressed', 'true');
        await page.getByTitle(`Close ${label}`).click();
        await expect(body).toHaveCount(0);
      }

      // Open them all; the layout is saved (debounced) per crux.
      for (const { type, label } of PANES)
        await ensurePane(page, type, `Toggle ${label.toLowerCase()}`);
      await page.waitForTimeout(800);
      await page.screenshot({ path: 'e2e/.results/garden-panes-3-all-open.png' });
    } finally {
      await first.app.close();
    }

    const second = await launchApp({ dir });
    try {
      const { page } = second;
      await page.getByRole('button', { name: 'Enter', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Switch Crux workspace' })).toContainText(
        'Pane Garden',
        { timeout: 30_000 },
      );
      for (const { type } of PANES)
        await expect(page.getByTestId(`pane-body-${type}`)).toBeVisible({ timeout: 30_000 });

      // Nine panes in a 900px window: each is under its minimum width.
      await page.setViewportSize({ width: 900, height: 700 });
      const widen = page.getByText('Widen the pane');
      await expect(widen.first()).toBeVisible();
      expect(await widen.count()).toBeGreaterThanOrEqual(PANES.length - 1);
      await page.screenshot({ path: 'e2e/.results/garden-panes-4-narrow.png' });

      // Closing the others gives Collaboration its room back.
      for (const { type, label } of PANES) {
        if (type === 'collaboration') continue;
        await page.getByRole('button', { name: `Toggle ${label.toLowerCase()}` }).click();
        await expect(page.getByTestId(`pane-body-${type}`)).toHaveCount(0);
      }
      await expect(widen).toHaveCount(0);
      await expect(page.getByPlaceholder('Send a message...')).toBeVisible();
    } finally {
      await second.app.close();
    }
  });

  test('keeper console: enable AI tools, open with Escape and the TopBar button, chat, close', async () => {
    const { app, page } = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
    try {
      await enterGarden(page);
      const consoleTitle = page.getByText('Console — The Keeper');
      // AI tools are off in a fresh garden: no console button, Escape does nothing.
      await expect(page.getByRole('button', { name: 'Console', exact: true })).toHaveCount(0);
      await page.keyboard.press('Escape');
      await expect(consoleTitle).toHaveCount(0);

      // Settings → AI: enable, and give the Keeper's provider a key.
      await page.keyboard.press('ControlOrMeta+,');
      await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
      await page.locator('h2', { hasText: /^AI$/ }).click();
      await page.getByRole('switch', { name: 'Enable AI Tools' }).click();
      const key = page.getByPlaceholder('sk-ant-...');
      await key.fill('sk-ant-e2e-not-a-real-key');
      await key.press('Enter');
      await expect(page.getByPlaceholder('sk-ant-...')).toHaveCount(0, { timeout: 15_000 });
      await page.keyboard.press('Escape');
      await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toHaveCount(0);
      await expect(consoleTitle).toHaveCount(0);

      // Escape on the Home Garden opens the console
      await page.keyboard.press('Escape');
      await expect(consoleTitle).toBeVisible();
      const modal = page.locator('[data-modal-open]', { hasText: 'Console — The Keeper' });
      await modal.getByRole('button', { name: 'Close', exact: true }).click();
      await expect(consoleTitle).toHaveCount(0);

      // The TopBar's Keeper button opens it too
      await page.getByRole('button', { name: 'Console', exact: true }).click();
      await expect(consoleTitle).toBeVisible();

      // Talk to the scripted model; the reply lands in the conversation
      const input = modal.getByPlaceholder('Send a message...');
      await input.fill('Hello Keeper');
      await input.press('Enter');
      // The prompt shows twice: as the conversation's title in the list and as the bubble
      await expect(modal.getByText('Hello Keeper', { exact: true })).toHaveCount(2);
      await expect(modal.getByText('Mock reply: Hello Keeper')).toBeVisible({ timeout: 30_000 });
      await page.screenshot({ path: 'e2e/.results/garden-panes-5-console.png' });

      await modal.getByRole('button', { name: 'Close', exact: true }).click();
      await expect(consoleTitle).toHaveCount(0);
      // The conversation is kept: reopen and it is still there
      await page.keyboard.press('Escape');
      await expect(modal.getByText('Mock reply: Hello Keeper')).toBeVisible();
      await modal.getByRole('button', { name: 'Close', exact: true }).click();
      await expect(consoleTitle).toHaveCount(0);
    } finally {
      await app.close();
    }
  });
});
