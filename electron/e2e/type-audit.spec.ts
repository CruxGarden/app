import { test } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden, createCrux } from './multi-crux-helpers';

/** Type audit: dump the distinct font-size / family / weight combos on key screens. */
test('type audit', async () => {
  const { app, page } = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await enterGarden(page);
    await createCrux(page, 'Audit');
    await page.getByRole('button', { name: 'Add files', exact: true }).click();
    await page.getByRole('button', { name: 'New file' }).click({ timeout: 30_000 });
    const nameInput = page.getByRole('tree').getByRole('textbox');
    await nameInput.fill('index.html');
    await nameInput.press('Enter');
    await page.locator('.monaco-editor').first().waitFor({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Toggle share' }).click();
    await page.getByTestId('pane-body-publish').waitFor();
    const audit = async (label: string) => {
      const rows = await page.evaluate(() => {
        const out = new Map<string, { n: number; ex: string[] }>();
        for (const el of Array.from(document.querySelectorAll('body *'))) {
          const text = Array.from(el.childNodes)
            .filter((n) => n.nodeType === 3)
            .map((n) => n.textContent?.trim() ?? '')
            .join(' ')
            .trim();
          if (!text) continue;
          const cs = getComputedStyle(el);
          const fam = cs.fontFamily.includes('Mono')
            ? 'mono'
            : cs.fontFamily.includes('Outfit')
              ? 'outfit'
              : cs.fontFamily.includes('Cormorant')
                ? 'serif'
                : 'sys';
          const key = `${cs.fontSize} ${fam} ${cs.fontWeight}`;
          const e = out.get(key) ?? { n: 0, ex: [] };
          e.n++;
          if (e.ex.length < 4)
            e.ex.push(
              text.slice(0, 28) +
                ' <' +
                el.tagName.toLowerCase() +
                '.' +
                (el.className?.toString().split(' ').slice(0, 3).join('.') || '') +
                '>',
            );
          out.set(key, e);
        }
        return Array.from(out.entries()).sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]));
      });
      console.log(`\n=== ${label} ===`);
      for (const [k, v] of rows)
        console.log(`${k.padEnd(22)} ×${String(v.n).padStart(3)}  ${v.ex.join(' | ')}`);
    };
    await audit('builder');
    const cc = await page
      .getByTestId('check-controls')
      .getByRole('button')
      .first()
      .evaluate((el) => {
        const cs = getComputedStyle(el);
        return { size: cs.fontSize, fam: cs.fontFamily, cls: el.className, pad: cs.padding };
      })
      .catch(() => null);
    console.log('check-controls:', JSON.stringify(cc));
    await page.keyboard.press('ControlOrMeta+,');
    await page.getByRole('heading', { name: 'Settings' }).waitFor();
    await page.locator('h2', { hasText: /^AI$/ }).click();
    await page.locator('h2', { hasText: /^Garden$/ }).click();
    await page.waitForTimeout(300);
    await audit('settings');
    await page.keyboard.press('Escape');
    await page.locator('header').getByRole('button').first().click();
    await page.getByText('Home Garden', { exact: true }).waitFor();
    await audit('home');
  } finally {
    await app.close();
  }
});
