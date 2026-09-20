import { expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

/**
 * Helpers for journeys against an API running on this machine (opt-in):
 *   CRUX_LOCAL_API=http://localhost:3001 CRUX_LOCAL_API_LOG=<its log file>
 * The API's mock mailer logs every message, so the sign-in code is read
 * from the log. NEXT-AGENT-HANDOFF has the start command.
 */
export const LOCAL_API = process.env.CRUX_LOCAL_API;
export const LOCAL_API_LOG = process.env.CRUX_LOCAL_API_LOG;

export function lastCodeFor(email: string): string | null {
  const text = readFileSync(LOCAL_API_LOG!, 'utf8');
  const lines = text.split('\n').filter((l) => l.includes('Email sent') && l.includes(email));
  const last = lines[lines.length - 1] ?? '';
  const m = /Your auth code is ([A-Za-z0-9_-]+)/.exec(last);
  return m?.[1] ?? null;
}

/** Settings → Connection: point the garden at the local API. */
export async function useLocalApi(page: Page) {
  await page.keyboard.press('ControlOrMeta+,');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await page.getByRole('textbox', { name: 'API address' }).fill(LOCAL_API!);
  await page.getByRole('button', { name: 'Use this address' }).click();
  await expect(page.getByTestId('api-address')).toContainText(`Talking to ${LOCAL_API}`);
}

/** Sign in at the local API with the code its mailer logged (Settings must be open). */
export async function signInLocally(page: Page, email = `gardener-${Date.now()}@example.com`) {
  await page.getByPlaceholder('email@example.com').fill(email);
  await page.getByRole('button', { name: 'Send Code' }).click();
  await expect(page.getByPlaceholder('Enter code')).toBeVisible();
  let code: string | null = null;
  await expect.poll(() => (code = lastCodeFor(email)), { timeout: 15000 }).not.toBeNull();
  await page.getByPlaceholder('Enter code').fill(code!);
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: `Connection (${new URL(LOCAL_API!).host})` }),
  ).toBeVisible({ timeout: 20000 });
  return email;
}
