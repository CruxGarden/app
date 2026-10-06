import { test, expect, type Page } from '@playwright/test';
import { launchApp } from './launch';
import { createCrux, enterGarden } from './multi-crux-helpers';
import { openPanel, togglePanel } from './panel-helpers';

type Uniforms = Record<string, number[]>;
type MaterialDraw = {
  resolution: number[];
  view: number[];
  scale: number;
  width: number;
  height: number;
};
type ObservedWindow = Window & {
  __plasmaUniforms: Uniforms;
  __plasmaDraw?: MaterialDraw;
};

/** Observe the shipping renderer's actual draw inputs; never replace the material. */
async function observeMaterial(page: Page) {
  await page.addInitScript(() => {
    const uniforms: Uniforms = {};
    Object.assign(window, { __plasmaUniforms: uniforms });
    const p = WebGL2RenderingContext.prototype;
    const names = new WeakMap<WebGLUniformLocation, string>();
    const locate = p.getUniformLocation;
    p.getUniformLocation = function (program, name) {
      const result = locate.call(this, program, name);
      if (result) names.set(result, name);
      return result;
    };
    for (const key of ['uniform4fv', 'uniform1fv'] as const) {
      const original = p[key];
      p[key] = function (location, data, ...rest) {
        const name = location && names.get(location);
        if (
          name &&
          ['uP', 'uSolo', 'uF'].includes(name) &&
          (this.canvas as HTMLCanvasElement).classList.contains('plasma-ground')
        )
          uniforms[name] = Array.from(data as Float32Array);
        original.call(this, location, data, ...rest);
      };
    }
    const integer = p.uniform1i;
    p.uniform1i = function (location, value) {
      if (
        location &&
        names.get(location) === 'uCount' &&
        (this.canvas as HTMLCanvasElement).classList.contains('plasma-ground')
      )
        uniforms.uCount = [value];
      integer.call(this, location, value);
    };
    const scalar = p.uniform1f;
    p.uniform1f = function (location, value) {
      if (
        location &&
        names.get(location) === 'uScale' &&
        (this.canvas as HTMLCanvasElement).classList.contains('plasma-ground')
      )
        uniforms.uScale = [value];
      scalar.call(this, location, value);
    };
    const pair = p.uniform2f;
    p.uniform2f = function (location, x, y) {
      if (
        location &&
        names.get(location) === 'uRes' &&
        (this.canvas as HTMLCanvasElement).classList.contains('plasma-ground')
      )
        uniforms.uRes = [x, y];
      pair.call(this, location, x, y);
    };
    const vector = p.uniform4f;
    p.uniform4f = function (location, x, y, z, w) {
      if (
        location &&
        names.get(location) === 'uView' &&
        (this.canvas as HTMLCanvasElement).classList.contains('plasma-ground')
      )
        uniforms.uView = [x, y, z, w];
      vector.call(this, location, x, y, z, w);
    };
    const targets = new WeakMap<WebGL2RenderingContext, WebGLFramebuffer | null>();
    const bind = p.bindFramebuffer;
    p.bindFramebuffer = function (target, framebuffer) {
      bind.call(this, target, framebuffer);
      if (target === this.FRAMEBUFFER || target === this.DRAW_FRAMEBUFFER)
        targets.set(this, framebuffer);
    };
    const draw = p.drawArrays;
    p.drawArrays = function (mode, first, count) {
      draw.call(this, mode, first, count);
      const canvas = this.canvas as HTMLCanvasElement;
      if (
        canvas.classList.contains('plasma-ground') &&
        targets.get(this) === null &&
        uniforms.uRes &&
        uniforms.uView &&
        uniforms.uScale
      )
        // Record a completed composite draw, not an intermediate mask/blur pass.
        (window as unknown as ObservedWindow).__plasmaDraw = {
          resolution: [...uniforms.uRes],
          view: [...uniforms.uView],
          scale: uniforms.uScale[0]!,
          width: canvas.width,
          height: canvas.height,
        };
    };
  });
  await page.reload();
}

async function expectMaterialViewport(page: Page, width: number, height: number) {
  await expect
    .poll(() =>
      page.evaluate(
        ({ width, height }) => {
          const draw = (window as unknown as ObservedWindow).__plasmaDraw;
          const canvas = document.querySelector<HTMLCanvasElement>('canvas.plasma-ground');
          if (!draw || !canvas) return false;
          const bounds = canvas.getBoundingClientRect();
          // Texture allocation settles after resize. Correct DOM rectangles alone
          // can still be drawn into the old viewport and compressed by CSS sizing.
          return (
            innerWidth === width &&
            innerHeight === height &&
            draw.resolution[0] === width &&
            draw.resolution[1] === height &&
            draw.view[0] === 0 &&
            draw.view[1] === 0 &&
            draw.view[2] === width &&
            draw.view[3] === height &&
            draw.scale > 0 &&
            Math.abs(draw.width - width * draw.scale) <= 1 &&
            Math.abs(draw.height - height * draw.scale) <= 1 &&
            canvas.width === draw.width &&
            canvas.height === draw.height &&
            Math.abs(bounds.x) < 1 &&
            Math.abs(bounds.y) < 1 &&
            Math.abs(bounds.width - width) < 1 &&
            Math.abs(bounds.height - height) < 1
          );
        },
        { width, height },
      ),
    )
    .toBe(true);
}

async function expectSeparatePanels(page: Page, expanded = false) {
  await expect
    .poll(() =>
      page.evaluate((expanded) => {
        const uniforms = (window as unknown as ObservedWindow).__plasmaUniforms;
        if (!uniforms.uCount || !uniforms.uP || !uniforms.uSolo || !uniforms.uF) return false;
        const count = uniforms.uCount[0]!;
        const visible = [...document.querySelectorAll('.mosaic-window')];
        if (expanded)
          visible.push(document.querySelector('[data-testid="workspace-status"] .bg-panel')!);
        if (count !== visible.length || visible.length !== (expanded ? 4 : 3)) return false;
        // Every drawn rectangle belongs to visible content and respects fuse:false.
        // A hidden disclosure used to leave a fourth rectangle spanning all headers.
        return visible.every((el) => {
          const r = el.getBoundingClientRect();
          for (let i = 0; i < count; i++) {
            const [cx, cy, hw, hh] = uniforms.uP.slice(i * 4, i * 4 + 4);
            if (
              Math.abs(cx - r.x - r.width / 2) < 1 &&
              Math.abs(cy - r.y - r.height / 2) < 1 &&
              Math.abs(hw - r.width / 2) < 1 &&
              Math.abs(hh - r.height / 2) < 1 &&
              uniforms.uSolo[i] === 1 &&
              uniforms.uF[i] > 0.99
            )
              return true;
          }
          return false;
        });
      }, expanded),
    )
    .toBe(true);
}

test('Plasma keeps adjacent workspace panels separate through disclosure and resize', async () => {
  const { app, page } = await launchApp({ ai: false });
  try {
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.setContentSize(1400, 900),
    );
    await observeMaterial(page);
    await enterGarden(page);
    await createCrux(page, 'Separate panels');
    await openPanel(page, 'tasks', 'Toggle tasks');
    await openPanel(page, 'artifacts', 'Toggle artifacts');
    await openPanel(page, 'workshop', 'Toggle workshop');
    if (await page.getByTestId('pane-body-collaboration').count())
      await togglePanel(page, 'Toggle collaboration');
    await expect(page.locator('html')).toHaveAttribute('data-surface-style', 'plasma');
    await expectSeparatePanels(page);
    await expectMaterialViewport(page, 1400, 900);
    await page.screenshot({ path: test.info().outputPath('panels-separated.png') });

    const status = page.getByTestId('workspace-status');
    for (const reducedMotion of ['no-preference', 'reduce'] as const) {
      await page.emulateMedia({ reducedMotion });
      await status.locator('summary').click();
      await expect(
        status.getByRole('button', { name: 'Save editor changes', exact: true }),
      ).toBeVisible();
      await expectSeparatePanels(page, true);
      await status.locator('summary').click();
      await expectSeparatePanels(page);
    }
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.setContentSize(1100, 760),
    );
    await expectSeparatePanels(page);
    await expectMaterialViewport(page, 1100, 760);
    await page.screenshot({ path: test.info().outputPath('panels-resized.png') });
  } catch (error) {
    console.log(
      'Plasma draw evidence',
      JSON.stringify(
        await page.evaluate(() => ({
          uniforms: (window as unknown as ObservedWindow).__plasmaUniforms,
          draw: (window as unknown as ObservedWindow).__plasmaDraw,
          viewport: [innerWidth, innerHeight],
          surfaces: [
            ...document.querySelectorAll(
              '.mosaic-window,[data-testid="workspace-status"] .bg-panel',
            ),
          ].map((el) => ({
            class: el.className,
            visible: el.checkVisibility({ visibilityProperty: true }),
            bounds: el.getBoundingClientRect().toJSON(),
          })),
        })),
        null,
        2,
      ),
    );
    throw error;
  } finally {
    await app.close();
  }
});
