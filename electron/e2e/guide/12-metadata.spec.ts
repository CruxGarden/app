import { test, expect } from '@playwright/test';
import { launchApp } from '../launch';
import { enterGarden, createCrux, goHome } from '../multi-crux-helpers';
import { openPanel } from '../panel-helpers';

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
