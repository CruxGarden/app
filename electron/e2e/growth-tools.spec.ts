import { test, expect } from '@playwright/test';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './launch';

/**
 * B0 — Growth as an API, with the scripted model (CRUX_AI_MOCK=1):
 * "rewind" makes the model snapshot ("Checkpoint"), break hello.txt, and
 * restore the checkpoint. The file comes back on disk and in the editor, and
 * the history holds both the checkpoint and the safety snapshot the restore
 * took first — also after leaving and re-opening the crux, which is how the
 * persisted chain (not the in-memory list) is checked.
 *
 * B1 — AGENTS.md: creating a Blog crux writes AGENTS.md (with the content
 * model) and a one-line CLAUDE.md into the Project Folder.
 */
test.describe('growth tools (mock AI)', () => {
  test.setTimeout(150_000);

  test('the model checkpoints, breaks a file, and restores it', async () => {
    const { app, page, dir } = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
    const gardenRoot = join(dir, 'garden');
    const fileOnDisk = (rel: string): string | null => {
      try {
        return readFileSync(join(gardenRoot, readdirSync(gardenRoot)[0]!, rel), 'utf8');
      } catch {
        return null;
      }
    };
    try {
      await page.getByRole('button', { name: /enter/i }).click();
      await page.getByText('Plant a new garden').click();
      await page.getByRole('button', { name: 'Welcome' }).click();
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /^Blank/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();

      // Turn 1: a file to break (existing "write" script) + its auto-snapshot
      const input = page.getByPlaceholder('Send a message...');
      await expect(input).toBeVisible({ timeout: 30_000 });
      await input.fill('Please write hello');
      await input.press('Enter');
      await expect(page.getByText('Done — I wrote that file for you.')).toBeVisible({
        timeout: 30_000,
      });
      await expect.poll(() => fileOnDisk('hello.txt')).toBe('Hello from the mock AI.\n');

      // Turn 2: snapshot → read → write (broken) → restore → reply
      await input.fill('Please rewind');
      await input.press('Enter');
      await expect(page.getByText('Done — rewound to the checkpoint.')).toBeVisible({
        timeout: 60_000,
      });
      // The restore put the original content back on disk (the broken write
      // happened in between — the final state is what matters)
      await expect
        .poll(() => fileOnDisk('hello.txt'), { timeout: 30_000 })
        .toBe('Hello from the mock AI.\n');
      await page.screenshot({ path: 'e2e/.results/growth-tools-1-restored.png' });

      // LIVE, without re-opening: the timeline already holds the checkpoint
      // and the safety snapshot (the tools ran through the open workspace's
      // store), and the restore rebuilt the conversation without duplicating
      // it — each user message appears exactly once.
      await page.getByRole('button', { name: 'Toggle history' }).click();
      await expect(page.getByText('Checkpoint', { exact: true })).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText('Before revert', { exact: true })).toBeVisible();
      await expect(page.getByText('Please write hello', { exact: true })).toHaveCount(1);
      await expect(page.getByText('Please rewind', { exact: true })).toHaveCount(1);
      await expect(page.getByText('Done — rewound to the checkpoint.')).toHaveCount(1);
      await expect(page.getByText('Done — I wrote that file for you.')).toHaveCount(1);
      await page.getByRole('button', { name: 'Toggle history' }).click();

      // Re-open the crux: history and files are read back from the store —
      // the checkpoint and the safety snapshot are both in the timeline, and
      // the editor shows the restored content.
      await page
        .getByRole('link', { name: /garden|home/i })
        .first()
        .click()
        .catch(async () => {
          await page.evaluate(() => window.history.back());
        });
      await page.getByText('My Crux', { exact: true }).first().click();
      const tree = page.getByRole('tree');
      await expect(tree).toBeVisible({ timeout: 30_000 });
      await tree.getByText('hello.txt', { exact: true }).click();
      const monaco = page.locator('.monaco-editor').first();
      await expect(monaco).toBeVisible({ timeout: 30_000 });
      await expect(monaco).toContainText('Hello from the mock AI');
      await expect(monaco).not.toContainText('BROKEN');

      if (!(await page.getByText('Checkpoint', { exact: true }).isVisible())) {
        await page.getByRole('button', { name: 'Toggle history' }).click();
      }
      await expect(page.getByText('Checkpoint', { exact: true })).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText('Before revert', { exact: true })).toBeVisible();
      await page.screenshot({ path: 'e2e/.results/growth-tools-2-timeline.png' });
    } finally {
      await app.close();
    }
  });
});

test.describe('AGENTS.md per Project Folder', () => {
  test.setTimeout(120_000);

  test('a Blog crux gets AGENTS.md with the content model, and CLAUDE.md pointing at it', async () => {
    const { app, page, dir } = await launchApp();
    const gardenRoot = join(dir, 'garden');
    const folder = () => join(gardenRoot, readdirSync(gardenRoot)[0]!);
    const fileOnDisk = (rel: string): string | null => {
      try {
        return existsSync(join(folder(), rel)) ? readFileSync(join(folder(), rel), 'utf8') : null;
      } catch {
        return null;
      }
    };
    try {
      await page.getByRole('button', { name: /enter/i }).click();
      await page.getByText('Plant a new garden').click();
      await page.getByRole('button', { name: 'Welcome' }).click();
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /Astro Blog/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await expect(page.getByRole('button', { name: /new post/i }).first()).toBeVisible({
        timeout: 30_000,
      });

      await expect.poll(() => fileOnDisk('AGENTS.md'), { timeout: 30_000 }).not.toBeNull();
      const agents = fileOnDisk('AGENTS.md')!;
      expect(agents).toContain('# AGENTS.md');
      expect(agents).toContain('Template: Astro Blog');
      expect(agents).toContain('## Content Model');
      expect(agents).toContain('src/pages/posts/*.md');
      expect(agents).toContain('New Post — creates src/pages/posts/{slug}.md');
      expect(agents).toContain('`check_site`');
      expect(agents).toContain('## Never touch');
      expect(agents).toContain('## Recording work (Growth)');
      expect(agents).toContain('## Voice');
      expect(agents).toMatch(/\*\*The Keeper\*\*/);

      await expect
        .poll(() => fileOnDisk('CLAUDE.md'), { timeout: 30_000 })
        .toMatch(/^See AGENTS\.md/);
      await page.screenshot({ path: 'e2e/.results/growth-tools-3-agents-md.png' });
    } finally {
      await app.close();
    }
  });
});
