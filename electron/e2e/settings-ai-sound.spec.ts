import { hidePane, showPane } from './panel-helpers';
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './launch';
import { enterGarden } from './multi-crux-helpers';

type AudioState = {
  playing: boolean;
  trackName: string | null;
  enabled: boolean;
  volume: number;
  cuesPlayed: number;
};

type SecretsApi = {
  available: () => Promise<boolean>;
  get: (key: string) => Promise<string | null>;
};

const KEY_NAME = 'cruxgarden:apiKey:anthropic';
const KEY_VALUE = 'sk-ant-e2e-test-key-0000abcd';

/**
 * Settings → AI (keys live in the platform secret store, never in SQLite or
 * plaintext localStorage on desktop), the Mood pane's Sound tab (on/off,
 * volume, remove / re-pick / add a track), and the Persona tab (name, greeting,
 * avatar — and the greeting a new crux opens with).
 */
test.describe('settings AI, mood sound & persona', () => {
  test('AI: enable, add a provider key (masked, encrypted), remove it', async () => {
    const { app, page, dir } = await launchApp({ sound: true, ai: false });
    const storageKeys = () =>
      page.evaluate(() =>
        Object.keys(localStorage).filter((k) => k.startsWith('cruxgarden:apiKey:')),
      );
    const secret = (key: string) =>
      page.evaluate(
        (k) =>
          (window as unknown as { electronAPI: { secrets: SecretsApi } }).electronAPI.secrets.get(
            k,
          ),
        key,
      );
    try {
      await enterGarden(page);

      // ── Cmd+, opens Settings; the AI section is collapsed until clicked ──
      await page.keyboard.press('ControlOrMeta+,');
      await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
      const aiSwitch = page.getByRole('switch', { name: 'Enable AI Tools' });
      await expect(aiSwitch).toHaveCount(0);
      await page.locator('h2', { hasText: /^AI$/ }).click();
      await expect(aiSwitch).toBeVisible();

      // A fresh garden has AI tools off: no provider cards until enabled
      await expect(aiSwitch).toHaveAttribute('aria-checked', 'false');
      await expect(page.getByRole('link', { name: 'Anthropic' })).toHaveCount(0);
      await aiSwitch.click();
      await expect(aiSwitch).toHaveAttribute('aria-checked', 'true');
      const anthropic = page.locator('div.p-4.space-y-3', {
        has: page.getByRole('link', { name: 'Anthropic' }),
      });
      await expect(anthropic).toBeVisible();
      await expect(anthropic.getByText('Not configured')).toBeVisible();
      for (const provider of ['OpenAI', 'Google Gemini', 'Ollama', 'LM Studio']) {
        await expect(page.getByRole('link', { name: provider })).toBeVisible();
      }
      // Local inference authenticates nothing — it never asks for a key
      await expect(page.getByPlaceholder('sk-ant-...')).toBeVisible();
      await expect(
        page.getByText(
          'Your keys are encrypted on this device using system credential storage and sent only to the AI provider you choose.',
        ),
      ).toBeVisible();

      // ── Save a key: masked hint, Replace placeholder, Remove appears ─────
      const saveButton = anthropic.getByRole('button', { name: 'Save' });
      await expect(saveButton).toBeDisabled();
      await anthropic.getByPlaceholder('sk-ant-...').fill(KEY_VALUE);
      await expect(saveButton).toBeEnabled();
      await saveButton.click();
      await expect(anthropic.getByText('sk-ant-...abcd')).toBeVisible();
      await expect(anthropic.getByPlaceholder('Replace key...')).toHaveValue('');
      await expect(anthropic.getByRole('button', { name: 'Remove' })).toBeVisible();
      await expect(page.getByText(KEY_VALUE)).toHaveCount(0); // never shown in full
      await page.screenshot({ path: 'e2e/.results/settings-ai-1-key-saved.png' });

      // ── Where the key went: the platform secret store, never plaintext ──
      const encrypted = await page.evaluate(() =>
        (
          window as unknown as { electronAPI: { secrets: SecretsApi } }
        ).electronAPI.secrets.available(),
      );
      await expect.poll(() => secret(KEY_NAME)).toBe(KEY_VALUE);
      expect(encrypted).toBe(true);
      expect(await storageKeys()).toEqual([]);
      const onDisk = readFileSync(join(dir, 'userData', 'secrets.json'), 'utf8');
      expect(onDisk).toContain(`"${KEY_NAME}"`);
      expect(onDisk).not.toContain(KEY_VALUE);

      // ── The hint survives closing and reopening Settings ─────────────────
      await hidePane(page, 'Settings');
      await page.keyboard.press('ControlOrMeta+,');
      await page.locator('h2', { hasText: /^AI$/ }).click();
      await expect(anthropic.getByText('sk-ant-...abcd')).toBeVisible();

      // ── Remove: back to Not configured, gone from every store ───────────
      await anthropic.getByRole('button', { name: 'Remove' }).click();
      await expect(anthropic.getByText('Not configured')).toBeVisible();
      await expect(anthropic.getByRole('button', { name: 'Remove' })).toHaveCount(0);
      await expect(anthropic.getByPlaceholder('sk-ant-...')).toBeVisible();
      await expect.poll(() => secret(KEY_NAME)).toBeNull();
      expect(await storageKeys()).toEqual([]);

      // ── Switch AI tools off: the provider cards leave with it ────────────
      await aiSwitch.click();
      await expect(aiSwitch).toHaveAttribute('aria-checked', 'false');
      await expect(page.getByRole('link', { name: 'Anthropic' })).toHaveCount(0);
      await hidePane(page, 'Settings');
      await page.keyboard.press('ControlOrMeta+,');
      await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
      await page.locator('h2', { hasText: /^AI$/ }).click();
      await expect(aiSwitch).toHaveAttribute('aria-checked', 'false');
      await page.keyboard.press('Escape');
    } finally {
      await app.close();
    }
  });

  test('Mood → Sound: synth on/off and master volume', async () => {
    const { app, page } = await launchApp({ sound: true });
    const state = () =>
      page.evaluate(() =>
        (window as unknown as { __cruxAudio: { state: () => AudioState } }).__cruxAudio.state(),
      );
    try {
      await enterGarden(page);
      await (await showPane(page, 'Mood'))
        .getByRole('button', { name: 'Sound', exact: true })
        .click();
      const synth = page.getByRole('region', { name: 'Crux Synth', exact: true });
      await expect(synth).toBeVisible();
      expect((await state()).playing).toBe(false);
      await synth.getByRole('button', { name: 'Play synth' }).click();
      await expect.poll(async () => (await state()).playing).toBe(true);
      await synth.getByRole('switch', { name: 'Sound on' }).click();
      await expect.poll(async () => (await state()).enabled).toBe(false);
      expect((await state()).playing).toBe(false);
      await expect(synth.getByRole('button', { name: 'Play synth' })).toBeDisabled();
      await synth.getByRole('switch', { name: 'Sound off' }).click();
      await synth.getByRole('slider', { name: 'Synth master volume' }).fill('0.3');
      await expect.poll(async () => (await state()).volume).toBe(0.3);
      expect((await state()).trackName).toBe('Crux Synth');
      await page.keyboard.press('Escape');
    } finally {
      await app.close();
    }
  });

  test('Mood → Persona: name, greeting and avatar reach a new crux', async () => {
    const { app, page } = await launchApp({ sound: true });
    const greeting = 'Fern here. What shall we grow?';
    try {
      await enterGarden(page);

      await showPane(page, 'Mood');
      await page.getByRole('button', { name: 'Persona', exact: true }).click();
      const name = page.getByPlaceholder('Persona name');
      await expect(name).toHaveValue('Vel');
      await name.fill('Fern');
      const greetingInput = page.getByPlaceholder('A greeting shown when the console opens');
      await greetingInput.fill(greeting);

      // A chosen image replaces the current Mood avatar or its generated fallback
      const avatarButton = page.getByRole('button', { name: 'Choose an avatar' });
      const avatarImg = avatarButton.locator('img');
      const before = (await avatarImg.count()) ? await avatarImg.getAttribute('src') : null;
      const [chooser] = await Promise.all([page.waitForEvent('filechooser'), avatarButton.click()]);
      await chooser.setFiles(join(__dirname, 'fixtures', 'backdrop.png'));
      await expect.poll(() => avatarImg.getAttribute('src'), { timeout: 15_000 }).not.toBe(before);
      const after = await avatarImg.getAttribute('src');
      expect(after).toMatch(/^blob:/);
      await expect(page.getByRole('button', { name: 'Revert to Default' })).toBeVisible();
      await page.waitForTimeout(400); // persona saves per change
      await page.screenshot({ path: 'e2e/.results/settings-ai-4-persona.png' });
      await hidePane(page, 'Mood');

      // ── A new crux opens with the persona's greeting, under its name ────
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /^Blank/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      const bubbleText = page.getByText(greeting, { exact: true });
      await expect(bubbleText).toBeVisible({ timeout: 30_000 });
      const row = page.locator('[data-role="assistant"]').filter({ has: bubbleText });
      await expect(row.getByText('Fern', { exact: true })).toBeVisible();
      await expect(row.getByText('The Keeper')).toHaveCount(0);
      await expect(row.getByTestId('persona-avatar').locator('img')).toHaveAttribute(
        'src',
        /^blob:/,
      );
      await page.screenshot({ path: 'e2e/.results/settings-ai-5-greeting.png' });

      // ── The edits persist in the Persona tab ─────────────────────────────
      await showPane(page, 'Mood');
      await page.getByRole('button', { name: 'Persona', exact: true }).click();
      await expect(page.getByPlaceholder('Persona name')).toHaveValue('Fern');
      await expect(page.getByPlaceholder('A greeting shown when the console opens')).toHaveValue(
        greeting,
      );
      await expect(avatarImg).toHaveAttribute('src', /^blob:/);
      await page.keyboard.press('Escape');
    } finally {
      await app.close();
    }
  });
});
