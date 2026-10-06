import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, type Locator, type Page } from '@playwright/test';
import type { DownloadItem, Event } from 'electron';
import JSZip from 'jszip';
import { launchApp } from './launch';
import { createCrux, enterGarden, openFullThemeBuilder, storedCrux } from './multi-crux-helpers';
import { hidePane, newTaskButton, openPanel, showPane, togglePanel } from './panel-helpers';

const overrides = {
  graphLane1: 'rgba(255, 0, 0, 0.5)',
  graphLane2: 'rgba(0, 0, 255, 0.75)',
  graphLane3: 'rgba(150, 40, 80, 0.35)',
  graphLane4: 'rgba(80, 150, 40, 0.45)',
  graphLane5: 'rgba(40, 80, 150, 0.55)',
  graphLane6: 'rgba(150, 80, 40, 0.85)',
  graphLink: 'rgba(255, 255, 0, 0.6)',
  graphMergeLink: 'rgba(0, 255, 255, 0.65)',
  graphTransferLink: 'rgba(255, 0, 255, 0.7)',
  graphInactive: 'rgba(0, 255, 0, 0.25)',
  graphLabelSize: '1rem',
  panel: '#102030',
  fontBody: 'monospace',
  fontWeightBody: '600',
  motionScale: '0',
  motionDurationBase: '900ms',
  motionDurationSlow: '1500ms',
};
type DrawingEvidence = {
  text: { label: string; font: string; alpha: number; renderedSize: number }[];
  opacities: number[];
};

/** Observe the real renderer's drawing calls; do not replace a graph or its output. */
async function observeDrawing(page: Page) {
  await page.evaluate(() => {
    const evidence: DrawingEvidence = { text: [], opacities: [] };
    Object.assign(window, { __growthDrawingEvidence: evidence });
    const originalText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
      if (this.canvas.closest('[data-testid="growth-canvas-2d"]')) {
        const fontSize = Number(this.font.match(/([\d.]+)px/)?.[1]);
        const item = {
          label: text,
          font: this.font,
          alpha: this.globalAlpha,
          renderedSize: (fontSize * this.getTransform().a) / devicePixelRatio,
        };
        if (!evidence.text.some((prior) => JSON.stringify(prior) === JSON.stringify(item)))
          evidence.text.push(item);
      }
      if (maxWidth === undefined) originalText.call(this, text, x, y);
      else originalText.call(this, text, x, y, maxWidth);
    };
    for (const kind of [WebGLRenderingContext, WebGL2RenderingContext]) {
      const names = new WeakMap<WebGLUniformLocation, string>();
      const originalLocation = kind.prototype.getUniformLocation;
      const originalOpacity = kind.prototype.uniform1f;
      kind.prototype.getUniformLocation = function (program, name) {
        const location = originalLocation.call(this, program, name);
        if (location) names.set(location, name);
        return location;
      };
      kind.prototype.uniform1f = function (location, value) {
        if (
          location &&
          names.get(location) === 'opacity' &&
          this.canvas instanceof HTMLCanvasElement &&
          this.canvas.closest('[data-testid="growth-canvas-3d"]') &&
          !evidence.opacities.includes(value)
        )
          evidence.opacities.push(value);
        originalOpacity.call(this, location, value);
      };
    }
  });
}

async function markVersion(page: Page, id: string, folder: string, label: string) {
  const content = `<h1>${label}</h1>`;
  writeFileSync(join(folder, 'index.html'), content);
  const fingerprint = createHash('sha256').update(content).digest('hex');
  await expect
    .poll(() =>
      page.evaluate(async (id) => {
        const files = window.electronAPI!.sqlite.fileContent;
        const head = await files.head(id);
        if (!head) return null;
        return (await files.list({ cruxId: id, expected: head })).entries.find(
          (file) => file.path === 'index.html',
        )?.fingerprint;
      }, id),
    )
    .toBe(fingerprint);
  const pane = page.getByTestId('pane-body-history');
  if (!(await pane.isVisible())) await togglePanel(page, 'Toggle growth');
  await pane.getByRole('button', { name: 'Mark version', exact: true }).click();
  await pane.getByPlaceholder('Label (optional)').fill(label);
  await pane.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(pane.getByText(label, { exact: true })).toBeVisible();
  await expect(pane.getByRole('button', { name: 'Mark version', exact: true })).toBeEnabled();
}

async function createGraph(page: Page) {
  const main = await createCrux(page, 'Graph colors');
  await markVersion(page, main, (await storedCrux(page, main)).projectFolder, 'Graph base');
  await (await newTaskButton(page)).click();
  await page.getByRole('textbox', { name: 'Task name', exact: true }).fill('Side path');
  await page.getByRole('button', { name: 'Save and start task', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Review changes', exact: true })).toBeVisible();
  const task = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
  const taskFolder = await page.evaluate(async (id) => {
    const row = (await window.electronAPI!.sqlite.get(
      'SELECT project_folder FROM working_copies WHERE id = ?',
      [id],
    )) as { project_folder: string };
    return row!.project_folder;
  }, task);
  await markVersion(page, task, taskFolder, 'Graph branch');
  await page.getByTestId('task-bar').getByRole('link', { name: 'Main', exact: true }).click();
  await expect(page.locator('[data-workspace-id]')).toHaveAttribute('data-workspace-id', main);
  return main;
}

async function canvasPixelCount(canvas: Locator, expected: number[]) {
  return canvas.evaluate((element, expected) => {
    const canvas = element as HTMLCanvasElement;
    const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    let matching = 0;
    for (let i = 0; i < pixels.length; i += 4)
      if (expected.every((channel, offset) => Math.abs(pixels[i + offset]! - channel) <= 2))
        matching++;
    return matching;
  }, expected);
}

async function editToken(mood: Locator, key: string, value: string) {
  // Search traverses every token group, even while Graphs remains selected.
  await mood.getByLabel('Find a token', { exact: true }).fill(key);
  const label = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  const control = mood.getByRole('textbox', {
    name: `${label[0]!.toUpperCase()}${label.slice(1)} value`,
    exact: true,
  });
  await control.fill(value);
  await control.press('Enter');
  await expect(control).toHaveValue(value);
}

async function capture(page: Page, canvas: Locator, name?: string) {
  const screenshot = await canvas.screenshot(
    name ? { path: test.info().outputPath(`${name}.png`) } : {},
  );
  if (name) await test.info().attach(name, { body: screenshot, contentType: 'image/png' });
  return page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const image = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const context = new OffscreenCanvas(image.width, image.height).getContext('2d')!;
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, image.width, image.height).data;
    let red = 0;
    let blue = 0;
    let contrasted = 0;
    const background = [pixels[0]!, pixels[1]!, pixels[2]!];
    for (let i = 0; i < pixels.length; i += 4) {
      const [r, g, b] = [pixels[i]!, pixels[i + 1]!, pixels[i + 2]!];
      if (r > 60 && r > g * 1.6 && r > b * 1.6) red++;
      if (b > 80 && b > r * 1.6 && b > g * 1.4) blue++;
      if ([r, g, b].some((value, index) => Math.abs(value - background[index]!) > 30)) contrasted++;
    }
    image.close();
    return { red, blue, contrasted };
  }, screenshot.toString('base64'));
}

async function assertGraphAppearance(page: Page, stage: string) {
  const pane = await openPanel(page, 'history', 'Toggle growth');
  await pane.getByRole('button', { name: 'Whole Crux · branches & merges' }).click();
  const graph = page.getByRole('dialog', { name: 'Whole Crux Growth', exact: true });
  await graph.getByRole('button', { name: 'Expand checkpoints', exact: true }).click();
  const canvas2d = graph.getByTestId('growth-canvas-2d').locator('canvas');
  await expect(canvas2d).toBeVisible();
  await expect(graph.locator('[data-growth-reveal]')).toHaveAttribute('data-growth-reveal', 'done');
  await expect.poll(() => canvasPixelCount(canvas2d, [255, 0, 0, 128])).toBeGreaterThan(8);
  await expect.poll(() => canvasPixelCount(canvas2d, [0, 0, 255, 191])).toBeGreaterThan(8);
  const drawing = () =>
    page.evaluate(
      () =>
        (window as unknown as { __growthDrawingEvidence: DrawingEvidence }).__growthDrawingEvidence,
    );
  await expect
    .poll(async () =>
      (await drawing()).text.some(
        ({ label, font, alpha }) =>
          label.startsWith('Graph base') && /600 .*monospace/.test(font) && alpha === 1,
      ),
    )
    .toBe(true);
  const labels = (await drawing()).text.filter(({ label }) => label.startsWith('Graph base'));
  expect(
    labels.every(({ alpha }) => alpha === 1),
    'zero motion has no partial reveal',
  ).toBe(true);
  const expectedLabelSize = await page.evaluate(() =>
    parseFloat(getComputedStyle(document.documentElement).fontSize),
  );
  expect(
    labels.some(({ renderedSize }) => Math.abs(renderedSize - expectedLabelSize) < 1),
    'the chosen 1rem label size reaches canvas pixels',
  ).toBe(true);
  await capture(page, canvas2d, `${stage}-2d`);

  await graph.getByLabel('Find checkpoint').fill('Graph base');
  await graph.getByRole('button', { name: /^Graph base Main · / }).click();
  await expect.poll(() => canvasPixelCount(canvas2d, [0, 255, 0, 64])).toBeGreaterThan(8);
  await capture(page, canvas2d, `${stage}-2d-inactive`);
  await graph.getByRole('button', { name: 'Close Growth graph', exact: true }).click();

  // Reopen without ancestry selection so both chosen lane colors reach the GPU.
  await pane.getByRole('button', { name: 'Whole Crux · branches & merges' }).click();
  await graph.getByRole('button', { name: 'Expand checkpoints', exact: true }).click();
  await graph.getByRole('button', { name: 'Explore in 3D', exact: true }).click();
  const canvas3d = graph.getByTestId('growth-canvas-3d').locator('canvas');
  await expect(canvas3d).toBeVisible({ timeout: 30_000 });
  await expect(graph.getByText('The graph renderer is unavailable.', { exact: false })).toHaveCount(
    0,
  );
  for (const opacity of [0.5, 0.75])
    await expect
      .poll(async () =>
        (await drawing()).opacities.some((value) => Math.abs(value - opacity) < 0.001),
      )
      .toBe(true);
  await expect
    .poll(async () => {
      const pixels = await capture(page, canvas3d);
      return pixels.red > 8 && pixels.blue > 8;
    })
    .toBe(true);
  await capture(page, canvas3d, `${stage}-3d`);
  await test.info().attach(`${stage}-actual-draws`, {
    body: Buffer.from(JSON.stringify(await drawing(), null, 2)),
    contentType: 'application/json',
  });
  await graph.getByRole('button', { name: 'Close Growth graph', exact: true }).click();
}

test('Growth graph colors, alpha, type and zero motion travel in a Mood to a clean Garden and restart', async () => {
  test.setTimeout(240_000);
  const first = await launchApp({ ai: false });
  const archive = test.info().outputPath('graph-identity.cruxmood');
  try {
    await enterGarden(first.page);
    await first.app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.setContentSize(1400, 900),
    );
    const mood = await showPane(first.page, 'Mood');
    await openFullThemeBuilder(first.page);
    await mood
      .getByRole('navigation', { name: 'Token groups' })
      .getByRole('button', { name: 'Graphs', exact: true })
      .click();
    for (const [key, value] of Object.entries(overrides)) await editToken(mood, key, value);
    await mood.getByRole('button', { name: 'Moods', exact: true }).click();
    await mood.getByRole('button', { name: 'Save current as Mood', exact: true }).click();
    await mood.getByRole('textbox', { name: 'Mood name', exact: true }).fill('Graph identity');
    await mood.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(
      mood.getByRole('button', { name: 'Apply Graph identity', exact: true }),
    ).toBeVisible();
    await first.app.evaluate(({ session }, path) => {
      const listener = (_event: Event, item: DownloadItem) => {
        if (!item.getFilename().endsWith('.cruxmood')) return;
        session.defaultSession.removeListener('will-download', listener);
        item.setSavePath(path);
      };
      session.defaultSession.on('will-download', listener);
    }, archive);
    await mood.getByRole('button', { name: 'Export Graph identity', exact: true }).click();
    await expect.poll(() => existsSync(archive)).toBe(true);
    await expect
      .poll(async () => {
        try {
          const zip = await JSZip.loadAsync(readFileSync(archive));
          return JSON.parse(await zip.file('package.json')!.async('string')).theme.overrides;
        } catch {
          return null;
        }
      })
      .toMatchObject(overrides);
    await hidePane(first.page, 'Mood');
    await createGraph(first.page);
    await observeDrawing(first.page);
    await assertGraphAppearance(first.page, 'creator');
  } finally {
    await first.app.close();
  }

  let second = await launchApp({ ai: false });
  const dir = second.dir;
  try {
    let page = second.page;
    await enterGarden(page);
    await second.app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.setContentSize(1400, 900),
    );
    await page.getByRole('button', { name: 'Add Crux', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Add Crux', exact: true })
      .locator('input[type=file][accept*=".cruxmood"]')
      .setInputFiles(archive);
    await expect(
      page.getByRole('alertdialog', { name: 'Mood installed', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'OK', exact: true }).click();
    await page.keyboard.press('Escape');
    const mood = await showPane(page, 'Mood');
    await mood.getByRole('button', { name: 'Apply Graph identity', exact: true }).click();
    await expect(mood.getByRole('region', { name: 'Garden Mood', exact: true })).toContainText(
      'wears Graph identity',
    );
    await hidePane(page, 'Mood');
    const main = await createGraph(page);
    await observeDrawing(page);
    await assertGraphAppearance(page, 'recipient');
    await second.app.close();
    second = await launchApp({ dir, ai: false });
    page = second.page;
    await page.getByRole('button', { name: 'Enter', exact: true }).click();
    await expect(page.getByTestId('pane-body-home')).toBeVisible();
    await page.getByRole('button', { name: 'Open Graph colors', exact: true }).click();
    await expect(page.locator('[data-workspace-id]')).toHaveAttribute('data-workspace-id', main);
    await observeDrawing(page);
    await assertGraphAppearance(page, 'restarted');
  } finally {
    await second.app.close();
  }
});

async function openGraph(page: Page) {
  const history = page.getByTestId('pane-body-history');
  if (!(await history.isVisible())) await togglePanel(page, 'Toggle growth');
  await history.getByRole('button', { name: 'Whole Crux · branches & merges' }).click();
  const graph = page.getByRole('dialog', { name: 'Whole Crux Growth', exact: true });
  await graph.getByRole('button', { name: 'Expand checkpoints', exact: true }).click();
  return graph;
}

async function captureGraphView(page: Page, graph: Locator, mode: '2d' | '3d', name: string) {
  const canvas = graph.getByTestId(`growth-canvas-${mode}`).locator('canvas');
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  await expect(graph.getByText('The graph renderer is unavailable.', { exact: false })).toHaveCount(
    0,
  );
  await graph.getByRole('button', { name: 'Fit graph', exact: true }).click();
  await expect.poll(async () => (await capture(page, canvas)).contrasted).toBeGreaterThan(50);
  const path = test.info().outputPath(`${name}.png`);
  await graph.screenshot({ path });
  await test.info().attach(name, { path, contentType: 'image/png' });
}

test('default graph tokens remain readable in Glass Light and Dark, in 2D and 3D', async () => {
  test.setTimeout(150_000);
  const { app, page } = await launchApp({ ai: false });
  try {
    await enterGarden(page);
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.setContentSize(1400, 900),
    );
    await createGraph(page);
    for (const mode of ['Light', 'Dark'] as const) {
      const mood = await showPane(page, 'Mood');
      await mood
        .getByTestId('material-material')
        .getByRole('button', { name: 'Glass', exact: true })
        .click();
      const selected = mood
        .getByTestId('material-mode')
        .getByRole('button', { name: mode, exact: true });
      await selected.click();
      await expect(selected).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${mode.toLowerCase()}\\b`));
      await expect(page.locator('html')).toHaveAttribute('data-surface-style', 'glass');
      await hidePane(page, 'Mood');
      const graph = await openGraph(page);
      await expect(graph.locator('[data-growth-reveal]')).toHaveAttribute(
        'data-growth-reveal',
        'done',
      );
      await captureGraphView(page, graph, '2d', `default-glass-${mode.toLowerCase()}-2d`);
      await graph.getByRole('button', { name: 'Explore in 3D', exact: true }).click();
      await captureGraphView(page, graph, '3d', `default-glass-${mode.toLowerCase()}-3d`);
      const checkpoint = graph.getByRole('button', { name: /^Graph base Main · / });
      await checkpoint.click();
      await expect(checkpoint).toHaveAttribute('aria-pressed', 'true');
      await graph
        .getByLabel('Checkpoint Artifact', { exact: true })
        .selectOption({ label: 'index.html' });
      await expect(graph.getByTestId('growth-inspector').locator('pre')).toContainText(
        '<h1>Graph base</h1>',
      );
      await graph.getByRole('button', { name: 'Close Growth graph', exact: true }).click();
    }
  } finally {
    await app.close();
  }
});

test('OS reduced motion overrides enabled Mood motion while graph selection and Fit remain usable', async () => {
  test.setTimeout(150_000);
  const { app, page } = await launchApp({ ai: false });
  try {
    await enterGarden(page);
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.setContentSize(1400, 900),
    );
    await createGraph(page);
    const mood = await showPane(page, 'Mood');
    await mood
      .getByRole('combobox', { name: 'Motion intensity', exact: true })
      .selectOption('system');
    await openFullThemeBuilder(page);
    await editToken(mood, 'motionScale', '1');
    await editToken(mood, 'motionDurationBase', '900ms');
    await editToken(mood, 'motionDurationSlow', '1500ms');
    await hidePane(page, 'Mood');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(page.locator('html')).toHaveAttribute('data-motion-intensity', 'off');
    expect(
      await page.evaluate(() => ({
        reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
        chosenScale: document.documentElement.style.getPropertyValue('--motion-scale').trim(),
        chosenSlow: document.documentElement.style
          .getPropertyValue('--motion-duration-slow')
          .trim(),
      })),
    ).toEqual({ reduced: true, chosenScale: '1', chosenSlow: '1500ms' });
    await observeDrawing(page);
    const graph = await openGraph(page);
    await expect(graph.locator('[data-growth-reveal]')).toHaveAttribute(
      'data-growth-reveal',
      'done',
    );
    await captureGraphView(page, graph, '2d', 'system-reduced-motion-2d');
    const drawing = await page.evaluate(
      () =>
        (window as unknown as { __growthDrawingEvidence: DrawingEvidence }).__growthDrawingEvidence,
    );
    expect(drawing.text.length).toBeGreaterThan(0);
    expect(
      drawing.text.every(({ alpha }) => alpha === 1),
      'OS reduced motion skips reveal opacity',
    ).toBe(true);
    const checkpoint = graph.getByRole('button', { name: /^Graph branch Side path · / });
    await checkpoint.click();
    await expect(checkpoint).toHaveAttribute('aria-pressed', 'true');
    await graph
      .getByLabel('Checkpoint Artifact', { exact: true })
      .selectOption({ label: 'index.html' });
    await expect(graph.getByTestId('growth-inspector').locator('pre')).toContainText(
      '<h1>Graph branch</h1>',
    );
    await graph.getByRole('button', { name: 'Fit graph', exact: true }).click();
    await expect(checkpoint).toHaveAttribute('aria-pressed', 'true');
    await graph.getByRole('button', { name: 'Explore in 3D', exact: true }).click();
    await captureGraphView(page, graph, '3d', 'system-reduced-motion-3d');
    const main = graph.getByRole('button', { name: /^Graph base Main · / });
    await main.click();
    await expect(main).toHaveAttribute('aria-pressed', 'true');
    await graph
      .getByLabel('Checkpoint Artifact', { exact: true })
      .selectOption({ label: 'index.html' });
    await expect(graph.getByTestId('growth-inspector').locator('pre')).toContainText(
      '<h1>Graph base</h1>',
    );
    await graph.getByRole('button', { name: 'Fit graph', exact: true }).click();
    await expect(main).toHaveAttribute('aria-pressed', 'true');
    await graph.getByRole('button', { name: 'Close Growth graph', exact: true }).click();
  } finally {
    await app.close();
  }
});
