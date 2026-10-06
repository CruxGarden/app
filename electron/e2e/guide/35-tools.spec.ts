import { revealOptionsFor } from '../panel-helpers';
import { test, expect, type Page } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from '../launch';
import { startMockApi } from '../api-mock';
import { enterGarden, createCrux, storedCrux, addArtifact } from '../multi-crux-helpers';
import { openPanel } from '../panel-helpers';
import { openBuilder } from '../builder-helpers';
import { newGarden } from '../journeys/journey-helpers';
import { member } from '../game-cruxspace-helpers';
import { fiveWsScript } from '../../../src/ai/mock-model';
import { parseShelf, pickEntry } from '../../../src/game/shelf';
import historyShelf from '../../../src/templates/shelves/history.json';
import {
  createFromPicker,
  waitForSitePreview,
  openSite,
  pollBody,
  pollStatus,
  publishViaShare,
  replaceEditor,
  painted,
  PNG_DOT,
} from './site-helpers';

/**
 * V1-TESTING-GUIDE § 35 · Every creation choice. The rows here are the
 * app-owned starters and bundled tools whose creative exercise the app can
 * drive offline; each other row has its own spec named in the coverage matrix.
 */
test.describe('guide 35 · Tools', () => {
  test('TOOL-blank — index.html, a stylesheet and a script; text and colour edits show and a button works in preview', async () => {
    test.setTimeout(180_000);
    const { app, page } = await launchApp();
    try {
      await enterGarden(page);
      const id = await createCrux(page, 'Plain page');
      const folder = (await storedCrux(page, id)).projectFolder as string;
      const write = async (name: string, content: string) => {
        await addArtifact(page, name);
        await replaceEditor(page, content);
        await expect
          .poll(() => readFileSync(join(folder, name), 'utf8').trim())
          .toBe(content.trim());
      };
      await write(
        'index.html',
        '<!doctype html><link rel="stylesheet" href="style.css"><h1 id="t">Hello</h1><button id="b">Press</button><script src="script.js"></script>',
      );
      await write('style.css', 'h1 { color: rgb(0, 128, 0); }');
      await write(
        'script.js',
        "document.getElementById('b').onclick = () => { document.getElementById('t').textContent = 'Pressed'; };",
      );

      const tree = page.getByRole('tree');
      await tree.getByText('index.html', { exact: true }).click();
      await page.getByRole('button', { name: 'Preview', exact: true }).click();
      const frame = page.frameLocator('iframe[data-crux-id]');
      const heading = frame.getByRole('heading');
      await expect(heading).toHaveText('Hello', { timeout: 30_000 });
      await expect(heading).toHaveCSS('color', 'rgb(0, 128, 0)');
      await frame.getByRole('button', { name: 'Press' }).click();
      await expect(heading).toHaveText('Pressed');

      // The source files stay editable: a colour and a word change reach the page.
      await tree.getByText('style.css', { exact: true }).click();
      await replaceEditor(page, 'h1 { color: rgb(0, 0, 255); }');
      await tree.getByText('index.html', { exact: true }).click();
      await replaceEditor(
        page,
        '<!doctype html><link rel="stylesheet" href="style.css"><h1 id="t">Hello again</h1><button id="b">Press</button><script src="script.js"></script>',
      );
      await page.getByRole('button', { name: 'Preview', exact: true }).click();
      await revealOptionsFor(page.getByTestId('preview-refresh'));
      await page.getByTestId('preview-refresh').click();
      await expect(heading).toHaveText('Hello again', { timeout: 30_000 });
      await expect(heading).toHaveCSS('color', 'rgb(0, 0, 255)');
    } finally {
      await app.close();
    }
  });

  test('TOOL-astro-empty — a nested route and an asset serve, a syntax error is survivable, and the site publishes', async () => {
    test.setTimeout(20 * 60_000);
    const api = await startMockApi();
    const { app, page } = await launchApp({ env: { CRUX_API_URL: api.url } });
    try {
      page.setDefaultTimeout(60_000);
      await enterGarden(page);
      const { id, folder } = await createFromPicker(page, /^Empty \(Astro\)/);
      const url = await waitForSitePreview(page, folder);
      await pollBody(url, 'Hello.');

      // A home page that links to a nested route, and an asset in public/.
      const index = join(folder, 'src/pages/index.astro');
      writeFileSync(
        index,
        readFileSync(index, 'utf8').replace(
          '<h1>Hello.</h1>',
          '<h1>Hello.</h1><a href="/about/">About</a><img src="/logo.svg" alt="logo">',
        ),
      );
      mkdirSync(join(folder, 'src/pages/about'), { recursive: true });
      writeFileSync(
        join(folder, 'src/pages/about/index.astro'),
        '---\nconst who = "this site";\n---\n<h1>About {who}</h1>\n',
      );
      mkdirSync(join(folder, 'public'), { recursive: true });
      writeFileSync(
        join(folder, 'public/logo.svg'),
        '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8"/></svg>',
      );
      const about = new URL('/about/', url).toString();
      await pollBody(about, 'About this site');
      await pollStatus(new URL('/logo.svg', url).toString(), 200);
      await pollBody(url, 'href="/about/"');

      // Break the nested page, see it fail, fix it, see it back.
      writeFileSync(
        join(folder, 'src/pages/about/index.astro'),
        '---\nconst who = ;\n---\n<h1>About</h1>\n',
      );
      await pollStatus(about, 500, 3 * 60_000);
      writeFileSync(
        join(folder, 'src/pages/about/index.astro'),
        '---\nconst who = "this site";\n---\n<h1>About {who}, repaired</h1>\n',
      );
      await pollBody(about, 'About this site, repaired', 3 * 60_000);

      // Publish: both routes and the asset leave with the build.
      const paths = await publishViaShare(page, api, id);
      for (const path of ['index.html', 'about/index.html', 'logo.svg'])
        expect(paths, paths.join(', ')).toContain(path);
    } finally {
      await app.close();
      await api.close();
    }
  });

  test('TOOL-astro-storefront — a product with its price, image and checkout link is served on its route and listed', async () => {
    test.setTimeout(20 * 60_000);
    const { app, page } = await launchApp();
    try {
      page.setDefaultTimeout(60_000);
      await page.setViewportSize({ width: 1600, height: 1000 });
      await enterGarden(page);
      const { folder } = await createFromPicker(page, /^Storefront/);
      const product = (slug: string) => join(folder, 'src/content/products', `${slug}.md`);
      await expect.poll(() => existsSync(product('garden-print')), { timeout: 60_000 }).toBe(true);

      // The Builder lists the seed products and makes a new one.
      await openBuilder(page);
      await expect(page.getByRole('button', { name: /new product/i }).first()).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByText('Garden print, A3').first()).toBeVisible();
      await page
        .getByRole('button', { name: /new product/i })
        .first()
        .click();
      await page.getByPlaceholder('Product title').fill('Compost');
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await expect(page.locator('.monaco-editor').first()).toBeVisible({ timeout: 30_000 });
      await expect.poll(() => existsSync(product('compost')), { timeout: 30_000 }).toBe(true);
      expect(readFileSync(product('compost'), 'utf8')).toMatch(/^price: 0$/m);

      // Price, image and destination link are front matter; the story is the body.
      mkdirSync(join(folder, 'src/assets'), { recursive: true });
      writeFileSync(join(folder, 'src/assets/compost.png'), PNG_DOT);
      const today = new Date().toISOString().slice(0, 10);
      writeFileSync(
        product('compost'),
        [
          '---',
          "name: 'Compost'",
          "description: 'A bucket of finished compost.'",
          'price: 12',
          'currency: USD',
          'image: ../../assets/compost.png',
          'categories: [Garden]',
          "buyUrl: 'https://buy.stripe.com/test_compost'",
          `publishDate: ${today}T12:00:00Z`,
          '---',
          '',
          'The story of this product.',
          '',
        ].join('\n'),
      );
      // The editor picks the change up; the story is typed in it.
      const monaco = page.locator('.monaco-editor').first();
      await expect(monaco).toContainText('test_compost', { timeout: 30_000 });
      await monaco.click();
      await page.keyboard.press('ControlOrMeta+ArrowDown');
      await page.keyboard.press('End');
      await page.keyboard.press('Enter');
      await page.keyboard.type('Compost turns what is finished into what comes next.');
      await page.keyboard.press('ControlOrMeta+s');
      const productText = () => {
        try {
          return readFileSync(product('compost'), 'utf8');
        } catch {
          return '';
        }
      };
      await expect.poll(productText, { timeout: 30_000 }).toContain('what comes next');
      expect(productText()).toContain('price: 12');

      await page.getByRole('button', { name: 'Preview', exact: true }).click();
      const url = await waitForSitePreview(page, folder);
      expect(url).toMatch(/\/shop\/compost$/);
      const { site, close } = await openSite();
      try {
        await pollStatus(url, 200, 3 * 60_000);
        await site.goto(url);
        await expect(site.getByRole('heading', { name: 'Compost', exact: true })).toBeVisible({
          timeout: 60_000,
        });
        await expect(site.locator('article')).toContainText('what comes next');
        const buy = site.locator('[data-buy="link"]');
        await expect(buy).toHaveAttribute('href', 'https://buy.stripe.com/test_compost');
        await expect(buy).toContainText('12');
        const image = site.locator('img.article-image');
        await expect(image).toHaveCount(1);
        expect(
          (
            await site.request.get(new URL((await image.getAttribute('src'))!, url).toString())
          ).status(),
        ).toBe(200);
        // The listing carries the product, its price and its picture.
        await site.goto(new URL('/shop/', url).toString());
        await expect(site.getByRole('link', { name: /Compost/ })).toBeVisible();
        await expect(site.getByRole('link', { name: /Garden print, A3/ })).toBeVisible();
        await expect(site.locator('[data-buy]').first()).toContainText('$');

        // An edit to the price is the whole edit.
        writeFileSync(
          product('compost'),
          readFileSync(product('compost'), 'utf8').replace('price: 12', 'price: 15'),
        );
        await pollBody(url, /15(\.00)?/, 3 * 60_000);
        await site.goto(url);
        await expect(site.locator('[data-buy="link"]')).toContainText('15');
      } finally {
        await close();
      }
    } finally {
      await app.close();
    }
  });

  test('TOOL-business-page — settings, offer, FAQ, pricing and a news entry show on every top-level page, and the site publishes', async () => {
    test.setTimeout(25 * 60_000);
    const api = await startMockApi();
    const { app, page } = await launchApp({ env: { CRUX_API_URL: api.url } });
    try {
      page.setDefaultTimeout(60_000);
      await page.setViewportSize({ width: 1600, height: 1000 });
      await enterGarden(page);
      const { id, folder } = await createFromPicker(page, /^Business Page/);
      await expect
        .poll(() => existsSync(join(folder, 'src/config.json')), { timeout: 120_000 })
        .toBe(true);
      const url = await waitForSitePreview(page, folder);
      const origin = new URL('/', url).toString();

      // Settings, the offer, one FAQ and one price, each in its data file.
      const edit = (path: string, change: (doc: unknown) => void) => {
        const doc = JSON.parse(readFileSync(join(folder, path), 'utf8'));
        change(doc);
        writeFileSync(join(folder, path), `${JSON.stringify(doc, null, 2)}\n`);
      };
      edit('src/config.json', (d) => {
        const c = d as { name: string; description: string };
        c.name = 'Harbour Joinery';
        c.description = 'Fitted kitchens, measured and made.';
      });
      edit('src/data/json-files/featuresData.json', (d) => {
        (d as { title: string }[])[0]!.title = 'Fitted kitchens';
      });
      edit('src/data/json-files/faqData.json', (d) => {
        (d as { question: string }[])[0]!.question = 'What does a kitchen usually cost?';
      });
      edit('src/data/json-files/pricingTablesdata.json', (d) => {
        (d as { header: { title: string; price: string } }[])[0]!.header.title = 'Small job';
        (d as { header: { title: string; price: string } }[])[0]!.header.price = '49';
      });
      // A news entry from the Builder.
      await openBuilder(page);
      await page
        .getByRole('button', { name: /new post/i })
        .first()
        .click();
      await page.getByPlaceholder('Post title').fill('Open day');
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await expect
        .poll(() => existsSync(join(folder, 'src/content/blog/open-day.md')), { timeout: 30_000 })
        .toBe(true);

      const { site, close } = await openSite();
      try {
        await pollBody(origin, 'Harbour Joinery', 3 * 60_000);
        await site.goto(origin);
        await painted(site, 'Harbour Joinery');
        // (The settings' "One line" is only the head's fallback description in
        // this theme: every page passes its own, so it never shows on a page.)
        // Every top-level navigation item, from the site's own bar (the
        // theme's items are menuitems, not links).
        const nav = site.locator('nav[aria-label="main navigation"]');
        for (const [name, text] of [
          ['Pricing', 'Small job'],
          ['Features', 'Fitted kitchens'],
          ['Contact', /contact/i],
        ] as const) {
          await nav.getByText(name, { exact: true }).first().click();
          await painted(site, text);
        }
        // Resources opens on hover; FAQ sits in it.
        await nav.getByText('Resources', { exact: true }).first().hover();
        const faq = nav.getByText('FAQ', { exact: true }).first();
        if (await faq.isVisible().catch(() => false)) await faq.click();
        else await site.goto(new URL('/faq/', origin).toString());
        await painted(site, 'What does a kitchen usually cost?');
        await painted(site, /pricing/i);
        // Nothing tracks the visitor (ADR 0008).
        const html = await site.content();
        for (const trace of ['googletagmanager', 'google-analytics', 'gtag('])
          expect(html.toLowerCase()).not.toContain(trace);
      } finally {
        await close();
      }

      const paths = await publishViaShare(page, api, id);
      for (const path of [
        'index.html',
        'pricing/index.html',
        'features/index.html',
        'faq/index.html',
        'contact/index.html',
      ])
        expect(paths, paths.join(', ')).toContain(path);

      // The news entry made from the Builder is on the site and in the build.
      // (Known to fail: the Builder's new post carries no `tags`, and the
      // theme's blog schema requires them, so the entry never renders.)
      await pollStatus(new URL('/blog/open-day/', origin).toString(), 200, 60_000);
      const { site: news, close: closeNews } = await openSite();
      try {
        await news.goto(new URL('/blog/', origin).toString());
        await painted(news, 'Open day');
      } finally {
        await closeNews();
      }
      expect(paths, paths.join(', ')).toContain('blog/open-day/index.html');
    } finally {
      await app.close();
      await api.close();
    }
  });

  test('TOOL-resume — profile, contact, experience, dates and links edited in the one Markdown file show in order, without placeholders', async () => {
    test.setTimeout(20 * 60_000);
    const { app, page } = await launchApp();
    try {
      page.setDefaultTimeout(60_000);
      await page.setViewportSize({ width: 1600, height: 1000 });
      await enterGarden(page);
      const { folder } = await createFromPicker(page, /^Resume/);
      await expect
        .poll(() => existsSync(join(folder, 'src/pages/index.md')), { timeout: 120_000 })
        .toBe(true);
      const url = await waitForSitePreview(page, folder);

      // The offered control is the editor on src/pages/index.md.
      const artifacts = await openPanel(page, 'artifacts', 'Toggle artifacts');
      const tree = artifacts.getByRole('tree');
      await tree.getByText('src', { exact: true }).click();
      await tree.getByText('pages', { exact: true }).click();
      await tree.getByText('index.md', { exact: true }).click();
      const original = readFileSync(join(folder, 'src/pages/index.md'), 'utf8');
      const front = original.match(/^---[\s\S]*?---\n/)?.[0] ?? '';
      await replaceEditor(
        page,
        front +
          [
            '# Rosa Albright',
            '',
            '**Joiner and furniture maker**',
            '',
            'Bristol, UK | rosa@albright.example | https://rosa.albright.example',
            '',
            '## Work Experience',
            '',
            '### [Harbour Joinery](https://harbour.example/)',
            '',
            '#### Lead joiner | Jan 2021 - Present',
            '',
            '- Fitted kitchens, measured and made.',
            '',
            '### [Quay Workshop](https://quay.example/)',
            '',
            '#### Apprentice | Sep 2017 - Dec 2020',
            '',
            '## Education',
            '',
            '### City College',
            '',
            '#### Furniture making | 2015 - 2017',
            '',
            '## Skills',
            '',
            '**The ones you would be hired for:** joinery, drawing, fitting.',
            '',
          ].join('\n'),
      );
      await expect
        .poll(() => readFileSync(join(folder, 'src/pages/index.md'), 'utf8'))
        .toContain('Rosa Albright');

      const { site, close } = await openSite();
      try {
        await pollBody(url, 'Rosa Albright', 3 * 60_000);
        await site.goto(url);
        await painted(site, 'Rosa Albright');
        await painted(site, 'Jan 2021 - Present');
        await expect(site.getByRole('link', { name: 'Harbour Joinery' })).toHaveAttribute(
          'href',
          'https://harbour.example/',
        );
        await expect(
          site
            .getByRole('link', { name: 'rosa@albright.example' })
            .or(site.getByText('rosa@albright.example')),
        ).toBeVisible();
        // The order is the file's order, and no placeholder link survived.
        const headings = await site.locator('h2').allTextContents();
        expect(headings.indexOf('Work Experience')).toBeLessThan(headings.indexOf('Education'));
        expect(await site.locator('a[href*="example.com"]').count()).toBe(0);
        expect(await site.getByText('Your Name').count()).toBe(0);
      } finally {
        await close();
      }
    } finally {
      await app.close();
    }
  });

  test('TOOL-5ws — the question is yours; a round runs out of questions, ends on the right guess and starts again', async () => {
    test.setTimeout(20 * 60_000);
    const API = 'https://api.e2e.invalid';
    const { app, page } = await launchApp();
    try {
      page.setDefaultTimeout(60_000);
      await page.setViewportSize({ width: 1600, height: 1000 });
      await enterGarden(page);
      const { folder } = await createFromPicker(page, /^5Ws/);
      await openBuilder(page);
      await expect(page.getByRole('button', { name: /Start a round$/ })).toBeVisible({
        timeout: 30_000,
      });

      // The sample question is edited in Site settings (shelf.json), offered as
      // the template's declared form; the edit lands in the file.
      await page.getByRole('button', { name: 'Site settings' }).click();
      const question = page.getByLabel('The question');
      await expect(question).toHaveValue('Who am I?', { timeout: 30_000 });
      await question.fill('Who is talking?');
      await question.blur();
      await expect
        .poll(() => JSON.parse(readFileSync(join(folder, 'shelf.json'), 'utf8')).question, {
          timeout: 30_000,
        })
        .toBe('Who is talking?');

      // Start a round: the game is the site's /play page.
      await openBuilder(page);
      await page.getByRole('button', { name: /Start a round$/ }).click();
      const url = await waitForSitePreview(page, folder);
      const origin = new URL('/', url).toString();
      const shelf = parseShelf(historyShelf);
      const daily = pickEntry(shelf, new Date().toISOString().slice(0, 10));

      const { site: play, close } = await openSite({ width: 1200, height: 900 });
      try {
        await withScriptedModel(play);
        await withPlayApi(play, API);
        await pollBody(new URL('/play/', origin).toString(), /round/i, 3 * 60_000);
        await play.goto(new URL('/play/', origin).toString());
        const appEl = play.locator('.round-app');
        await expect(appEl).not.toHaveClass(/booting/, { timeout: 60_000 });
        await expect(play.locator('.round-card .banner')).toHaveText('5Ws · Who is talking?');
        await expect(play.locator('.round-voice .voice.opening')).not.toHaveText('', {
          timeout: 60_000,
        });
        await expect(play.getByTestId('questions-left')).toHaveText('Q 10');

        // Ten questions is the limit: the eleventh cannot be asked.
        for (let n = 1; n <= 10; n++) {
          await play.getByLabel('Ask a question').fill(`Question ${n}?`);
          await play.getByRole('button', { name: 'Ask', exact: true }).click();
          await expect(play.getByTestId('questions-left')).toHaveText(`Q ${10 - n}`, {
            timeout: 30_000,
          });
          await expect(play.getByTestId('clock')).toHaveAttribute('data-composing', 'false', {
            timeout: 30_000,
          });
        }
        await expect(play.getByLabel('Ask a question')).toHaveAttribute(
          'placeholder',
          'No questions left — guess',
        );
        await expect(play.locator('.reveal')).toHaveCount(0); // nothing leaked before the guess

        // The right guess ends the round; the reveal names the hidden voice.
        await play.getByLabel('Your guess').fill(daily.name);
        await play.getByRole('button', { name: 'Guess', exact: true }).click();
        await expect(play.locator('.reveal .who')).toHaveText(`This was ${daily.name}.`, {
          timeout: 60_000,
        });
        await expect(play.getByRole('button', { name: 'Ask', exact: true })).toHaveCount(0);

        // Another round starts clean.
        await play.getByRole('button', { name: 'Play again' }).click();
        await expect(play.getByTestId('questions-left')).toHaveText('Q 10', { timeout: 30_000 });
        await expect(play.getByTestId('points')).toHaveText('PTS 10');
        await expect(play.locator('.reveal')).toHaveCount(0);
      } finally {
        await close();
      }
    } finally {
      await app.close();
    }
  });

  test('TOOL-runner-app — a Garden with a Stack and a Link: the Runner reads it, a service switches between stack and source, and starts and stops from source', async () => {
    test.setTimeout(10 * 60_000);
    const { app, page, dir } = await launchApp();
    try {
      await enterGarden(page);
      await newGarden(page, 'Platform');

      // A Stack with two services.
      const stack = await member(page, /^Stack/, 'My stack');
      writeFileSync(
        join(stack.folder, 'compose.yaml'),
        `services:
  # The site, from a container until a project offers it from source.
  web:
    image: alpine:3
    command: ["sleep", "120"]
    ports:
      - "8471:80"

  # Nothing depends on it.
  store:
    image: alpine:3
    command: ["sleep", "120"]
`,
      );

      // A Link to a project outside the Garden that offers "web" from source.
      const project = join(dir, 'web-project');
      mkdirSync(project, { recursive: true });
      writeFileSync(
        join(project, 'package.json'),
        JSON.stringify(
          {
            name: 'web-from-source',
            scripts: {
              serve:
                'node -e "console.log(\'web from source on\', process.env.PORT); setInterval(() => {}, 1000)"',
            },
          },
          null,
          2,
        ),
      );
      writeFileSync(
        join(dir, 'userData', 'approved-folders.json'),
        JSON.stringify([project], null, 2),
      );
      const link = await member(page, /^Link/, 'Web from source');
      const linkDoc = (folder: string | null) =>
        writeFileSync(
          join(link.folder, 'link.json'),
          JSON.stringify(
            {
              version: 1,
              app: 'link',
              ...(folder ? { folder } : {}),
              script: 'serve',
              args: [],
              port: 8471,
              provides: 'web',
            },
            null,
            2,
          ),
        );
      linkDoc(project);

      // The Runner reads the Garden.
      await member(page, /^Runner/, 'My workspace');
      const board = page.frameLocator('iframe[data-crux-id]');
      const refresh = () => board.locator('#refresh').click();
      const webRow = board
        .locator('article.service')
        .filter({ has: board.locator('h3', { hasText: /^web\b/ }) });
      await expect(board.locator('#services')).toContainText('store', { timeout: 120_000 });
      await expect
        .poll(
          async () => {
            await refresh().catch(() => {});
            return webRow
              .locator('.from')
              .textContent()
              .catch(() => '');
          },
          { timeout: 120_000, intervals: [3000] },
        )
        .toBe('from source');
      await expect(board.locator('#about')).toContainText('2 services, 1 of them from source');
      await expect(
        board.locator('article.service').filter({ hasText: 'store' }).locator('.from'),
      ).toHaveText('from stack');

      // Without a chosen folder the same service falls back to the Stack, and says why.
      linkDoc(null);
      await expect
        .poll(
          async () => {
            await refresh().catch(() => {});
            return webRow
              .locator('.from')
              .textContent()
              .catch(() => '');
          },
          { timeout: 120_000, intervals: [3000] },
        )
        .toBe('from stack');
      await expect(webRow.locator('.fell-back')).toContainText('no folder has been chosen');
      await expect(board.locator('#notes')).toContainText('offers web from source');

      // Back from source: it starts and stops from here, no container runner needed.
      linkDoc(project);
      await expect
        .poll(
          async () => {
            await refresh().catch(() => {});
            return webRow
              .locator('.from')
              .textContent()
              .catch(() => '');
          },
          { timeout: 120_000, intervals: [3000] },
        )
        .toBe('from source');
      await webRow.getByRole('button', { name: 'Start' }).click();
      await expect(board.locator('#output')).toContainText(/web: (start|running|up)/i, {
        timeout: 120_000,
      });
      await expect(webRow.locator('.status')).toContainText(/run/i, { timeout: 60_000 });
      await webRow.getByRole('button', { name: 'Stop' }).click();
      await expect(webRow.locator('.status')).toContainText(/not running|stopped|exited/i, {
        timeout: 60_000,
      });
    } finally {
      await app.close();
    }
  });
});

/** The scripted 5Ws model in the play page: the app's own mock script runs in Node, the page calls it. */
async function withScriptedModel(p: Page) {
  await p.exposeFunction(
    '__fiveWsScript',
    async (prompt: unknown) =>
      fiveWsScript(prompt as Parameters<typeof fiveWsScript>[0]) ?? 'Mock.',
  );
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

/** The crux.garden API as the play page sees it: sign-in and the crux's Store, answered in the test. */
async function withPlayApi(p: Page, API: string) {
  const shared: Record<string, unknown> = {};
  const mine: Record<string, unknown> = {};
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
        if (!bearer)
          return json(401, {
            statusCode: 401,
            message: 'Writing to the store requires a signed-in account',
          });
        if ((body.mode ?? 'protected') === 'protected') mine[key] = body.value;
        else shared[key] = body.value;
        return json(200, { value: body.value });
      }
      if (key in shared) return json(200, { value: shared[key] });
      return json(200, { value: bearer ? (mine[key] ?? null) : null });
    }
    return json(404, {
      statusCode: 404,
      message: `e2e: unhandled ${req.method()} ${url.pathname}`,
    });
  });
}
