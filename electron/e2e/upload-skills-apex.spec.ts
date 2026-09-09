import { test, expect, type Locator, type Page } from '@playwright/test';
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchApp } from './launch';
import { startMockApi } from './api-mock';

/**
 * Three flows with no e2e until now:
 *
 *  1. Artifacts pane upload — the toolbar's Upload → "Files…" file chooser,
 *     an OS drag-and-drop (a DataTransfer carrying Files, dispatched through
 *     dragenter → dragover → drop like Chromium does), and the "already
 *     exists. Replace it?" dialog. Every file is checked in the tree AND on
 *     disk in the Project Folder.
 *  2. Skills per crux (ADR 0013 B6) — skills are bundled `src/ai/skills/*.md`
 *     files (the folder is the registry; there is no per-crux skill UI). The
 *     system prompt carries the index of every one; a crux loads a skill by
 *     what it IS: the moment a Blank crux gains an astro.config it is a Site
 *     Crux, the prompt switches to the Site Crux guidance and the Project
 *     Folder's AGENTS.md names `astro-basics` for outside agents.
 *  3. Apex custom domain — with the mocked API on the Gardener plan, connect
 *     `example.com` and assert the Share pane shows exactly the records the API
 *     returned, plus the apex explanation whenever an A/ALIAS record is among
 *     them (see the gap note in the test).
 */

/** A valid 1×1 PNG — small, binary, and easy to compare byte-for-byte. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

async function plantBlankCrux(page: Page) {
  await page.getByRole('button', { name: /enter/i }).click();
  await page.getByText('Plant a new garden').click();
  await page.getByRole('button', { name: 'Welcome' }).click();
  await page.getByRole('button', { name: 'Add Crux' }).click();
  await page.getByRole('button', { name: /^Blank/ }).click();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
}

/** Open a pane if it is closed; never toggle an open one shut. */
async function ensurePane(page: Page, type: string, toggle: string) {
  const body = page.getByTestId(`pane-body-${type}`);
  if (!(await body.isVisible().catch(() => false)))
    await page.getByRole('button', { name: toggle }).click();
  await expect(body).toBeVisible({ timeout: 30_000 });
}

/** The one Project Folder in a fresh garden (memory.md may sit beside it). */
function projectFolderIn(gardenRoot: string): string {
  const dirs = readdirSync(gardenRoot).filter((n) => statSync(join(gardenRoot, n)).isDirectory());
  expect(dirs).toHaveLength(1);
  return join(gardenRoot, dirs[0]!);
}

interface DroppedFile {
  name: string;
  type: string;
  base64: string;
}

/**
 * Start an OS file drag over `target`: build a DataTransfer carrying the
 * files and dispatch dragenter + dragover (both bubble to the pane's drop
 * zone and to react-dnd's window listeners, exactly like a real drag). The
 * DataTransfer is kept on window so `finishDrop` can hand the same object
 * to the drop event.
 */
async function beginOsDrag(target: Locator, files: DroppedFile[]) {
  await target.evaluate((el, list) => {
    const dt = new DataTransfer();
    for (const f of list) {
      const bytes = Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0));
      dt.items.add(new File([bytes], f.name, { type: f.type }));
    }
    (window as unknown as { __e2eDt?: DataTransfer }).__e2eDt = dt;
    for (const type of ['dragenter', 'dragover'] as const) {
      el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
    }
  }, files);
}

async function finishDrop(target: Locator) {
  await target.evaluate((el) => {
    const dt = (window as unknown as { __e2eDt?: DataTransfer }).__e2eDt;
    if (!dt) throw new Error('beginOsDrag was not called');
    el.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  });
}

function textFile(name: string, content: string): DroppedFile {
  return { name, type: 'text/plain', base64: Buffer.from(content).toString('base64') };
}

/** What the mock model has been sent as system prompts so far (see ai/mock-model.ts). */
function systemPrompts(page: Page): Promise<string[]> {
  return page.evaluate(
    () =>
      (
        window as unknown as { __cruxAiMock?: { systemPrompts(): string[] } }
      ).__cruxAiMock?.systemPrompts() ?? [],
  );
}

test.describe('upload, skills, apex domain', () => {
  test.setTimeout(150_000);

  test('Artifacts upload: file chooser, OS drag-and-drop, Replace dialog — tree and disk agree', async () => {
    const src = mkdtempSync(join(tmpdir(), 'crux-upload-src-'));
    const { app, page, dir } = await launchApp();
    try {
      await plantBlankCrux(page);
      await expect(page.getByRole('button', { name: 'New file' })).toBeVisible({ timeout: 30_000 });
      const folder = projectFolderIn(join(dir, 'garden'));
      const onDisk = (rel: string) => existsSync(join(folder, rel));
      const textOnDisk = (rel: string) => readFileSync(join(folder, rel), 'utf8');

      // ── OS drop onto the empty pane: the drop zone lights up, the file lands ──
      const emptyHint = page.getByText('Create or import an artifact to get started');
      await expect(emptyHint).toBeVisible();
      await beginOsDrag(emptyHint, [textFile('dropped.txt', 'dropped via OS drag\n')]);
      const emptyOverlay = page.getByText('Drop files or folders here');
      await expect(emptyOverlay).toBeVisible();
      await finishDrop(emptyOverlay);
      const tree = page.getByRole('tree');
      await expect(tree.getByText('dropped.txt', { exact: true })).toBeVisible({ timeout: 15_000 });
      await expect.poll(() => onDisk('dropped.txt')).toBe(true);
      expect(textOnDisk('dropped.txt')).toBe('dropped via OS drag\n');
      await page.screenshot({ path: 'e2e/.results/upload-skills-apex-1-dropped.png' });

      // ── Upload → Files… opens a chooser; a text file and a PNG land together ──
      const hello = join(src, 'hello.txt');
      const pixel = join(src, 'pixel.png');
      writeFileSync(hello, 'hello v1\n');
      writeFileSync(pixel, PNG);
      await page.getByRole('button', { name: 'Upload' }).click();
      const [chooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.getByRole('button', { name: 'Files…' }).click(),
      ]);
      expect(chooser.isMultiple()).toBe(true);
      await chooser.setFiles([hello, pixel]);
      await expect(tree.getByText('hello.txt', { exact: true })).toBeVisible({ timeout: 15_000 });
      await expect(tree.getByText('pixel.png', { exact: true })).toBeVisible();
      await expect.poll(() => onDisk('hello.txt') && onDisk('pixel.png')).toBe(true);
      expect(textOnDisk('hello.txt')).toBe('hello v1\n');
      expect(Buffer.compare(readFileSync(join(folder, 'pixel.png')), PNG)).toBe(0); // bytes intact
      await page.screenshot({ path: 'e2e/.results/upload-skills-apex-2-uploaded.png' });

      // ── Same name through the chooser: the Replace dialog names the file ──
      writeFileSync(hello, 'hello v2\n');
      await page.getByRole('button', { name: 'Upload' }).click();
      const [chooser2] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.getByRole('button', { name: 'Files…' }).click(),
      ]);
      await chooser2.setFiles(hello);
      const replaceAsk = page.getByRole('dialog').filter({ hasText: 'already exists' });
      await expect(replaceAsk).toBeVisible();
      await expect(replaceAsk).toContainText('"hello.txt" already exists. Replace it?');
      await replaceAsk.getByRole('button', { name: 'Replace' }).click();
      await expect(replaceAsk).toHaveCount(0);
      await expect.poll(() => textOnDisk('hello.txt')).toBe('hello v2\n');
      await expect(tree.getByText('hello.txt', { exact: true })).toHaveCount(1); // replaced, not duplicated

      // ── OS drop of a same-named file onto the tree: Cancel keeps it, Replace swaps it ──
      await beginOsDrag(tree, [textFile('hello.txt', 'hello v3\n')]);
      await expect(page.getByText('Drop files here', { exact: true })).toBeVisible();
      await finishDrop(tree);
      const dropAsk = page.getByRole('dialog').filter({ hasText: 'already exists' });
      await expect(dropAsk).toBeVisible();
      await dropAsk.getByRole('button', { name: 'Cancel' }).click();
      await expect(dropAsk).toHaveCount(0);
      await page.waitForTimeout(500); // a wrong write would have landed by now
      expect(textOnDisk('hello.txt')).toBe('hello v2\n');

      await beginOsDrag(tree, [textFile('hello.txt', 'hello v3\n')]);
      await finishDrop(tree);
      await page
        .getByRole('dialog')
        .filter({ hasText: 'already exists' })
        .getByRole('button', { name: 'Replace' })
        .click();
      await expect.poll(() => textOnDisk('hello.txt')).toBe('hello v3\n');
      await expect(tree.getByText('hello.txt', { exact: true })).toHaveCount(1);
      await page.screenshot({ path: 'e2e/.results/upload-skills-apex-3-replaced.png' });
    } finally {
      await app.close();
    }
  });

  test('Skills (B6): the prompt indexes every bundled skill; a crux that becomes a Site Crux loads astro-basics and AGENTS.md says so', async () => {
    // The folder IS the registry (src/ai/skills/index.ts): every *.md there is a skill.
    const skillsDir = join(__dirname, '..', '..', 'src', 'ai', 'skills');
    const skillNames = readdirSync(skillsDir)
      .filter((f) => f.endsWith('.md'))
      .map((f) => f.slice(0, -'.md'.length));
    expect(skillNames).toContain('astro-basics');
    expect(skillNames.length).toBeGreaterThanOrEqual(5);

    const { app, page, dir } = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
    try {
      await plantBlankCrux(page);
      const input = page.getByPlaceholder('Send a message...');
      await expect(input).toBeVisible({ timeout: 30_000 });
      const folder = projectFolderIn(join(dir, 'garden'));
      const agentsMd = () => readFileSync(join(folder, 'AGENTS.md'), 'utf8');

      // ── First turn: the system prompt carries the skills index, not the Site Crux guidance ──
      await input.fill('hello');
      await input.press('Enter');
      await expect(page.getByText('Mock reply: hello')).toBeVisible({ timeout: 30_000 });
      const first = (await systemPrompts(page)).at(-1) ?? '';
      // A Blank crux: AGENTS.md is written into the Project Folder by the turn's
      // prompt build (system-prompt.ts → syncAgentsMd) and names no skill yet
      await expect
        .poll(() => existsSync(join(folder, 'AGENTS.md')), { timeout: 15_000 })
        .toBe(true);
      expect(agentsMd()).toContain('## About this crux');
      expect(agentsMd()).not.toMatch(/^- Skill: /m);
      expect(first).toContain('## Skills');
      expect(first).toContain('load_skill');
      for (const name of skillNames) expect(first).toContain(`- **${name}** —`);
      expect(first).not.toContain('## Site Crux');
      expect(first).not.toContain('The astro-basics skill is loaded in your workspace context');

      // ── An astro.config makes it a Site Crux: astro-basics loads for this crux ──
      await ensurePane(page, 'artifacts', 'Toggle artifacts');
      await page.getByRole('button', { name: 'New file' }).click();
      const nameInput = page.getByRole('tree').getByRole('textbox');
      await nameInput.fill('astro.config.mjs');
      await nameInput.press('Enter');
      await expect(
        page.getByRole('tree').getByText('astro.config.mjs', { exact: true }),
      ).toBeVisible();
      await expect.poll(() => existsSync(join(folder, 'astro.config.mjs'))).toBe(true);

      await input.fill('hello again');
      await input.press('Enter');
      await expect(page.getByText('Mock reply: hello again')).toBeVisible({ timeout: 30_000 });
      const second = (await systemPrompts(page)).at(-1) ?? '';
      expect(second).toContain('## Site Crux');
      expect(second).toContain('The astro-basics skill is loaded in your workspace context');
      expect(second).toContain('- **astro-basics** —'); // the index is still there for the rest
      // The Project Folder's guide for outside agents regenerated with the skill
      await expect.poll(agentsMd, { timeout: 15_000 }).toContain('- Skill: `astro-basics`');
      expect(agentsMd()).toContain('load_skill("astro-basics")');
      expect(agentsMd()).toContain('Site Crux');
      await page.screenshot({ path: 'e2e/.results/upload-skills-apex-4-skills.png' });
    } finally {
      await app.close();
    }
  });

  test('Apex custom domain (mocked API, Gardener): the records shown are the records returned', async () => {
    const api = await startMockApi();
    const { app, page } = await launchApp({ env: { CRUX_API_URL: api.url } });
    try {
      await plantBlankCrux(page);
      await page.getByRole('button', { name: 'New file' }).click({ timeout: 30_000 });
      const nameInput = page.getByRole('tree').getByRole('textbox');
      await nameInput.fill('index.html');
      await nameInput.press('Enter');
      const monaco = page.locator('.monaco-editor').first();
      await expect(monaco).toBeVisible({ timeout: 30_000 });
      await monaco.click();
      await page.keyboard.type('<h1>Apex</h1>');
      await page.keyboard.press('ControlOrMeta+s');

      // Connect + publish through the Share pane (first share asks about a backup)
      await page.getByRole('button', { name: 'Toggle share' }).click();
      await page.getByRole('button', { name: 'Share', exact: true }).click();
      await page.getByPlaceholder('email@example.com').fill('tester@example.com');
      await page.getByRole('button', { name: 'Send Code' }).click();
      await page.getByPlaceholder('Enter code').fill('123456');
      await page.getByRole('button', { name: 'Connect', exact: true }).click();
      const backupAsk = page
        .getByRole('dialog')
        .filter({ hasText: 'A published site is not a backup' });
      await expect(backupAsk).toBeVisible({ timeout: 30_000 });
      await backupAsk.getByRole('button', { name: 'Share without a backup' }).click();
      await expect(page.getByText('Up to date')).toBeVisible({ timeout: 30_000 });

      // Custom domains come with Gardener: upgrade the mock account, reopen the pane
      const domains = page.getByTestId('custom-domains');
      await expect(domains.getByTestId('domains-gardener')).toContainText('Gardener');
      api.state.billing.planId = 'gardener';
      await page.getByRole('button', { name: 'Toggle share' }).click();
      await page.getByRole('button', { name: 'Toggle share' }).click();
      await expect(page.getByTestId('crux-usage')).toBeVisible({ timeout: 30_000 });

      // ── Connect a bare (apex) domain ──
      await domains.getByRole('button', { name: 'Connect a domain' }).click();
      await domains.getByRole('textbox', { name: 'Domain name' }).fill('example.com');
      await domains.getByRole('button', { name: 'Connect', exact: true }).click();
      const dom = page.getByTestId('domain-example.com');
      await expect(dom).toContainText('example.com');
      await expect(dom).toContainText('Waiting for DNS');
      await expect(dom).toContainText('Create these records at your DNS provider, then verify:');
      expect(api.log.some((l) => l.startsWith('POST /cruxes/') && l.includes('/domains ->'))).toBe(
        true,
      );

      // Every record the API returned is on the card — type, name (copyable), value (copyable)
      const created = api.state.domains.find((d) => d.hostname === 'example.com');
      expect(created).toBeDefined();
      const records = created!.records as Array<{ type: string; name: string; value: string }>;
      expect(records.length).toBeGreaterThanOrEqual(2);
      for (const r of records) {
        await expect(dom.getByText(r.type, { exact: true })).toBeVisible();
        await expect(dom.getByRole('button', { name: r.name, exact: true })).toBeVisible();
        await expect(dom.getByRole('button', { name: r.value, exact: true }).first()).toBeVisible(); // two records may share a target
      }
      // The verify TXT is always among them; the gate target is the value of the host record
      expect(records).toContainEqual(
        expect.objectContaining({ type: 'TXT', name: '_crux-verify.example.com' }),
      );
      expect(
        records.some((r) => r.value === 'publish.crux.garden' || r.value === 'gate.crux.garden'),
      ).toBe(true); // a subdomain points at publish, an apex at the gate

      // The apex explanation appears exactly when an A/ALIAS record is among them
      // (CustomDomainSection.tsx). The real API answers a bare domain with
      // ALIAS + CNAME for www + TXT (api/src/domains/domains.service.ts); the
      // mock (api-mock.ts, POST /cruxes/:id/domains) still answers CNAME + TXT
      // for every hostname, so today this takes the second branch. When the
      // mock grows apex records, the first branch proves the full apex card.
      const apex = records.some((r) => r.type === 'A' || r.type === 'ALIAS');
      const explanation = dom.getByText(/Your site will answer at/);
      if (apex) {
        await expect(explanation).toBeVisible();
        await expect(explanation).toContainText('www.example.com');
        await expect(explanation).toContainText('example.com redirects there');
        expect(records).toContainEqual(
          expect.objectContaining({ type: 'CNAME', name: 'www.example.com' }),
        );
        if (records.some((r) => r.type === 'ALIAS'))
          await expect(explanation).toContainText('ALIAS is also called ANAME');
      } else {
        expect(records.map((r) => r.type).sort()).toEqual(['CNAME', 'TXT']);
        await expect(explanation).toHaveCount(0);
      }
      await page.screenshot({ path: 'e2e/.results/upload-skills-apex-5-apex.png' });

      // Remove it again: a pending domain asks with "Remove"
      await dom.getByRole('button', { name: 'Remove example.com' }).click();
      const confirm = page.getByRole('dialog');
      await expect(confirm).toContainText('Remove example.com?');
      await confirm.getByRole('button', { name: 'Remove', exact: true }).click();
      await expect(page.getByTestId('domain-example.com')).toHaveCount(0);
      expect(api.state.domains.some((d) => d.hostname === 'example.com')).toBe(false);
    } finally {
      await app.close();
      await api.close();
    }
  });
});
