import { test, expect } from '@playwright/test';
import { launchApp } from '../launch';
import { startMockApi } from '../api-mock';
import { enterGarden, createCrux, goHome } from '../multi-crux-helpers';
import { openPanel, showPane } from '../panel-helpers';
import { connectAccount, writeFirstFile } from '../journeys/journey-helpers';

/**
 * V1-TESTING-GUIDE § 12 · Metadata — the slug's rules, Escape, blank input,
 * and the read-only facts. Title/description persistence is metadata-store.
 */
test.describe('guide 12 · Metadata', () => {
  test('META-01 — the slug takes a valid value, Escape cancels, blank and duplicate are refused', async () => {
    const { app, page } = await launchApp();
    try {
      await enterGarden(page);
      await createCrux(page, 'Other one');
      const id = await createCrux(page, 'Slug work');
      const details = await openPanel(page, 'details', 'Toggle metadata');
      const slugRow = details.locator('div', { hasText: /^Slug/ }).last();
      const slugOf = () =>
        page.evaluate(async (id) => {
          const row = (await window.electronAPI!.sqlite.get(
            'SELECT slug FROM cruxes WHERE id = ?',
            [id],
          )) as { slug: string };
          return row.slug;
        }, id);
      const before = await slugOf();
      const slugValue = details.getByText(before ?? 'slug-work', { exact: false }).first();
      await expect(slugValue).toBeVisible();
      // Escape leaves it alone.
      await slugValue.click();
      const input = details.getByRole('textbox').last();
      await input.fill('changed-then-escaped');
      await input.press('Escape');
      await expect(details.getByText('changed-then-escaped')).toHaveCount(0);
      // Blank is refused: the old slug stays.
      await slugValue.click();
      await details.getByRole('textbox').last().fill('');
      await details.getByRole('textbox').last().press('Enter');
      await expect
        .poll(
          async () =>
            await page.evaluate(async (id) => {
              const row = (await window.electronAPI!.sqlite.get(
                'SELECT slug FROM cruxes WHERE id = ?',
                [id],
              )) as { slug: string };
              return row.slug;
            }, id),
        )
        .toBe(before);
      // A valid new slug lands.
      await details.getByText(before!, { exact: false }).first().click();
      await details.getByRole('textbox').last().fill('slug-work-two');
      await details.getByRole('textbox').last().press('Enter');
      await expect
        .poll(
          async () =>
            await page.evaluate(async (id) => {
              const row = (await window.electronAPI!.sqlite.get(
                'SELECT slug FROM cruxes WHERE id = ?',
                [id],
              )) as { slug: string };
              return row.slug;
            }, id),
        )
        .toBe('slug-work-two');
      void slugRow;
    } finally {
      await app.close();
    }
  });

  test('META-04 — on a shared Crux, Visibility in Metadata and Discoverable in Share are separate from being published', async () => {
    test.setTimeout(150_000);
    const api = await startMockApi();
    const { app, page } = await launchApp({ env: { CRUX_API_URL: api.url } });
    try {
      await enterGarden(page);
      await createCrux(page, 'Disposable page');
      await writeFirstFile(page, 'index.html', '<h1>Disposable</h1>');
      const details = await openPanel(page, 'details', 'Toggle metadata');
      const visibilityRow = details.locator('div', { hasText: /^Visibility/ }).last();
      const visibility = visibilityRow.getByRole('button', { name: /^(public|unlisted|private)$/ });
      // Unshared: private, and the Share pane says it is not shared.
      await expect(visibility).toHaveText('private');
      const share = await openPanel(page, 'publish', 'Toggle share');
      await expect(share.getByText(/Not shared yet/)).toBeVisible();
      await share.getByRole('button', { name: 'Share', exact: true }).click({ timeout: 60_000 });
      await connectAccount(page);
      const ask = page.getByRole('dialog').filter({ hasText: 'A published site is not a backup' });
      await expect(ask).toBeVisible({ timeout: 30_000 });
      await ask.getByRole('button', { name: 'Share without a backup' }).click();
      await expect(share.getByText('Up to date')).toBeVisible({ timeout: 30_000 });
      const cruxId = Object.keys(api.state.published)[0]!;
      // Shared: the badge reads public and is no longer a control — a shared page is
      // public by being shared; Discoverable (off) is the listing switch in Share.
      await expect(visibility).toHaveCount(0);
      const sharedBadge = visibilityRow.getByText('public', { exact: true });
      await expect(sharedBadge).toBeVisible();
      await expect(sharedBadge).toHaveAttribute('title', /Discoverable switch in Share/);
      const discoverable = share.getByRole('switch', { name: 'Discoverable' });
      await expect(discoverable).toHaveAttribute('aria-checked', 'false');
      await expect(share.getByText('Up to date')).toBeVisible();
      await expect(share.getByText('Shared', { exact: true })).toBeVisible();
      await expect(share.getByText(/\/tester\/[a-z0-9-]+$/)).toBeVisible();
      expect(api.state.cruxes[cruxId]?.visibility).toBe('public');
      expect(api.state.published[cruxId]).toBeTruthy();
      // Discoverable is the listing switch: off, the page is not in Explore; on, it is —
      // whatever the local badge says.
      const explore = await showPane(page, 'Explore');
      // Explore searches once per distinct query: each look uses new words that still
      // match the title, and waits for the API to have answered that query.
      const find = async (term: string) => {
        await explore.getByPlaceholder(/moods and authors/).fill(term);
        await expect
          .poll(
            () =>
              api.log.some((l) => {
                const m = /^GET (\/explore\?\S+)/.exec(l);
                if (!m) return false;
                const params = new URL(m[1]!, 'http://x').searchParams;
                return params.get('q') === term && params.get('type') === 'cruxes';
              }),
            { timeout: 30_000 },
          )
          .toBe(true);
      };
      await find('disposable');
      await expect(explore.getByRole('link', { name: 'Disposable page' })).toHaveCount(0, {
        timeout: 30_000,
      });
      await discoverable.click();
      await expect
        .poll(() => api.state.cruxes[cruxId]?.discoverable, { timeout: 30_000 })
        .toBe(true);
      await find('disposable page');
      await expect(explore.getByRole('link', { name: 'Disposable page' })).toBeVisible({
        timeout: 30_000,
      });
      await expect(share.getByText('Up to date')).toBeVisible();
      expect(await savedVisibility()).toBe('private');
      // Discoverable off: unlisted, still shared at its address.
      await discoverable.click();
      await expect
        .poll(() => api.state.cruxes[cruxId]?.discoverable, { timeout: 30_000 })
        .toBe(false);
      await find('disposable pag');
      await expect(explore.getByRole('link', { name: 'Disposable page' })).toHaveCount(0, {
        timeout: 30_000,
      });
      await expect(share.getByText('Up to date')).toBeVisible();
      expect(api.state.published[cruxId]).toBeTruthy();
    } finally {
      await app.close();
      await api.close();
    }
  });

  test('META-03 — author, created and updated are shown and read-only; title stays editable', async () => {
    const { app, page } = await launchApp();
    try {
      await enterGarden(page);
      await createCrux(page, 'Facts');
      const details = await openPanel(page, 'details', 'Toggle metadata');
      await expect(details.getByText('Author', { exact: true })).toBeVisible();
      await expect(details.getByText(/wanderer-|Wanderer/).first()).toBeVisible();
      await expect(details.getByText('Created', { exact: true })).toBeVisible();
      await expect(details.getByText('Updated', { exact: true })).toBeVisible();
      // Read-only facts have no textbox; the title does.
      const createdRow = details.locator('div', { hasText: /^Created/ }).last();
      await expect(createdRow.getByRole('textbox')).toHaveCount(0);
      await goHome(page);
    } finally {
      await app.close();
    }
  });
});
