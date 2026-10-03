import { togglePanel, panelPressed } from './panel-helpers';
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
 *  - Panes in a narrow native window: every header and close control stays
 *    reachable and a squeezed pane says "Widen the pane" (FEEL-02 evidence).
 *    Pane open/close/pin and the arrangement surviving a relaunch are
 *    journeys/04-panels.spec.ts; the Keeper Console is journeys/07-agent.spec.ts.
 */

const PANES: { type: string; label: string }[] = [
  { type: 'collaboration', label: 'Collaboration' },
  { type: 'artifacts', label: 'Artifacts' },
  { type: 'workshop', label: 'Workshop' },
  { type: 'details', label: 'Details' },
  { type: 'history', label: 'Growth' },
  { type: 'export', label: 'Export' },
  { type: 'sync', label: 'Sync' },
  { type: 'publish', label: 'Share' },
  { type: 'store', label: 'Store' },
];

/** Press a pane's TopBar toggle if it is not pressed yet; never toggle an open one shut. */
async function openPane(page: Page, toggle: string) {
  // panelPressed reads the bar without waiting: an unpinned closed pane has no square there.
  if ((await panelPressed(page, toggle)) !== 'true') await togglePanel(page, toggle);
  await expect(
    page.locator('header').getByRole('button', { name: toggle, exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
}

/** Garden location → Close crux lands on the Garden's Home; the workspace stays open. */
async function goHome(page: Page) {
  await page.getByRole('button', { name: 'Garden location', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Garden location', exact: true })
    .getByRole('button', { name: 'Close crux', exact: true })
    .click();
  await expect(page.getByText('Home Garden', { exact: true })).toBeVisible({ timeout: 15_000 });
}

/** The crux cards: "Open <title>" buttons inside the page. */
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

test.describe('home garden, crux picker, narrow panes', () => {
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
      await expect(
        page.getByRole('button', { name: 'Public Garden on crux.garden' }),
      ).toBeVisible();

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
      await expect(page.getByRole('alertdialog')).toContainText('Close this Crux workspace');
      await page.keyboard.press('Escape');
      await expect(page.getByRole('alertdialog')).toHaveCount(0);

      // ── Close Gamma's workspace, then the same menu really deletes it ──
      await closeWorkspace(page, 'Gamma Moss');
      await gammaCard.hover();
      await gammaCard.getByRole('button', { name: 'Crux actions' }).click();
      await page.getByRole('menuitem', { name: 'Delete' }).click();
      await expect(page.getByTestId('toast')).toContainText('Moved Gamma Moss to Recently deleted');
      await expect(page.getByRole('button', { name: 'Open Gamma Moss' })).toHaveCount(0, {
        timeout: 15_000,
      });
      await expect(page.getByTestId('trash-section')).toContainText('Gamma Moss'); // in the Trash, not gone
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
      // The Garden's closed Cruxes are listed too, marked "not open"; search narrows them.
      await expect(dialog.getByRole('button', { name: /^Alpha Bloom / })).toBeVisible();
      await expect(dialog.getByRole('button', { name: /^Beta Fern / })).toContainText('not open');
      const find = dialog.getByRole('textbox', { name: 'Find a Crux in My Garden' });
      await expect(find).toBeFocused();
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

  test('panes: a narrow native window keeps every header reachable and asks for room (FEEL-02)', async () => {
    const { app, page } = await launchApp();
    try {
      await enterGarden(page);
      await createCrux(page, 'Pane Garden');
      await expect(page.getByTestId('pane-body-collaboration')).toBeVisible({ timeout: 30_000 });

      // Open every pane, then the explicit repair: nine panes inserted one after
      // another can leave the last tile with no body room until "Arrange open
      // panels" (the picker's action) gives every tile its share. The layout is
      // saved (debounced) per crux.
      for (const { label } of PANES) await openPane(page, `Toggle ${label.toLowerCase()}`);
      await page.getByRole('button', { name: 'Add panel', exact: true }).click();
      const picker = page.getByRole('dialog', { name: 'Add panel', exact: true });
      await picker.getByRole('button', { name: 'Arrange open panels', exact: true }).click();
      await expect(picker).toHaveCount(0);
      for (const { type } of PANES)
        await expect(page.getByTestId(`pane-body-${type}`)).toBeVisible({ timeout: 30_000 });
      await page.waitForTimeout(800);
      await page.screenshot({ path: 'e2e/.results/garden-panes-3-all-open.png' });

      // Even in a narrow native window every tile and close control remains on screen.
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0]!.setSize(900, 700),
      );
      for (const { type, label } of PANES) {
        await expect(page.getByTestId(`pane-body-${type}`)).toBeVisible();
        const close = page.getByTitle(`Close ${label}`);
        await expect(close).toBeInViewport({ ratio: 1 });
        // A real pointer hit test detects overlapping panes as well as clipped headers.
        await close.click({ trial: true });
        const focus = page.getByRole('button', { name: `Focus ${label}`, exact: true });
        await expect(focus).toBeInViewport({ ratio: 1 });
        await focus.click({ trial: true });
      }
      await page.getByRole('button', { name: 'Focus Sync', exact: true }).click();
      await expect(page.getByTestId('pane-body-sync')).toBeVisible();
      await page.getByRole('button', { name: 'Restore panels', exact: true }).click();
      const widen = page.getByText('Widen the pane');
      await expect(widen.first()).toBeVisible();
      // A short tile must allow reading its empty state from the start, not clip its title above the scroll area.
      await expect
        .poll(async () =>
          page.locator('[data-testid^="pane-body-"]').evaluateAll((bodies) =>
            bodies.every((body) => {
              const title = [...body.querySelectorAll('p')].find(
                (p) => p.textContent === 'Widen the pane',
              );
              return (
                !title || title.getBoundingClientRect().top >= body.getBoundingClientRect().top - 1
              );
            }),
          ),
        )
        .toBe(true);
      // Some tiles need more room for their content; headers remain usable.
      await page.screenshot({ path: 'e2e/.results/garden-panes-4-narrow.png' });

      // Closing the others gives Collaboration its room back.
      for (const { type, label } of PANES) {
        if (type === 'collaboration') continue;
        await page.getByTitle(`Close ${label}`).click();
        await expect(page.getByTestId(`pane-body-${type}`)).toHaveCount(0);
      }
      await expect(widen).toHaveCount(0);
      await expect(page.getByPlaceholder('Send a message...')).toBeVisible();
    } finally {
      await app.close();
    }
  });
});
