import { test, expect, type Page } from '@playwright/test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchApp } from './launch';

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

async function plantGarden(page: Page) {
  await page.getByRole('button', { name: /enter/i }).click();
  await page.getByText('Plant a new garden').click();
  await page.getByRole('button', { name: 'Welcome' }).click();
  await expect(page.getByRole('button', { name: 'Add Crux' })).toBeVisible({ timeout: 30_000 });
}

/** A valid 16-bit mono PCM WAV: 44-byte header + `samples` samples of silence. */
function writeSilentWav(path: string, samples = 1000, rate = 8000) {
  const data = samples * 2;
  const buf = Buffer.alloc(44 + data);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + data, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); // fmt chunk size
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28); // byte rate
  buf.writeUInt16LE(2, 32); // block align
  buf.writeUInt16LE(16, 34); // bits per sample
  buf.write('data', 36);
  buf.writeUInt32LE(data, 40);
  writeFileSync(path, buf);
}

/**
 * Settings → AI (keys live in the platform secret store, never in SQLite or
 * plaintext localStorage on desktop), the Mood modal's Sound tab (on/off,
 * volume, remove / re-pick / add a track), and the Persona tab (name, greeting,
 * avatar — and the greeting a new crux opens with).
 */
test.describe('settings AI, mood sound & persona', () => {
  test('AI: enable, add a provider key (masked, encrypted), remove it', async () => {
    const { app, page, dir } = await launchApp();
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
      await plantGarden(page);

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
          'Your keys are stored locally in this browser and never sent to our servers.',
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
      if (encrypted) {
        // Desktop: safeStorage ciphertext in userData/secrets.json; the
        // localStorage copy is removed on save
        expect(await storageKeys()).toEqual([]);
        const onDisk = readFileSync(join(dir, 'userData', 'secrets.json'), 'utf8');
        expect(onDisk).toContain(`"${KEY_NAME}"`);
        expect(onDisk).not.toContain(KEY_VALUE);
      } else {
        // No keychain on this runner: the web fallback keeps it in localStorage
        expect(await storageKeys()).toEqual([KEY_NAME]);
      }

      // ── The hint survives closing and reopening Settings ─────────────────
      await page.keyboard.press('Escape');
      await expect(page.getByRole('heading', { name: 'Settings' })).toHaveCount(0);
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
      await page.keyboard.press('Escape');
      await expect(page.getByRole('heading', { name: 'Settings' })).toHaveCount(0);
      await page.keyboard.press('ControlOrMeta+,');
      await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
      await page.locator('h2', { hasText: /^AI$/ }).click();
      await expect(aiSwitch).toHaveAttribute('aria-checked', 'false');
      await page.keyboard.press('Escape');
    } finally {
      await app.close();
    }
  });

  test('Mood → Sound: on/off, volume, remove, re-pick and add a track', async () => {
    const { app, page } = await launchApp();
    const state = () =>
      page.evaluate(() =>
        (window as unknown as { __cruxAudio: { state: () => AudioState } }).__cruxAudio.state(),
      );
    const scratch = mkdtempSync(join(tmpdir(), 'crux-e2e-wav-'));
    const wav = join(scratch, 'e2e-loop.wav');
    writeSilentWav(wav);
    try {
      await plantGarden(page);
      await expect(page.getByRole('region', { name: 'Mood Bar' })).toBeVisible({
        timeout: 30_000,
      });
      // A fresh garden wears The Keeper: its track is the Mood's
      await expect
        .poll(async () => (await state()).trackName, { timeout: 30_000 })
        .toBe('Echoes From Beyond');

      // ── Cmd+M opens the Mood modal; Sound is one of its tabs ────────────
      await page.keyboard.press('ControlOrMeta+m');
      await expect(page.getByRole('heading', { name: 'Mood' })).toBeVisible();
      await page.getByRole('button', { name: 'Sound', exact: true }).click();
      const sound = page.getByTestId('sound-tab');
      await expect(sound).toBeVisible();
      await expect(sound.getByTestId('sound-track-name')).toHaveText('Echoes From Beyond');
      await expect(sound.getByText('loops · in your garden')).toBeVisible();

      // ── Sound off pauses; on again keeps the track ───────────────────────
      const onSwitch = sound.getByRole('switch', { name: 'Sound on' });
      await expect(onSwitch).toHaveAttribute('aria-checked', 'true');
      await onSwitch.click();
      const offSwitch = sound.getByRole('switch', { name: 'Sound off' });
      await expect(offSwitch).toHaveAttribute('aria-checked', 'false');
      await expect.poll(async () => (await state()).enabled).toBe(false);
      expect((await state()).playing).toBe(false);
      await expect(sound.getByRole('button', { name: 'Play track' })).toBeDisabled();
      await offSwitch.click();
      await expect(onSwitch).toHaveAttribute('aria-checked', 'true');
      await expect.poll(async () => (await state()).enabled).toBe(true);
      expect((await state()).trackName).toBe('Echoes From Beyond');

      // ── Volume slider drives the store and the readout ───────────────────
      const volume = sound.getByRole('slider', { name: 'Track volume' });
      await volume.fill('0.3');
      await expect.poll(async () => (await state()).volume).toBe(0.3);
      await expect(sound.getByText('30', { exact: true })).toBeVisible();
      await page.screenshot({ path: 'e2e/.results/settings-ai-2-sound.png' });

      // ── Remove the track: nothing plays, the file stays in the garden ────
      const echoes = sound.locator('li', { hasText: 'Echoes From Beyond' });
      await expect(echoes.getByText('playing as the track')).toBeVisible();
      await sound.getByRole('button', { name: 'Remove', exact: true }).click();
      await expect(sound.getByTestId('sound-track-name')).toHaveText('No track');
      await expect.poll(async () => (await state()).trackName).toBeNull();
      await expect(sound.getByRole('button', { name: 'Play track' })).toBeDisabled();
      await expect(echoes).toBeVisible();

      // ── Pick it again from "Audio in your garden" ────────────────────────
      await echoes.getByRole('button', { name: 'Use as track' }).click();
      await expect(sound.getByTestId('sound-track-name')).toHaveText('Echoes From Beyond');
      await expect.poll(async () => (await state()).trackName).toBe('Echoes From Beyond');
      await expect(echoes.getByText('playing as the track')).toBeVisible();

      // ── Add audio: a file chooser; the new file lands in the list and plays
      const [chooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        sound.getByRole('button', { name: 'Add audio' }).click(),
      ]);
      await chooser.setFiles(wav);
      const added = sound.locator('li', { hasText: 'e2e-loop.wav' });
      await expect(added).toBeVisible({ timeout: 15_000 });
      await expect(added.getByText('playing as the track')).toBeVisible();
      await expect(sound.getByTestId('sound-track-name')).toHaveText('e2e-loop');
      await expect.poll(async () => (await state()).trackName).toBe('e2e-loop');
      await expect(echoes.getByRole('button', { name: 'Use as track' })).toBeVisible();
      await page.screenshot({ path: 'e2e/.results/settings-ai-3-sound-added.png' });

      // ── Drop the added file: it leaves the garden and the track resets ──
      await added.getByRole('button', { name: 'Remove e2e-loop.wav' }).click();
      await expect(added).toHaveCount(0);
      await expect.poll(async () => (await state()).trackName).toBeNull();
      await expect(echoes).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('heading', { name: 'Mood' })).toHaveCount(0);
    } finally {
      await app.close();
    }
  });

  test('Mood → Persona: name, greeting and avatar reach a new crux', async () => {
    const { app, page } = await launchApp();
    const greeting = 'Fern here. What shall we grow?';
    try {
      await plantGarden(page);

      await page.keyboard.press('ControlOrMeta+m');
      await expect(page.getByRole('heading', { name: 'Mood' })).toBeVisible();
      await page.getByRole('button', { name: 'Persona', exact: true }).click();
      const name = page.getByPlaceholder('Persona name');
      await expect(name).toHaveValue('The Keeper');
      await name.fill('Fern');
      const greetingInput = page.getByPlaceholder('A greeting shown when the console opens');
      await greetingInput.fill(greeting);

      // The Keeper ships with a face; a chosen image replaces it
      const avatarButton = page.getByRole('button', { name: 'Choose an avatar' });
      const avatarImg = avatarButton.locator('img');
      const before = await avatarImg.getAttribute('src');
      const [chooser] = await Promise.all([page.waitForEvent('filechooser'), avatarButton.click()]);
      await chooser.setFiles(join(__dirname, 'fixtures', 'backdrop.png'));
      await expect.poll(() => avatarImg.getAttribute('src'), { timeout: 15_000 }).not.toBe(before);
      const after = await avatarImg.getAttribute('src');
      expect(after).toMatch(/^blob:/);
      await expect(page.getByRole('button', { name: 'Revert to Default' })).toBeVisible();
      await page.waitForTimeout(400); // persona saves per change
      await page.screenshot({ path: 'e2e/.results/settings-ai-4-persona.png' });
      await page.keyboard.press('Escape');
      await expect(page.getByRole('heading', { name: 'Mood' })).toHaveCount(0);

      // ── A new crux opens with the persona's greeting, under its name ────
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /^Blank/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      const bubbleText = page.getByText(greeting, { exact: true });
      await expect(bubbleText).toBeVisible({ timeout: 30_000 });
      const row = bubbleText.locator('xpath=ancestor::div[contains(@class, "items-end")][1]');
      await expect(row.getByText('Fern', { exact: true })).toBeVisible();
      await expect(row.getByText('The Keeper')).toHaveCount(0);
      await expect(row.getByTestId('persona-avatar').locator('img')).toHaveAttribute(
        'src',
        /^blob:/,
      );
      await page.screenshot({ path: 'e2e/.results/settings-ai-5-greeting.png' });

      // ── The edits persist in the Persona tab ─────────────────────────────
      await page.keyboard.press('ControlOrMeta+m');
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
