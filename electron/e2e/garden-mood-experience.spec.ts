import { test, expect, type Page } from '@playwright/test';
import { launchApp } from './launch';
import { showPane } from './panel-helpers';
import { enterGarden } from './multi-crux-helpers';

const accent = (page: Page) =>
  page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
  );
const PLASMA = '#9ff3e4';
const CONCRETE_SKY = '#a9c0ce';

async function openMood(page: Page) {
  return (await showPane(page, 'Mood')).getByRole('region', { name: 'Garden Mood' });
}
async function goToMyGarden(page: Page) {
  await page.getByRole('button', { name: 'Garden location', exact: true }).click();
  await page
    .getByRole('navigation', { name: 'Garden ancestry' })
    .getByRole('button', { name: 'My Garden', exact: true })
    .click();
  await expect(page.getByRole('button', { name: 'Garden location', exact: true })).toHaveText(
    'My Garden',
  );
}

test('each Garden wears its own Mood, inherits its parent’s, and repaints on the way through', async () => {
  test.setTimeout(150_000);
  let instance = await launchApp();
  const dir = instance.dir;
  try {
    let page = instance.page;
    await enterGarden(page);
    await expect.poll(() => accent(page), { timeout: 30_000 }).toBe(PLASMA);
    let line = await openMood(page);
    await expect(line).toContainText('My Garden wears the Default Mood');

    // A child Garden follows its parent until it chooses.
    await page.getByRole('button', { name: 'Navigator', exact: true }).click();
    await page.getByRole('button', { name: 'New Garden', exact: true }).click();
    await page.getByRole('textbox', { name: 'Garden name' }).fill('Studio');
    await page.getByRole('button', { name: 'Create Garden', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Garden location', exact: true })).toHaveText(
      'Studio',
    );
    line = await openMood(page);
    await expect(line).toContainText('Studio wears the Default Mood');

    // Wearing a Mood here makes it this Garden's own…
    await page
      .getByTestId('bundled-moods')
      .getByTestId('bundled-concrete-sky')
      .getByRole('button', { name: 'Apply' })
      .click();
    await expect.poll(() => accent(page)).toBe(CONCRETE_SKY);
    await expect(line).toContainText('Studio wears Concrete Sky');
    await expect(line.getByRole('button', { name: 'Follow My Garden' })).toBeVisible();
    await line.scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'e2e/.results/garden-mood-own.png' });

    // …and only this Garden's: the parent keeps its look, and it comes back on return.
    await goToMyGarden(page);
    await expect.poll(() => accent(page)).toBe(PLASMA);
    await expect(line).toContainText('My Garden wears the Default Mood');
    await page.getByRole('button', { name: 'Open Studio' }).click();
    await expect.poll(() => accent(page)).toBe(CONCRETE_SKY);

    // The built-in Mood's backing Crux is not one of the Garden's things.
    await goToMyGarden(page);
    await expect(page.getByRole('button', { name: 'Open Concrete Sky' })).toHaveCount(0);

    // The parent's choice flows down to a child that follows it.
    await page
      .getByTestId('bundled-moods')
      .getByTestId('bundled-concrete-sky')
      .getByRole('button', { name: 'Apply' })
      .click();
    await expect(line).toContainText('My Garden wears Concrete Sky');
    await page.getByRole('button', { name: 'Open Studio' }).click();
    await line.getByRole('button', { name: 'Use the Default Mood' }).click();
    await expect.poll(() => accent(page)).toBe(PLASMA);
    await expect(line).toContainText('Studio wears the Default Mood, chosen here');
    await line.getByRole('button', { name: 'Follow My Garden' }).click();
    await expect(line).toContainText('Studio wears Concrete Sky, from My Garden');
    await expect.poll(() => accent(page)).toBe(CONCRETE_SKY);

    // The choice is the graph's, so it survives a restart.
    await instance.app.close();
    instance = await launchApp({ dir });
    page = instance.page;
    await page.getByRole('button', { name: 'Enter', exact: true }).click();
    await expect.poll(() => accent(page), { timeout: 30_000 }).toBe(CONCRETE_SKY);
    // The restored workspace, with its remembered panes, settles before we look.
    await expect(page.getByTestId('pane-body-home')).toBeVisible();
    line = await openMood(page);
    await expect(line).toContainText('wears Concrete Sky');
    expect(
      await page.evaluate(() =>
        window.electronAPI!.sqlite.all(
          "SELECT title FROM cruxes WHERE kind = 'mood' AND deleted IS NULL",
        ),
      ),
    ).toEqual([{ title: 'Concrete Sky' }]);
  } finally {
    await instance.app.close();
  }
});
