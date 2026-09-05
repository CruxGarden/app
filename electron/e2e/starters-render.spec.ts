import { test, expect, chromium, type Page } from '@playwright/test';
import { launchApp } from './launch';
import {
  fiveWsScript,
  fiveWsLineFor,
  FIVE_WS_OPENING,
  FIVE_WS_WHY_MISS,
} from '../../src/ai/mock-model';
import { parseShelf, pickEntry } from '../../src/game/shelf';
import { matchesName } from '../../src/game/hidden';
import historyShelf from '../../src/templates/shelves/history.json';

/**
 * The Feed, Media and 5Ws starters actually build: open an item so astro dev
 * starts, then assert on the served site itself. Opt-in (pnpm install + two
 * dev servers): CRUX_SLOW=1 npx playwright test e2e/starters-render.spec.ts
 *
 * 5Ws also plays: /play is a React island that runs the round in the browser
 * with the visitor's AI. Here a scripted model rides in on
 * `window.__fiveWsModel` (the island prefers it, so there is no key step) and
 * answers through the app's own mock script; the crux.garden API is routed to
 * an in-test stand-in for the Crux Store (the board and the played record are
 * keys in the crux's own store) and the email-code sign-in.
 */

const API = 'https://api.e2e.invalid';
/** Soft Serve (global.css): a blush page, white cards, the voice bold in the text colour, the interface grey. */
const LIGHT = {
  ground: 'rgb(253, 238, 234)',
  card: 'rgb(255, 255, 255)',
  text: 'rgb(28, 28, 28)',
  muted: 'rgb(122, 111, 107)',
};
/** Dark: deep navy with the same coral. */
const DARK = {
  ground: 'rgb(15, 26, 46)',
  card: 'rgb(23, 36, 64)',
  text: 'rgb(243, 241, 236)',
};
/** One rounded sans stack; Outfit only if the visitor has it (no webfont download). */
const SANS = /Outfit|SF Pro Rounded|ui-rounded|system-ui|sans-serif/i;
const CARD_GUTTER = 12; // cards edge-to-edge on a phone, 12px either side
const theme = (p: Page) => p.evaluate(() => localStorage.getItem('5ws:theme'));
const bg = (el: Element) => getComputedStyle(el).backgroundColor;
const utcDay = (daysAgo = 0) =>
  new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);

/** The scripted model in the page: the app's mock script runs in Node, the page calls it. */
async function withScriptedModel(p: Page) {
  await p.exposeFunction('__fiveWsScript', async (prompt: unknown) => {
    const text = fiveWsScript(prompt as Parameters<typeof fiveWsScript>[0]) ?? 'Mock.';
    // "slowly": hold the answer so the test can watch the clock stand still while composing
    const user = JSON.stringify(prompt);
    if (/slowly/i.test(user)) await new Promise((r) => setTimeout(r, 1500));
    return text;
  });
  await p.addInitScript(() => {
    const usage = {
      inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: 0 },
      outputTokens: { total: 10, text: 10, reasoning: 0 },
    };
    const w = window as unknown as {
      __fiveWsScript: (prompt: unknown) => Promise<string>;
      __fiveWsModel: unknown;
    };
    w.__fiveWsModel = {
      specificationVersion: 'v4',
      provider: 'mock',
      modelId: 'mock-5ws',
      supportedUrls: {},
      async doGenerate(options: { prompt: unknown }) {
        const text = await w.__fiveWsScript(options.prompt);
        return {
          content: [{ type: 'text', text }],
          finishReason: { unified: 'stop', raw: undefined },
          usage,
          warnings: [],
        };
      },
      async doStream() {
        throw new Error('the play page never streams');
      },
    };
  });
}

/** An entry on a day's board, as the page keeps it under the `leaderboard:<day>` key. */
type Entry = { name: string; score: number; seconds: number; at: string };

/**
 * The API as the play page sees it: the email-code sign-in (and the profile
 * that names the account), and the crux's Crux Store — `leaderboard:<day>`
 * (mode `public`: the crux's one value, read by anyone, written with the
 * visitor's token like every store write; the page keeps one entry per
 * username) and `played:<day>` (mode `protected`: the visitor's own). Astro
 * dev has no publish injection, so
 * the page is told its crux id and API origin the way the injection would.
 */
async function withPlayApi(p: Page) {
  const writes: Array<{ key: string; mode: string; value: unknown; bearer: string | null }> = [];
  const today = utcDay();
  const others: Entry[] = [
    { name: 'ada', score: 10, seconds: 74, at: `${today}T08:00:00.000Z` },
    { name: 'grace', score: 8, seconds: 121, at: `${today}T08:10:00.000Z` },
  ];
  const shared: Record<string, unknown> = { [`leaderboard:${today}`]: { entries: others } };
  const mine: Record<string, unknown> = {}; // the tester's protected keys
  await p.addInitScript(
    (cfg) => {
      (window as unknown as { crux: unknown }).crux = { publish: cfg };
    },
    { cruxId: 'crux-e2e', apiBase: API },
  );
  await p.route(`${API}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const cors = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': 'GET,POST,PUT,OPTIONS',
    };
    const json = (status: number, body: unknown) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        headers: cors,
        body: JSON.stringify(body),
      });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const bearer = /^Bearer (.+)$/.exec(req.headers()['authorization'] ?? '')?.[1] ?? null;
    if (url.pathname === '/auth/code') return json(200, { message: 'sent' });
    if (url.pathname === '/auth/login')
      return json(200, { accessToken: 'test-access', refreshToken: 'test-refresh' });
    if (url.pathname === '/auth/profile') {
      if (!bearer) return json(401, { statusCode: 401, message: 'Unauthorized' });
      return json(200, {
        id: 'acct-1',
        email: 'tester@example.com',
        author: { id: 'author-1', username: 'tester' },
      });
    }
    const m = /^\/store\/([^/]+)\/([^/]+)$/.exec(url.pathname);
    if (m && m[1] === 'crux-e2e') {
      const key = decodeURIComponent(m[2]!);
      if (req.method() === 'PUT') {
        const body = req.postDataJSON() as { value: unknown; mode?: string };
        const mode = body.mode ?? 'protected';
        // Every write needs an account, whatever the mode.
        if (!bearer)
          return json(401, {
            statusCode: 401,
            message: 'Writing to the store requires a signed-in account',
          });
        writes.push({ key, mode, value: body.value, bearer });
        if (mode === 'protected') mine[key] = body.value;
        else shared[key] = body.value;
        return json(200, { value: body.value });
      }
      if (key in shared) return json(200, { value: shared[key] });
      // protected: the visitor's own, or nothing
      return json(200, { value: bearer ? (mine[key] ?? null) : null });
    }
    return json(404, {
      statusCode: 404,
      message: `e2e: unhandled ${req.method()} ${url.pathname}`,
    });
  });
  return { writes };
}

test.describe('starter templates render through astro dev', () => {
  test.skip(!process.env.CRUX_SLOW, 'set CRUX_SLOW=1 (network: pnpm install)');
  test.setTimeout(10 * 60_000);

  test('Feed grid and post; Media list with the pending player', async () => {
    const { app, page } = await launchApp();
    const browser = await chromium.launch();
    try {
      await page.getByRole('button', { name: /enter/i }).click();
      await page.getByText('Plant a new garden').click();
      await page.getByRole('button', { name: 'Welcome' }).click();

      // ── Feed ──
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /Astro Feed/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await expect(page.getByRole('button', { name: /new post/i }).first()).toBeVisible({
        timeout: 30_000,
      });
      // Open a sample post → editor + astro dev preview
      await page.getByText('Morning light').first().click();
      const preview = page.locator('iframe[src^="http://127.0.0.1"]');
      await expect(preview).toBeVisible({ timeout: 5 * 60_000 });
      const feedUrl = new URL('/', (await preview.getAttribute('src'))!).toString();
      const site = await browser.newPage({ viewport: { width: 1200, height: 900 } });
      await site.goto(feedUrl);
      await expect(site.locator('.profile h1')).toHaveText('Your Name');
      await expect(site.locator('.grid .tile')).toHaveCount(2);
      await site.locator('.grid .tile').first().click();
      await expect(site.locator('.post h1')).toBeVisible();
      await expect(site.locator('.post img')).toBeVisible();
      await site.screenshot({ path: 'e2e/.results/starters-render-1-feed.png', fullPage: true });
      await site.close();

      // ── Media ──
      await page.goto(page.url().replace(/\/c\/.*$/, '/home'));
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /Astro Media/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Add media' }).first()).toBeVisible({
        timeout: 30_000,
      });
      await page.getByText('Your first track goes here').first().click();
      const preview2 = page.locator('iframe[src^="http://127.0.0.1"]');
      await expect(preview2).toBeVisible({ timeout: 5 * 60_000 });
      const mediaUrl = new URL('/', (await preview2.getAttribute('src'))!).toString();
      const site2 = await browser.newPage({ viewport: { width: 1200, height: 900 } });
      await site2.goto(mediaUrl);
      await expect(site2.locator('header.site h1')).toHaveText('Your Name');
      await expect(site2.locator('.items .item')).toHaveCount(1);
      await expect(site2.locator('.pending')).toContainText('No file yet');
      await site2.screenshot({ path: 'e2e/.results/starters-render-2-media.png', fullPage: true });
      await site2.close();
    } finally {
      await browser.close();
      await app.close();
    }
  });

  test('5Ws shelf lists its entries; the sample round reveals in Soft Serve', async () => {
    const { app, page } = await launchApp();
    const browser = await chromium.launch();
    try {
      await page.getByRole('button', { name: /enter/i }).click();
      await page.getByText('Plant a new garden').click();
      await page.getByRole('button', { name: 'Welcome' }).click();

      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /^5Ws/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await expect(page.getByRole('button', { name: /Add to shelf$/ }).first()).toBeVisible({
        timeout: 30_000,
      });
      // Open the sample round → editor + astro dev preview
      await page.getByText('Round 1', { exact: true }).first().click();
      const preview = page.locator('iframe[src^="http://127.0.0.1"]');
      await expect(preview).toBeVisible({ timeout: 5 * 60_000 });
      const origin = new URL('/', (await preview.getAttribute('src'))!).toString();
      const scrollWidth = (p: import('@playwright/test').Page) =>
        p.evaluate(() => document.documentElement.scrollWidth);

      // The board is a key in the crux's own store — `leaderboard:<day>`, mode
      // `public` — read by anyone. A published page gets its crux id + API origin
      // from the publish injection (window.crux.publish); astro dev has no
      // injection, so stand both in and answer the store reads.
      const today = new Date().toISOString().slice(0, 10);
      const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
      const boards: Record<string, Entry[]> = {
        [today]: [
          { name: 'ada', score: 10, seconds: 74, at: `${today}T08:00:00.000Z` },
          { name: 'grace', score: 9, seconds: 121, at: `${today}T08:10:00.000Z` },
          { name: 'hedy', score: 9, seconds: 140, at: `${today}T08:20:00.000Z` },
        ],
        [yesterday]: [{ name: 'emmy', score: 7, seconds: 200, at: `${yesterday}T09:00:00.000Z` }],
      };
      const storeReads: string[] = [];
      const withBoard = async (p: import('@playwright/test').Page) => {
        await p.addInitScript(
          (cfg) => {
            (window as unknown as { crux: unknown }).crux = { publish: cfg };
          },
          { cruxId: 'crux-e2e', apiBase: API },
        );
        await p.route(`${API}/**`, (route) => {
          const url = new URL(route.request().url());
          const m = /^\/store\/([^/]+)\/([^/]+)$/.exec(url.pathname);
          const key = m ? decodeURIComponent(m[2]!) : '';
          storeReads.push(`${route.request().method()} ${key}`);
          const day = key.startsWith('leaderboard:') ? key.slice('leaderboard:'.length) : null;
          const entries = (day && boards[day]) || null;
          void route.fulfill({
            status: m && m[1] === 'crux-e2e' && route.request().method() === 'GET' ? 200 : 404,
            contentType: 'application/json',
            headers: { 'access-control-allow-origin': '*' },
            body: JSON.stringify({ value: entries ? { entries } : null }),
          });
        });
      };

      // Mobile first: at 390px the shelf and a round page read in one column, no sideways scroll
      const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await withBoard(phone);
      await phone.goto(origin);
      await expect(phone.locator('h1.question')).toHaveText('Who am I?');
      expect(await scrollWidth(phone)).toBeLessThanOrEqual(390);
      // Cards edge-to-edge with 12px gutters; every entry row is a thumb-sized target
      const hero = (await phone.locator('.card.hero').boundingBox())!;
      expect(Math.round(hero.x)).toBe(CARD_GUTTER);
      expect(Math.round(hero.width)).toBe(390 - 2 * CARD_GUTTER);
      expect(
        (await phone.locator('ol.entries li').first().boundingBox())!.height,
      ).toBeGreaterThanOrEqual(44);
      await phone.screenshot({
        path: 'e2e/.results/starters-render-5-5ws-phone.png',
        fullPage: true,
      });
      await phone.locator('ul.round-list a').first().click();
      await expect(phone.locator('.transcript h3', { hasText: 'This was' })).toBeVisible();
      expect(await scrollWidth(phone)).toBeLessThanOrEqual(390);
      await phone.screenshot({
        path: 'e2e/.results/starters-render-6-5ws-phone-round.png',
        fullPage: true,
      });
      await phone.close();

      const site = await browser.newPage({ viewport: { width: 1200, height: 900 } });
      await withBoard(site);

      // The shelf: the Shelf's own question is the heading; every entry is listed
      await site.goto(origin);
      expect(await scrollWidth(site)).toBeLessThanOrEqual(1200);
      // Today's board: three rows, rank/name/score/time, and a Yesterday link that swaps in place
      const board = site.locator('#today');
      await expect(board).toBeVisible();
      await expect(board.locator('tbody tr')).toHaveCount(3);
      await expect(board.locator('tbody tr').first().locator('td')).toHaveText([
        '1',
        'ada',
        '10',
        '1:14',
      ]);
      await board.getByRole('link', { name: 'Yesterday' }).click();
      await expect(board.locator('h2')).toHaveText('Yesterday');
      await expect(board.locator('tbody tr')).toHaveCount(1);
      await board.getByRole('link', { name: 'Today' }).click();
      await expect(board.locator('tbody tr')).toHaveCount(3);
      // The shelf page only reads, and reads exactly the two days it shows
      expect(new Set(storeReads)).toEqual(
        new Set([`GET leaderboard:${today}`, `GET leaderboard:${yesterday}`]),
      );
      await expect(site).toHaveTitle('5Ws — Ten Questions. Five minutes. Good luck.');
      await expect(site.locator('h1.question')).toHaveText('Who am I?');
      const entries = site.locator('ol.entries li');
      expect(await entries.count()).toBeGreaterThanOrEqual(40);
      await expect(entries.filter({ hasText: 'Hypatia' })).toContainText('person');
      await expect(site.locator('ul.round-list li')).toHaveCount(1);
      await site.screenshot({
        path: 'e2e/.results/starters-render-3-5ws-shelf.png',
        fullPage: true,
      });

      // The sample round: a white card on the blush page; the voice bold in the text colour,
      // the player's lines smaller and grey — one sans stack, no monospace anywhere
      await site.locator('ul.round-list a').first().click();
      await expect(site.locator('.round-head h1')).toContainText('Round 1');
      const you = site.locator('.transcript p', { hasText: 'Are you a man or a woman?' });
      await expect(you).toBeVisible();
      const reveal = site.locator('.transcript h3', { hasText: 'This was' });
      await expect(reveal).toBeVisible();
      await expect(reveal.locator('xpath=following-sibling::p[1]')).toContainText('Hypatia');
      const family = (el: Element) => getComputedStyle(el).fontFamily;
      const color = (el: Element) => getComputedStyle(el).color;
      const weight = (el: Element) => getComputedStyle(el).fontWeight;
      expect(await reveal.evaluate(family)).toMatch(SANS);
      expect(await reveal.evaluate(family)).not.toMatch(/mono/i);
      expect(await reveal.evaluate(weight)).toBe('800');
      // The voice: the first paragraph that is not a "You:" line
      const voice = site.locator('.transcript p:not(:has(> strong:first-child))').first();
      await expect(voice).toContainText('harder city');
      expect(await voice.evaluate(family)).toMatch(SANS);
      expect(await voice.evaluate(color)).toBe(LIGHT.text);
      expect(await voice.evaluate(weight)).toBe('600');
      expect(await you.evaluate(family)).toMatch(SANS);
      expect(await you.evaluate(color)).toBe(LIGHT.muted);
      expect(await you.evaluate(weight)).toBe('400');
      expect(
        await voice.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
      ).toBeGreaterThan(await you.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)));
      // Light by default (this browser's system is light); nothing picked yet
      await expect(site.locator('html')).toHaveAttribute('data-theme', 'light');
      await expect(site.locator('html')).toHaveAttribute('data-theme-choice', 'system');
      expect(await theme(site)).toBeNull();
      expect(await site.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(
        LIGHT.ground,
      );
      const roundCard = site.locator('article.round.card');
      expect(await roundCard.evaluate(bg)).toBe(LIGHT.card);
      expect(await roundCard.evaluate((el) => getComputedStyle(el).borderStyle)).toBe('none');
      expect(await roundCard.evaluate((el) => getComputedStyle(el).borderRadius)).toBe('24px');
      await expect(site.locator('.adjacent a', { hasText: 'The shelf' })).toBeVisible();
      expect(await scrollWidth(site)).toBeLessThanOrEqual(1200);
      await site.screenshot({
        path: 'e2e/.results/starters-render-4-5ws-round.png',
        fullPage: true,
      });

      // The toggle in the masthead: system → light → dark, remembered; the head applies it
      // before first paint on the next page
      const siteToggle = site.locator('#theme-toggle');
      await expect(siteToggle).toHaveAccessibleName(/^Theme: System/);
      await siteToggle.click();
      await expect(siteToggle).toHaveAccessibleName(/^Theme: Light/);
      await expect(site.locator('html')).toHaveAttribute('data-theme', 'light');
      expect(await theme(site)).toBe('light');
      await siteToggle.click();
      await expect(siteToggle).toHaveAccessibleName(/^Theme: Dark/);
      await expect(site.locator('html')).toHaveAttribute('data-theme', 'dark');
      expect(await theme(site)).toBe('dark');
      expect(await site.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(
        DARK.ground,
      );
      expect(await roundCard.evaluate(bg)).toBe(DARK.card);
      expect(await voice.evaluate(color)).toBe(DARK.text);
      await site.reload();
      await expect(site.locator('html')).toHaveAttribute('data-theme', 'dark');
      await expect(site.locator('html')).toHaveAttribute('data-theme-choice', 'dark');
      await site.screenshot({
        path: 'e2e/.results/5ws-soft-transcript-dark-1200.png',
        fullPage: true,
      });
      await site.locator('#theme-toggle').click();
      await expect(site.locator('html')).toHaveAttribute('data-theme-choice', 'system');
      await expect(site.locator('html')).toHaveAttribute('data-theme', 'light');
      expect(await theme(site)).toBe('system');
      await site.close();

      // ── /play: the round itself, in the browser ──
      const shelf = parseShelf(historyShelf);
      const daily = pickEntry(shelf, utcDay()); // the same seed the page uses: the UTC day
      const wrong = ['Cleopatra', 'Napoleon', 'Socrates'].find((n) => !matchesName(daily, n))!;
      const play = await browser.newPage({ viewport: { width: 1200, height: 900 } });
      await play.context().grantPermissions(['clipboard-read', 'clipboard-write']);
      await play
        .context()
        .route('https://duckduckgo.com/**', (route) =>
          route.fulfill({ contentType: 'text/html', body: '<title>search stand-in</title>' }),
        );
      await withScriptedModel(play);
      const api = await withPlayApi(play);
      await play.goto(origin + 'play/');

      // Boot: a dark screen with one cursor, then the banner types in
      const app = play.locator('.round-app');
      await expect(app).toHaveClass(/booting/, { timeout: 60_000 });
      await expect(app.locator('.banner .cursor')).toBeVisible();
      await expect(app).toHaveAttribute('data-boot', 'title'); // after the dark 900 ms
      // …in coral, on a white card on the blush page
      expect(await play.locator('.round-card .banner').evaluate(color)).toBe('rgb(255, 74, 46)');
      expect(await play.locator('.round-card').evaluate(bg)).toBe(LIGHT.card);
      expect(await play.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(
        LIGHT.ground,
      );
      await play.screenshot({ path: 'e2e/.results/5ws-soft-boot-light-1200.png' });
      await expect(app).not.toHaveClass(/booting/, { timeout: 15_000 });
      await expect(play.locator('.round-card .banner')).toHaveText('5Ws · Who am I?');
      await expect(play.locator('.round-card .banner')).toHaveCSS('color', LIGHT.text); // settled

      // Someone is already talking — the voice types, bold, and the cursor goes when it is done;
      // the interface is the same face, smaller and grey; the readouts are soft pills
      const opening = play.locator('.round-voice .voice.opening');
      await expect(opening).toHaveText(FIVE_WS_OPENING, { timeout: 60_000 });
      await expect(opening.locator('.cursor')).toHaveCount(0);
      expect(await opening.evaluate(family)).toMatch(SANS);
      expect(await opening.evaluate(color)).toBe(LIGHT.text);
      expect(await opening.evaluate(weight)).toBe('600');
      expect(await play.locator('.status').evaluate(family)).toMatch(SANS);
      expect(await play.getByTestId('points').evaluate(color)).toBe(LIGHT.text);
      expect(await play.getByTestId('points').evaluate(bg)).toBe(LIGHT.ground);
      expect(
        await play.getByTestId('points').evaluate((el) => getComputedStyle(el).borderRadius),
      ).toBe('9999px');
      await expect(play.getByTestId('points')).toHaveText('PTS 10');
      await expect(play.getByTestId('questions-left')).toHaveText('Q 10');
      await expect(play.getByTestId('clock')).toHaveText(/^\d:\d\d$/);
      await expect(play.getByTestId('clock')).toHaveAttribute('data-composing', 'false');
      await expect(play.getByTestId('clock')).toHaveAttribute('data-held', 'false');
      await expect(play.getByText('Connect your AI')).toHaveCount(0); // the scripted model needs no key
      // Sound is off by default; the theme toggle is in the same corner, on system
      await expect(play.getByRole('button', { name: 'Sound off' })).toBeVisible();
      await expect(play.getByRole('button', { name: /^Theme: System/ })).toBeVisible();
      // Ask is the coral pill; Guess is coral text; Search and Give up are grey text; no borders
      const ask = play.getByRole('button', { name: 'Ask', exact: true });
      expect(await ask.evaluate(bg)).toBe('rgb(255, 74, 46)');
      expect(await ask.evaluate((el) => getComputedStyle(el).borderRadius)).toBe('9999px');
      expect(await play.getByRole('button', { name: 'Guess', exact: true }).evaluate(color)).toBe(
        'rgb(255, 74, 46)',
      );
      expect(await play.getByRole('button', { name: 'Search', exact: true }).evaluate(color)).toBe(
        LIGHT.muted,
      );
      for (const el of await play.locator('.round-bar input, .round-bar button').all()) {
        expect(await el.evaluate((e) => getComputedStyle(e).borderStyle)).toBe('none');
      }
      expect(await play.getByLabel('Ask a question').evaluate(bg)).toBe(LIGHT.ground);

      // A question is free; the clock stands still while the voice composes
      const clock = play.getByTestId('clock');
      const q = 'Were you a ruler? Answer slowly';
      const before = Number(await clock.getAttribute('data-elapsed'));
      await play.getByLabel('Ask a question').fill(q, { timeout: 15_000 });
      await play.getByRole('button', { name: 'Ask', exact: true }).click({ timeout: 15_000 });
      await expect(clock).toHaveAttribute('data-composing', 'true');
      await expect(play.locator('.turn .voice').first()).toHaveText(fiveWsLineFor(q), {
        timeout: 15_000,
      });
      await expect(clock).toHaveAttribute('data-held', 'false');
      const after = Number(await clock.getAttribute('data-elapsed'));
      expect(after - before).toBeLessThan(900); // 1.5 s of composing and ~2 s of typing were not charged
      await expect(play.getByTestId('questions-left')).toHaveText('Q 9');
      await expect(play.getByTestId('points')).toHaveText('PTS 10');

      // A wrong guess costs a point, with the verdict's reason, quietly — the points pill goes
      // coral for one beat and comes back
      await play.getByLabel('Your guess').fill(wrong, { timeout: 15_000 });
      await play.getByRole('button', { name: 'Guess', exact: true }).click({ timeout: 15_000 });
      await expect(play.getByTestId('points')).toHaveAttribute('data-drop', 'true', {
        timeout: 15_000,
      });
      const miss = play.getByTestId('wrong-guess');
      await expect(miss).toContainText(`Not ${wrong}.`, { timeout: 15_000 });
      await expect(miss).toContainText('Not this one');
      await expect(play.getByTestId('points')).toHaveText('PTS 9');
      await expect(play.getByTestId('points')).toHaveAttribute('data-drop', 'false');
      expect(await play.getByTestId('points').evaluate(bg)).toBe(LIGHT.ground);

      // Search opens a new tab; the clock keeps running; a page can be kept
      await play.getByRole('button', { name: 'Search', exact: true }).click({ timeout: 15_000 });
      await expect(play.getByText('Opens in a new tab. The clock keeps running.')).toBeVisible();
      await play.getByLabel('Search the web').fill('Hypatia of Alexandria', { timeout: 15_000 });
      const [popup] = await Promise.all([
        play.context().waitForEvent('page'),
        play.getByRole('button', { name: 'Search the web' }).click(),
      ]);
      await popup.waitForLoadState();
      expect(popup.url()).toBe('https://duckduckgo.com/?q=Hypatia%20of%20Alexandria');
      await popup.close();
      await expect(clock).toHaveAttribute('data-composing', 'false');
      await play
        .getByLabel('Page to keep')
        .fill('https://en.wikipedia.org/wiki/Hypatia', { timeout: 15_000 });
      await play.getByLabel('Title (optional)').fill('Hypatia — Wikipedia', { timeout: 15_000 });
      await play.getByRole('button', { name: 'Keep this page' }).click({ timeout: 15_000 });
      await expect(play.getByTestId('kept-pages')).toContainText('Hypatia — Wikipedia');
      await play.getByRole('button', { name: 'Done searching' }).click({ timeout: 15_000 });
      await play.screenshot({ path: 'e2e/.results/5ws-soft-round-light-1200.png' });

      // The right guess ends it; the name decrypts from blocks to letters in coral and the
      // heading settles to the text colour; the reveal is its own card and names the misses
      await play.getByLabel('Your guess').fill(daily.name, { timeout: 15_000 });
      await play.getByRole('button', { name: 'Guess', exact: true }).click({ timeout: 15_000 });
      const who = play.locator('.reveal .who');
      await expect(who).toHaveText(`This was ${daily.name}.`, { timeout: 30_000 });
      await expect(who.locator('.secret')).toHaveAttribute('data-resolved', 'true');
      expect(await who.evaluate(family)).toMatch(SANS);
      expect(await who.evaluate(weight)).toBe('800');
      await expect(who).toHaveCSS('color', LIGHT.text);
      expect(await play.locator('.reveal').evaluate(bg)).toBe(LIGHT.card);
      await expect(play.locator('.round-card .reveal')).toHaveCount(0); // its own card, stacked under
      const roundBox = (await play.locator('.round-card').boundingBox())!;
      const revealBox = (await play.locator('.reveal').boundingBox())!;
      expect(revealBox.y).toBeGreaterThanOrEqual(roundBox.y + roundBox.height);
      const misses = play.getByTestId('misses');
      await expect(misses).toContainText(wrong);
      await expect(misses).toContainText(FIVE_WS_WHY_MISS);
      await expect(play.getByRole('button', { name: 'Give up' })).toHaveCount(0); // nothing else on screen
      // The interface comes back once the voice is done: the share block, with no name in it
      const share = play.getByTestId('share');
      await expect(share).toBeVisible({ timeout: 15_000 });
      const shown = (await share.textContent())!;
      expect(shown.split('\n')).toEqual([
        `5Ws · Who am I? · ${utcDay()}`,
        expect.stringMatching(/^9\/10 in \d:\d\d {3}✗ ✓$/),
        `${origin}play/`,
      ]);
      expect(shown).not.toContain(daily.name);
      // The daily round says when the next figure comes; nothing about streaks
      await expect(play.getByTestId('next-figure')).toHaveText(
        /^Next figure in (\d+h \d\dm|\d+m|<1m|now)$/,
      );
      await expect(play.getByText(/streak/i)).toHaveCount(0);

      // Today's board: sign in with an email code, and the page adds the daily score under
      // the account's username to the day's `leaderboard:` key (mode public, with the
      // token); `played:` (protected) records the counted round. Nothing was written before.
      await expect(play.getByText('Sign in with your email to join today’s board.')).toBeVisible();
      await expect(play.locator('.board-table tbody tr')).toHaveCount(2); // the board, read signed out
      expect(api.writes).toEqual([]);
      await play.getByLabel('Email').fill('tester@example.com', { timeout: 15_000 });
      await play.getByRole('button', { name: 'Send code' }).click({ timeout: 15_000 });
      await play.getByLabel('Code').fill('123456', { timeout: 15_000 });
      await play.getByRole('button', { name: 'Sign in' }).click({ timeout: 15_000 });
      await expect(play.getByTestId('your-rank')).toHaveText('You are #2 today.', {
        timeout: 15_000,
      });
      await expect(play.locator('.board-table tbody tr')).toHaveCount(3);
      await expect(play.locator('.board-table tbody tr').nth(1).locator('td')).toHaveText([
        '2',
        'tester',
        '9',
        /^\d:\d\d$/,
      ]);
      expect(api.writes.map((w) => [w.key, w.mode, w.bearer])).toEqual([
        [`leaderboard:${utcDay()}`, 'public', 'test-access'],
        [`played:${utcDay()}`, 'protected', 'test-access'],
      ]);
      const posted = (api.writes[0]!.value as { entries: Entry[] }).entries;
      expect(posted.map((e) => e.name)).toEqual(['ada', 'tester', 'grace']); // one entry per name, sorted
      expect(posted[1]).toEqual({
        name: 'tester',
        score: 9,
        seconds: expect.any(Number),
        at: expect.any(String),
      });
      expect(posted[1]!.seconds).toBeLessThan(120);
      expect(api.writes[1]!.value).toEqual({
        entry: daily.id,
        shelf: shelf.id,
        score: 9,
        seconds: expect.any(Number),
      });

      // The share block: the one dashed box, coral
      expect(await share.evaluate((el) => getComputedStyle(el).borderStyle)).toBe('dashed');
      expect(await share.evaluate((el) => getComputedStyle(el).borderColor)).toBe(
        'rgb(255, 74, 46)',
      );

      // Copy result puts the share block on the clipboard — the same lines, no name
      await play.evaluate(() => window.scrollTo(0, 0));
      await play.screenshot({
        path: 'e2e/.results/5ws-soft-reveal-light-1200.png',
        fullPage: true,
      });
      await play.getByRole('button', { name: 'Copy result' }).click({ timeout: 15_000 });
      await expect(play.getByRole('button', { name: 'Copied' })).toBeVisible();
      const result = await play.evaluate(() => navigator.clipboard.readText());
      expect(result).toBe(shown);
      expect(result).not.toContain(daily.name);
      expect(result).toContain('✗ ✓');
      await expect(play.getByRole('button', { name: 'Copy result' })).toBeVisible(); // the label comes back

      // The theme toggle: system → light → dark → system; each step remembered; the cards go navy
      await play.getByRole('button', { name: /^Theme: System/ }).click();
      await expect(play.getByRole('button', { name: /^Theme: Light/ })).toBeVisible();
      await expect(play.locator('html')).toHaveAttribute('data-theme', 'light');
      await expect(play.locator('html')).toHaveAttribute('data-theme-choice', 'light');
      expect(await theme(play)).toBe('light');
      await play.getByRole('button', { name: /^Theme: Light/ }).click();
      await expect(play.getByRole('button', { name: /^Theme: Dark/ })).toBeVisible();
      await expect(play.locator('html')).toHaveAttribute('data-theme', 'dark');
      expect(await theme(play)).toBe('dark');
      expect(await play.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(
        DARK.ground,
      );
      expect(await play.locator('.round-card').evaluate(bg)).toBe(DARK.card);
      expect(await play.locator('.reveal').evaluate(bg)).toBe(DARK.card);
      await expect(who).toHaveCSS('color', DARK.text);
      await play.screenshot({ path: 'e2e/.results/5ws-soft-reveal-dark-1200.png', fullPage: true });
      // …and it is remembered: another page in this browser opens dark before first paint
      // (a fresh context carrying this browser's storage — the play page owns its own)
      const twinContext = await browser.newContext({
        storageState: await play.context().storageState(),
      });
      const twin = await twinContext.newPage();
      await twin.goto(origin);
      await expect(twin.locator('html')).toHaveAttribute('data-theme', 'dark');
      await expect(twin.locator('html')).toHaveAttribute('data-theme-choice', 'dark');
      expect(await twin.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(
        DARK.ground,
      );
      await twinContext.close();
      await play.getByRole('button', { name: /^Theme: Dark/ }).click();
      await expect(play.getByRole('button', { name: /^Theme: System/ })).toBeVisible();
      await expect(play.locator('html')).toHaveAttribute('data-theme', 'light');
      expect(await theme(play)).toBe('system');
      // …and the round it was toggled in is still this one: the reveal stands, nothing restarted
      await expect(who).toHaveText(`This was ${daily.name}.`);
      await expect(play.getByTestId('points')).toHaveText('PTS 9');

      // Copy transcript (the quieter button) puts the markdown page on the clipboard
      await play.getByRole('button', { name: 'Copy transcript' }).click({ timeout: 15_000 });
      await expect(play.getByRole('button', { name: 'Copied' })).toBeVisible();
      const md = await play.evaluate(() => navigator.clipboard.readText());
      expect(md).toMatch(/^---\ntitle: /);
      expect(md).toContain(`name: ${JSON.stringify(daily.name)}`);
      expect(md).toContain('**You:** ' + q);
      expect(md).toContain('## Reveal');
      expect(md).toContain('https://en.wikipedia.org/wiki/Hypatia');

      // Play again: a new round opens without the boot, someone talking, ten points
      await play.getByRole('button', { name: 'Play again' }).click({ timeout: 15_000 });
      await expect(play.locator('.round-app')).not.toHaveClass(/booting/);
      await expect(play.locator('.round-voice .voice.opening')).toHaveText(FIVE_WS_OPENING, {
        timeout: 30_000,
      });
      await expect(play.locator('.round-app')).toHaveAttribute('data-boot', 'done');
      await expect(play.getByTestId('points')).toHaveText('PTS 10');
      await expect(play.getByTestId('questions-left')).toHaveText('Q 10');
      await play.close();

      // Reduced motion: no boot, the text is there at once, nothing blinks
      const still = await browser.newPage({
        viewport: { width: 1200, height: 900 },
        reducedMotion: 'reduce',
      });
      await withScriptedModel(still);
      await withPlayApi(still);
      await still.goto(origin + 'play/');
      const firstSeen = await still.waitForFunction(
        () => {
          const el = document.querySelector('.round-voice .voice.opening');
          if (!el || el.querySelector('.cursor')) return null; // still composing
          const t = el.textContent?.trim() ?? '';
          return t.length > 0 ? t : null;
        },
        null,
        { timeout: 60_000 },
      );
      expect(await firstSeen.jsonValue()).toBe(FIVE_WS_OPENING); // whole, on its first paint
      await expect(still.locator('.round-app')).toHaveAttribute('data-motion', 'reduced');
      await expect(still.locator('.round-app')).toHaveAttribute('data-boot', 'done');
      await expect(still.locator('.round-app')).not.toHaveClass(/booting/);
      // …and the card does not fade in
      expect(
        await still.locator('.round-card').evaluate((el) => getComputedStyle(el).animationName),
      ).toBe('none');
      await still.close();

      // A phone: one column, the voice on top, the bar pinned to the bottom
      const phonePlay = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await withScriptedModel(phonePlay);
      await withPlayApi(phonePlay);
      await phonePlay.goto(origin + 'play/');
      await expect(phonePlay.locator('.round-app')).toHaveClass(/booting/, { timeout: 60_000 });
      await expect(phonePlay.locator('.round-app')).toHaveAttribute('data-boot', 'title');
      await phonePlay.screenshot({ path: 'e2e/.results/5ws-soft-boot-light-390.png' });
      await expect(phonePlay.locator('.round-voice .voice.opening')).toHaveText(FIVE_WS_OPENING, {
        timeout: 60_000,
      });
      await expect(phonePlay.locator('.round-app')).toHaveAttribute('data-layout', 'narrow');
      expect(await scrollWidth(phonePlay)).toBeLessThanOrEqual(390);
      const bar = (await phonePlay.locator('.round-bar').boundingBox())!;
      const voiceBox = (await phonePlay.locator('.round-voice .voice.opening').boundingBox())!;
      expect(Math.round(bar.y + bar.height)).toBeGreaterThanOrEqual(842);
      expect(voiceBox.y + voiceBox.height).toBeLessThanOrEqual(bar.y);
      // The card is edge-to-edge with 12px gutters; the bar is a blurred sheet across the width
      const phoneCard = (await phonePlay.locator('.round-card').boundingBox())!;
      expect(Math.round(phoneCard.x)).toBe(CARD_GUTTER);
      expect(Math.round(phoneCard.width)).toBe(390 - 2 * CARD_GUTTER);
      expect(Math.round(bar.x)).toBe(0);
      expect(Math.round(bar.width)).toBe(390);
      expect(
        await phonePlay
          .locator('.round-bar')
          .evaluate(
            (el) =>
              getComputedStyle(el).backdropFilter || getComputedStyle(el).webkitBackdropFilter,
          ),
      ).toMatch(/blur/);
      // Tap targets: every control in the bar and the corner is at least 44px tall
      for (const b of await phonePlay
        .locator('.round-bar button, .round-bar input, .round-top .corner button')
        .all()) {
        expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
      // The corner — sound pill and theme toggle — sits top right on the phone too
      await expect(phonePlay.locator('.round-top .corner')).toBeVisible();
      await expect(phonePlay.getByRole('button', { name: 'Sound off' })).toBeVisible();
      const phoneToggle = phonePlay.getByRole('button', { name: /^Theme: System/ });
      const toggleBox = (await phoneToggle.boundingBox())!;
      expect(toggleBox.x + toggleBox.width).toBeGreaterThan(390 - 2 * CARD_GUTTER);
      await phonePlay.screenshot({ path: 'e2e/.results/5ws-soft-round-light-390.png' });
      // Dark on the phone: two presses (system → light → dark), the card goes navy
      await phoneToggle.click();
      await phonePlay.getByRole('button', { name: /^Theme: Light/ }).click();
      await expect(phonePlay.locator('html')).toHaveAttribute('data-theme', 'dark');
      expect(await phonePlay.locator('.round-card').evaluate(bg)).toBe(DARK.card);
      expect(await phonePlay.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(
        DARK.ground,
      );
      await phonePlay.screenshot({ path: 'e2e/.results/5ws-soft-round-dark-390.png' });
      // A first-try win on the phone: the reveal, then the share block, one column
      await phonePlay.getByLabel('Your guess').fill(daily.name, { timeout: 15_000 });
      await phonePlay
        .getByRole('button', { name: 'Guess', exact: true })
        .click({ timeout: 15_000 });
      await expect(phonePlay.locator('.reveal .who')).toHaveText(`This was ${daily.name}.`, {
        timeout: 30_000,
      });
      await expect(phonePlay.getByTestId('share')).toBeVisible({ timeout: 15_000 });
      await expect(phonePlay.getByTestId('share')).toContainText('10/10 in');
      expect(await scrollWidth(phonePlay)).toBeLessThanOrEqual(390);
      await phonePlay.evaluate(() => window.scrollTo(0, 0));
      await phonePlay.screenshot({
        path: 'e2e/.results/5ws-soft-reveal-dark-390.png',
        fullPage: true,
      });
      // …and back to system (light): the reveal stands
      await phonePlay.getByRole('button', { name: /^Theme: Dark/ }).click();
      await expect(phonePlay.locator('html')).toHaveAttribute('data-theme', 'light');
      expect(await phonePlay.locator('.reveal').evaluate(bg)).toBe(LIGHT.card);
      await expect(phonePlay.locator('.reveal .who')).toHaveText(`This was ${daily.name}.`);
      await phonePlay.screenshot({
        path: 'e2e/.results/5ws-soft-reveal-light-390.png',
        fullPage: true,
      });
      await phonePlay.close();

      // ── Connect your AI: the step itself, with no scripted model on the page ──
      // One field, one button; the provider read off the key; Enter starts the
      // round, whose opening call is the validation. No real provider call can be
      // made here, so the providers are stood in: Anthropic refuses with 401 and
      // Google with its 400 "API key not valid" — both must bring the step back
      // with the key still in the field.
      await test.step('Connect your AI: one field, one button; a refused key comes back', async () => {
        const UNKNOWN = 'That doesn’t look like a key from Anthropic, OpenAI or Google.';
        const seen: Array<{ host: string; key: string }> = [];
        const withRefusingProviders = async (p: Page) => {
          const cors = {
            'access-control-allow-origin': '*',
            'access-control-allow-headers': '*',
            'access-control-allow-methods': 'GET,POST,OPTIONS',
          };
          await p.route('https://api.anthropic.com/**', async (route) => {
            const req = route.request();
            if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
            seen.push({ host: 'anthropic', key: req.headers()['x-api-key'] ?? '' });
            await new Promise((r) => setTimeout(r, 2000)); // long enough to see the round open
            try {
              await route.fulfill({
                status: 401,
                contentType: 'application/json',
                headers: cors,
                body: JSON.stringify({
                  type: 'error',
                  error: { type: 'authentication_error', message: 'invalid x-api-key' },
                }),
              });
            } catch {
              /* the round was torn down (Change) and aborted the call */
            }
          });
          await p.route('https://generativelanguage.googleapis.com/**', (route) => {
            const req = route.request();
            if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
            seen.push({ host: 'google', key: req.headers()['x-goog-api-key'] ?? '' });
            return route.fulfill({
              status: 400,
              contentType: 'application/json',
              headers: cors,
              body: JSON.stringify({
                error: {
                  code: 400,
                  message: 'API key not valid. Please pass a valid API key.',
                  status: 'INVALID_ARGUMENT',
                },
              }),
            });
          });
        };
        const stored = (p: Page) =>
          p.evaluate(() => JSON.parse(localStorage.getItem('5ws:model') ?? 'null'));

        const connect = await browser.newPage({ viewport: { width: 1200, height: 900 } });
        await withRefusingProviders(connect);
        await connect.goto(origin + 'play/');

        // The step: the shelf's question heavy on a white card, one heading, one field, one
        // button, no dropdown
        await expect(connect.getByRole('heading', { name: 'Connect your AI' })).toBeVisible({
          timeout: 60_000,
        });
        await expect(connect.locator('.connect-form select')).toHaveCount(0);
        await expect(connect.locator('.connect-form input')).toHaveCount(1);
        await expect(connect.locator('.connect-form button')).toHaveCount(1);
        const field = connect.getByLabel('Key');
        const button = connect.getByRole('button', { name: 'Connect', exact: true });
        await expect(button).toBeDisabled();
        expect(await connect.locator('.connect-form h2').evaluate(family)).toMatch(SANS);
        expect(await connect.locator('.connect .question').evaluate(color)).toBe(LIGHT.text);
        expect(await connect.locator('.connect .question').evaluate(weight)).toBe('800');
        const connectCard = connect.locator('.connect-card');
        await expect(connectCard).toHaveCSS('opacity', '1'); // the 200ms fade has finished
        expect(await connectCard.evaluate(bg)).toBe(LIGHT.card);
        expect(await field.evaluate(bg)).toBe(LIGHT.ground);
        expect(await field.evaluate((el) => getComputedStyle(el).borderStyle)).toBe('none');
        // "Get a key" links above the field: Google first and marked free, all in a new tab
        const links = connect.locator('.connect-form .get-key a');
        await expect(links).toHaveText(['Google — free', 'OpenAI', 'Anthropic']);
        expect(
          await links.evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href)),
        ).toEqual([
          'https://aistudio.google.com/apikey',
          'https://platform.openai.com/api-keys',
          'https://console.anthropic.com/settings/keys',
        ]);
        for (const a of await links.all()) await expect(a).toHaveAttribute('target', '_blank');
        const linksBox = (await connect.locator('.connect-form .get-key').boundingBox())!;
        const fieldBox = (await field.boundingBox())!;
        expect(linksBox.y + linksBox.height).toBeLessThanOrEqual(fieldBox.y);
        await expect(
          connect.getByText('Your key stays in this browser and is sent only to that provider.'),
        ).toBeVisible();
        await connect.screenshot({ path: 'e2e/.results/5ws-connect-1200.png', fullPage: true });

        // A key from nowhere we know: one line, and the button stays put
        await field.fill('hunter2');
        await expect(connect.getByText(UNKNOWN)).toBeVisible();
        await expect(button).toBeDisabled();
        await field.press('Enter');
        await expect(connect.getByRole('heading', { name: 'Connect your AI' })).toBeVisible();
        expect(await stored(connect)).toBeNull();

        // Paste-and-go: an Anthropic-shaped key, Enter — the round opens at once
        await field.fill('sk-ant-e2e-not-a-real-key');
        await expect(connect.getByText(UNKNOWN)).toHaveCount(0);
        await expect(button).toBeEnabled();
        await field.press('Enter');
        await expect(connect.getByTestId('points')).toHaveText('PTS 10', { timeout: 15_000 });
        await expect(connect.locator('.round-voice .composing')).toBeVisible();
        expect(await stored(connect)).toEqual({
          provider: 'anthropic',
          apiKey: 'sk-ant-e2e-not-a-real-key',
        });
        // Which AI, and "Change", sit quietly in the bar — a link, not a boxed button
        const foot = connect.locator('.round-bar .round-foot');
        await expect(foot).toHaveText('Anthropic · Change');
        const change = foot.getByRole('button', { name: 'Change' });
        expect(await change.evaluate((el) => getComputedStyle(el).borderStyle)).toBe('none');
        expect(await change.evaluate((el) => getComputedStyle(el).textDecorationLine)).toBe(
          'underline',
        );
        await connect.screenshot({
          path: 'e2e/.results/5ws-connect-1200-change.png',
          fullPage: true,
        });
        // Change forgets the key and comes back to the step, clean
        await change.click();
        await expect(connect.getByRole('heading', { name: 'Connect your AI' })).toBeVisible();
        await expect(field).toHaveValue('');
        expect(await stored(connect)).toBeNull();

        // Again, and let the opening call be the validation: the provider refuses, the step comes back
        await field.fill('sk-ant-e2e-not-a-real-key');
        await field.press('Enter');
        await expect(connect.getByTestId('points')).toHaveText('PTS 10', { timeout: 15_000 });
        await expect(connect.getByText('That key was refused by Anthropic.')).toBeVisible({
          timeout: 15_000,
        });
        await expect(field).toHaveValue('sk-ant-e2e-not-a-real-key');
        expect(seen).toEqual([
          { host: 'anthropic', key: 'sk-ant-e2e-not-a-real-key' },
          { host: 'anthropic', key: 'sk-ant-e2e-not-a-real-key' },
        ]);
        expect(await stored(connect)).toBeNull();
        await connect.screenshot({
          path: 'e2e/.results/5ws-connect-1200-refused.png',
          fullPage: true,
        });

        // Editing the key clears the sentence; a Google-shaped key goes to Google via Connect
        await field.fill('AIzaE2E-not-a-real-key');
        await expect(connect.getByText('That key was refused by Anthropic.')).toHaveCount(0);
        await button.click();
        await expect(connect.getByText('That key was refused by Google.')).toBeVisible({
          timeout: 15_000,
        });
        expect(seen[2]).toEqual({ host: 'google', key: 'AIzaE2E-not-a-real-key' });
        await connect.close();

        // A phone: the links wrap, the field and button stack, nothing scrolls sideways
        const phoneConnect = await browser.newPage({ viewport: { width: 390, height: 844 } });
        await withRefusingProviders(phoneConnect);
        await phoneConnect.goto(origin + 'play/');
        await expect(phoneConnect.getByRole('heading', { name: 'Connect your AI' })).toBeVisible({
          timeout: 60_000,
        });
        await expect(phoneConnect.locator('.connect-card')).toHaveCSS('opacity', '1');
        expect(await scrollWidth(phoneConnect)).toBeLessThanOrEqual(390);
        const pf = (await phoneConnect.getByLabel('Key').boundingBox())!;
        const pb = (await phoneConnect
          .getByRole('button', { name: 'Connect', exact: true })
          .boundingBox())!;
        expect(pb.y).toBeGreaterThanOrEqual(pf.y + pf.height); // stacked, not side by side
        expect(Math.round(pb.width)).toBe(Math.round(pf.width)); // the button is the field's width
        await phoneConnect.screenshot({ path: 'e2e/.results/5ws-connect-390.png', fullPage: true });
        await phoneConnect.close();
      });
    } finally {
      await browser.close();
      await app.close();
    }
  });
});
