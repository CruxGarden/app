import { test, expect } from '@playwright/test';
import { readdirSync } from 'node:fs';
import { launchApp } from './launch';
import { enterGarden, createCrux, storedCrux } from './multi-crux-helpers';

/**
 * The Collaboration's message actions and the composer's file gestures, with
 * the scripted model (CRUX_AI_MOCK=1, ai/mock-model.ts) — no key, no network:
 *
 *  - a provider refusal reads as a plain next step, and "Try again" runs the
 *    same request without a second copy of the person's message
 *    ("[mock:refused-once]" refuses the first attempt with a 401, then answers);
 *  - Copy on a reply and on the person's message puts the text on the clipboard;
 *  - an image pasted into the composer, and a file dropped on it, land in
 *    Artifacts the way "Add a file" does, and a text paste stays text.
 */
test.describe('message actions and composer files (mock AI)', () => {
  test.setTimeout(120_000);

  test('a refused turn is retried without repeating the message, and messages copy', async () => {
    const { app, page } = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
    try {
      await enterGarden(page);
      await createCrux(page, 'Retry');
      const composer = page.getByPlaceholder('Send a message...');
      const request = 'Say hello [mock:refused-once]';
      await composer.fill(request);
      await composer.press('Enter');

      const card = page.getByTestId('turn-job');
      await expect(card).toHaveAttribute('data-status', 'failed', { timeout: 30_000 });
      await expect(card.getByTestId('turn-error')).toContainText('refused this key');
      await expect(card.getByTestId('turn-error')).toContainText('Open Settings');
      await expect(card.getByTestId('turn-error-detail')).toContainText('invalid x-api-key');
      const people = page.locator('[data-role="user"]');
      await expect(people).toHaveCount(1);

      await card.getByRole('button', { name: 'Try again', exact: true }).click();
      const reply = page.locator('[data-role="assistant"]').filter({ hasText: 'Mock reply:' });
      await expect(reply).toBeVisible({ timeout: 30_000 });
      await expect(people).toHaveCount(1);
      // The reply that only carried the error is gone; the answer took its place
      // beside the Persona's greeting.
      await expect(page.locator('[data-role="assistant"]')).toHaveCount(2);
      await expect(page.getByRole('button', { name: 'Try again', exact: true })).toHaveCount(0);

      // Copy: quiet until the message is reached, reachable by keyboard, confirmed in place.
      const copyReply = reply.getByTestId('message-copy');
      await reply.hover();
      await expect(copyReply).toHaveAccessibleName('Copy message');
      await copyReply.click();
      await expect(copyReply).toHaveAttribute('data-state', 'copied');
      await expect(copyReply).toHaveAccessibleName('Copied');
      expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe(
        `Mock reply: ${request}`,
      );
      const copyMine = people.first().getByTestId('message-copy');
      await copyMine.focus();
      await page.keyboard.press('Enter');
      await expect(copyMine).toHaveAttribute('data-state', 'copied');
      expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe(request);
    } finally {
      await app.close();
    }
  });

  test('a pasted image and a dropped file go to Artifacts; pasted text stays text', async () => {
    const { app, page } = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
    try {
      await enterGarden(page);
      const id = await createCrux(page, 'Composer files');
      const folder = (await storedCrux(page, id)).projectFolder as string;
      const composer = page.getByPlaceholder('Send a message...');
      await composer.fill('Use this picture.');

      // 1×1 PNG, as a screenshot arrives: a clipboard file named image.png, no text.
      const png =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
      const pasteImage = () =>
        composer.evaluate((el, base64) => {
          const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
          const data = new DataTransfer();
          data.items.add(new File([bytes], 'image.png', { type: 'image/png' }));
          const event = new ClipboardEvent('paste', {
            clipboardData: data,
            bubbles: true,
            cancelable: true,
          });
          el.dispatchEvent(event);
          return event.defaultPrevented;
        }, png);
      expect(await pasteImage()).toBe(true);
      await expect(
        page.getByRole('status').filter({ hasText: 'Added 1 file to Artifacts' }),
      ).toBeVisible({ timeout: 15_000 });
      const pasted = () =>
        readdirSync(folder).filter((name) => /^pasted-image-.*\.png$/.test(name));
      await expect.poll(() => pasted().length).toBe(1);
      expect(pasted()[0]).toMatch(/^pasted-image-\d{8}-\d{6}\.png$/);
      await expect(composer).toHaveValue('Use this picture.');

      // A second paste never asks to replace the first.
      expect(await pasteImage()).toBe(true);
      await expect.poll(() => pasted().length, { timeout: 15_000 }).toBe(2);
      await expect(page.getByRole('dialog', { name: 'Are you sure?' })).toHaveCount(0);

      // A short text paste is still an ordinary paste.
      const textPrevented = await composer.evaluate((el) => {
        const data = new DataTransfer();
        data.setData('text/plain', 'just a line');
        const event = new ClipboardEvent('paste', {
          clipboardData: data,
          bubbles: true,
          cancelable: true,
        });
        el.dispatchEvent(event);
        return event.defaultPrevented;
      });
      expect(textPrevented).toBe(false);

      // Dropping a file on the composer: the affordance shows, the file lands once.
      const pill = page.getByTestId('composer');
      const drag = (type: 'dragenter' | 'dragover' | 'drop') =>
        pill.evaluate((el, eventType) => {
          const data = new DataTransfer();
          data.items.add(new File(['Dropped notes'], 'dropped.txt', { type: 'text/plain' }));
          let reachedWindow = false;
          const seen = () => {
            reachedWindow = true;
          };
          window.addEventListener(eventType, seen);
          el.dispatchEvent(
            new DragEvent(eventType, { dataTransfer: data, bubbles: true, cancelable: true }),
          );
          window.removeEventListener(eventType, seen);
          return reachedWindow;
        }, type);
      await drag('dragenter');
      await expect(page.getByTestId('composer-drop-hint')).toHaveText('Drop to add to Artifacts');
      await drag('dragover');
      // The drop is consumed by the composer: nothing beneath it handles it again.
      expect(await drag('drop')).toBe(false);
      await expect(page.getByTestId('composer-drop-hint')).toHaveCount(0);
      await expect
        .poll(() => readdirSync(folder).filter((name) => name === 'dropped.txt').length, {
          timeout: 15_000,
        })
        .toBe(1);
      await expect(
        page.getByRole('status').filter({ hasText: 'Added 1 file to Artifacts' }),
      ).toBeVisible();
      await expect(composer).toHaveValue('Use this picture.');
    } finally {
      await app.close();
    }
  });
});
