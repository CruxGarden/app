import { test, expect, chromium, type Page } from '@playwright/test';
import { launchApp } from './launch';
import { fiveWsScript, fiveWsLineFor, FIVE_WS_OPENING, FIVE_WS_WHY_MISS } from '../../src/ai/mock-model';
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
 * an in-test stand-in for the board and the email-code sign-in.
 */

const API = 'https://api.e2e.invalid';
const utcDay = (daysAgo = 0) => new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);

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

/** The API as the play page sees it: sign-in, and a board that records one daily score. */
async function withPlayApi(p: Page) {
  const posted: Array<{ score: number; seconds: number }> = [];
  const today = utcDay();
  const others = [
    { name: 'ada', score: 10, seconds: 74, at: `${today}T08:00:00.000Z` },
    { name: 'grace', score: 8, seconds: 121, at: `${today}T08:10:00.000Z` },
  ];
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
      'access-control-allow-methods': 'GET,POST,OPTIONS',
    };
    const json = (status: number, body: unknown) =>
      route.fulfill({ status, contentType: 'application/json', headers: cors, body: JSON.stringify(body) });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (url.pathname === '/auth/code') return json(200, { message: 'sent' });
    if (url.pathname === '/auth/login')
      return json(200, { accessToken: 'test-access', refreshToken: 'test-refresh' });
    const m = /^\/cruxes\/([^/]+)\/leaderboard\/([^/?]+)$/.exec(url.pathname);
    if (m && m[1] === 'crux-e2e') {
      if (req.method() === 'POST') {
        if (!/^Bearer /.test(req.headers()['authorization'] ?? ''))
          return json(401, { statusCode: 401, message: 'Unauthorized' });
        const body = req.postDataJSON() as { score: number; seconds: number };
        posted.push(body);
        const mine = { name: 'tester', score: body.score, seconds: body.seconds, at: new Date().toISOString() };
        const entries = [...others, mine].sort((a, b) => b.score - a.score || a.seconds - b.seconds);
        const rank = entries.indexOf(mine) + 1;
        return json(201, { day: today, entries, you: { rank, score: body.score, seconds: body.seconds, counted: posted.length === 1 } });
      }
      return json(200, { day: today, entries: others, you: null });
    }
    return json(404, { statusCode: 404, message: `e2e: unhandled ${req.method()} ${url.pathname}` });
  });
  return { posted };
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

  test('5Ws shelf lists its entries; the sample round reveals in serif', async () => {
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

      // The leaderboard is read from the API (entries are written server-side, one per
      // account per day). A published page gets its crux id + API origin from the publish
      // injection (window.crux.publish); astro dev has no injection, so stand both in.
      const API = 'https://api.e2e.invalid';
      const today = new Date().toISOString().slice(0, 10);
      const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
      const boards: Record<string, unknown[]> = {
        [today]: [
          { name: 'ada', score: 10, seconds: 74, at: `${today}T08:00:00.000Z` },
          { name: 'grace', score: 9, seconds: 121, at: `${today}T08:10:00.000Z` },
          { name: 'hedy', score: 9, seconds: 140, at: `${today}T08:20:00.000Z` },
        ],
        [yesterday]: [{ name: 'emmy', score: 7, seconds: 200, at: `${yesterday}T09:00:00.000Z` }],
      };
      const withBoard = async (p: import('@playwright/test').Page) => {
        await p.addInitScript(
          (cfg) => {
            (window as unknown as { crux: unknown }).crux = { publish: cfg };
          },
          { cruxId: 'crux-e2e', apiBase: API },
        );
        await p.route(`${API}/**`, (route) => {
          const m = /\/cruxes\/([^/]+)\/leaderboard\/([^/?]+)/.exec(route.request().url());
          const day = m?.[2] === 'today' ? today : m?.[2];
          const entries = (day && boards[day]) || [];
          void route.fulfill({
            status: m && m[1] === 'crux-e2e' ? 200 : 404,
            contentType: 'application/json',
            headers: { 'access-control-allow-origin': '*' },
            body: JSON.stringify({ day, entries }),
          });
        });
      };

      // Mobile first: at 390px the shelf and a round page read in one column, no sideways scroll
      const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await withBoard(phone);
      await phone.goto(origin);
      await expect(phone.locator('h1.question')).toHaveText('Who am I?');
      expect(await scrollWidth(phone)).toBeLessThanOrEqual(390);
      await phone.screenshot({ path: 'e2e/.results/starters-render-5-5ws-phone.png', fullPage: true });
      await phone.locator('ul.round-list a').first().click();
      await expect(phone.locator('.transcript h3', { hasText: 'This was' })).toBeVisible();
      expect(await scrollWidth(phone)).toBeLessThanOrEqual(390);
      await phone.screenshot({ path: 'e2e/.results/starters-render-6-5ws-phone-round.png', fullPage: true });
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
      await expect(board.locator('tbody tr').first().locator('td')).toHaveText(['1', 'ada', '10', '1:14']);
      await board.getByRole('link', { name: 'Yesterday' }).click();
      await expect(board.locator('h2')).toHaveText('Yesterday');
      await expect(board.locator('tbody tr')).toHaveCount(1);
      await board.getByRole('link', { name: 'Today' }).click();
      await expect(board.locator('tbody tr')).toHaveCount(3);
      await expect(site).toHaveTitle('5Ws — Ten Questions. Five minutes. Good luck.');
      await expect(site.locator('h1.question')).toHaveText('Who am I?');
      const entries = site.locator('ol.entries li');
      expect(await entries.count()).toBeGreaterThanOrEqual(40);
      await expect(entries.filter({ hasText: 'Hypatia' })).toContainText('person');
      await expect(site.locator('ul.round-list li')).toHaveCount(1);
      await site.screenshot({ path: 'e2e/.results/starters-render-3-5ws-shelf.png', fullPage: true });

      // The sample round: questions in sans, the voice and the reveal in serif
      await site.locator('ul.round-list a').first().click();
      await expect(site.locator('.round-head h1')).toContainText('Round 1');
      const you = site.locator('.transcript p', { hasText: 'Are you a man or a woman?' });
      await expect(you).toBeVisible();
      const reveal = site.locator('.transcript h3', { hasText: 'This was' });
      await expect(reveal).toBeVisible();
      await expect(reveal.locator('xpath=following-sibling::p[1]')).toContainText('Hypatia');
      const family = (el: Element) => getComputedStyle(el).fontFamily;
      expect(await reveal.evaluate(family)).toMatch(/Georgia|Palatino|Iowan/);
      // The voice: the first paragraph that is not a "You:" line
      const voice = site.locator('.transcript p:not(:has(> strong:first-child))').first();
      await expect(voice).toContainText('harder city');
      expect(await voice.evaluate(family)).toMatch(/Georgia|Palatino|Iowan/);
      expect(await you.evaluate(family)).toMatch(/system-ui/);
      expect(await you.evaluate(family)).not.toMatch(/Georgia/);
      await expect(site.locator('.adjacent a', { hasText: 'The shelf' })).toBeVisible();
      expect(await scrollWidth(site)).toBeLessThanOrEqual(1200);
      await site.screenshot({ path: 'e2e/.results/starters-render-4-5ws-round.png', fullPage: true });
      await site.close();

      // ── /play: the round itself, in the browser ──
      const shelf = parseShelf(historyShelf);
      const daily = pickEntry(shelf, utcDay()); // the same seed the page uses: the UTC day
      const wrong = ['Cleopatra', 'Napoleon', 'Socrates'].find((n) => !matchesName(daily, n))!;
      const play = await browser.newPage({ viewport: { width: 1200, height: 900 } });
      await play.context().grantPermissions(['clipboard-read', 'clipboard-write']);
      await play.context().route('https://duckduckgo.com/**', (route) =>
        route.fulfill({ contentType: 'text/html', body: '<title>search stand-in</title>' }),
      );
      await withScriptedModel(play);
      const api = await withPlayApi(play);
      await play.goto(origin + 'play/');

      // Someone is already talking — in serif; the interface is sans
      const opening = play.locator('.round-voice .voice.opening');
      await expect(opening).toHaveText(FIVE_WS_OPENING, { timeout: 60_000 });
      expect(await opening.evaluate(family)).toMatch(/Georgia|Palatino|Iowan/);
      expect(await play.locator('.status').evaluate(family)).toMatch(/system-ui/);
      await expect(play.getByTestId('points')).toHaveText('10 points');
      await expect(play.getByTestId('questions-left')).toHaveText('10 questions');
      await expect(play.getByTestId('clock')).toHaveAttribute('data-composing', 'false');
      await expect(play.getByText('Connect your AI')).toHaveCount(0); // the scripted model needs no key

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
      const after = Number(await clock.getAttribute('data-elapsed'));
      expect(after - before).toBeLessThan(900); // 1.5 s of composing was not charged
      await expect(play.getByTestId('questions-left')).toHaveText('9 questions');
      await expect(play.getByTestId('points')).toHaveText('10 points');

      // A wrong guess costs a point, with the verdict's reason, quietly
      await play.getByLabel('Your guess').fill(wrong, { timeout: 15_000 });
      await play.getByRole('button', { name: 'Guess', exact: true }).click({ timeout: 15_000 });
      const miss = play.getByTestId('wrong-guess');
      await expect(miss).toContainText(`Not ${wrong}.`, { timeout: 15_000 });
      await expect(miss).toContainText('Not this one');
      await expect(play.getByTestId('points')).toHaveText('9 points');

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
      await play.getByLabel('Page to keep').fill('https://en.wikipedia.org/wiki/Hypatia', { timeout: 15_000 });
      await play.getByLabel('Title (optional)').fill('Hypatia — Wikipedia', { timeout: 15_000 });
      await play.getByRole('button', { name: 'Keep this page' }).click({ timeout: 15_000 });
      await expect(play.getByTestId('kept-pages')).toContainText('Hypatia — Wikipedia');
      await play.getByRole('button', { name: 'Done searching' }).click({ timeout: 15_000 });
      await play.screenshot({ path: 'e2e/.results/starters-render-7-5ws-play.png', fullPage: true });

      // The right guess ends it; the reveal names the misses
      await play.getByLabel('Your guess').fill(daily.name, { timeout: 15_000 });
      await play.getByRole('button', { name: 'Guess', exact: true }).click({ timeout: 15_000 });
      const who = play.locator('.reveal .who');
      await expect(who).toHaveText(`This was ${daily.name}.`, { timeout: 30_000 });
      expect(await who.evaluate(family)).toMatch(/Georgia|Palatino|Iowan/);
      const misses = play.getByTestId('misses');
      await expect(misses).toContainText(wrong);
      await expect(misses).toContainText(FIVE_WS_WHY_MISS);
      await expect(play.getByRole('button', { name: 'Give up' })).toHaveCount(0); // nothing else on screen

      // Today's board: sign in with an email code, and the daily score is posted
      await expect(play.getByText('Sign in with your email to join today’s board.')).toBeVisible();
      await expect(play.locator('.board-table tbody tr')).toHaveCount(2); // public board first
      await play.getByLabel('Email').fill('tester@example.com', { timeout: 15_000 });
      await play.getByRole('button', { name: 'Send code' }).click({ timeout: 15_000 });
      await play.getByLabel('Code').fill('123456', { timeout: 15_000 });
      await play.getByRole('button', { name: 'Sign in' }).click({ timeout: 15_000 });
      await expect(play.getByTestId('your-rank')).toHaveText('You are #2 today.', { timeout: 15_000 });
      await expect(play.locator('.board-table tbody tr')).toHaveCount(3);
      expect(api.posted).toEqual([{ score: 9, seconds: expect.any(Number) }]);
      expect(api.posted[0]!.seconds).toBeLessThan(120);

      // Copy transcript puts the markdown page on the clipboard
      await play.getByRole('button', { name: 'Copy transcript' }).click({ timeout: 15_000 });
      await expect(play.getByRole('button', { name: 'Copied' })).toBeVisible();
      const md = await play.evaluate(() => navigator.clipboard.readText());
      expect(md).toMatch(/^---\ntitle: /);
      expect(md).toContain(`name: ${JSON.stringify(daily.name)}`);
      expect(md).toContain('**You:** ' + q);
      expect(md).toContain('## Reveal');
      expect(md).toContain('https://en.wikipedia.org/wiki/Hypatia');
      await play.screenshot({ path: 'e2e/.results/starters-render-8-5ws-reveal.png', fullPage: true });

      // Play again: a new round opens, someone talking, ten points
      await play.getByRole('button', { name: 'Play again' }).click({ timeout: 15_000 });
      await expect(play.locator('.round-voice .voice.opening')).toHaveText(FIVE_WS_OPENING, {
        timeout: 30_000,
      });
      await expect(play.getByTestId('points')).toHaveText('10 points');
      await expect(play.getByTestId('questions-left')).toHaveText('10 questions');
      await play.close();

      // A phone: one column, the voice on top, the bar pinned to the bottom
      const phonePlay = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await withScriptedModel(phonePlay);
      await withPlayApi(phonePlay);
      await phonePlay.goto(origin + 'play/');
      await expect(phonePlay.locator('.round-voice .voice.opening')).toHaveText(FIVE_WS_OPENING, {
        timeout: 60_000,
      });
      await expect(phonePlay.locator('.round-app')).toHaveAttribute('data-layout', 'narrow');
      expect(await scrollWidth(phonePlay)).toBeLessThanOrEqual(390);
      const bar = (await phonePlay.locator('.round-bar').boundingBox())!;
      const voiceBox = (await phonePlay.locator('.round-voice .voice.opening').boundingBox())!;
      expect(Math.round(bar.y + bar.height)).toBeGreaterThanOrEqual(842);
      expect(voiceBox.y + voiceBox.height).toBeLessThanOrEqual(bar.y);
      await phonePlay.screenshot({ path: 'e2e/.results/starters-render-9-5ws-play-phone.png' });
      await phonePlay.close();
    } finally {
      await browser.close();
      await app.close();
    }
  });
});
