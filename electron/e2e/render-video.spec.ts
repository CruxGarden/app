import { test, expect } from '@playwright/test';
import { existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, createCrux, addArtifact } from './multi-crux-helpers';

/**
 * Step 5 (MAKING-IT-POSSIBLE-STEPS): a page that is a timeline becomes a video
 * from the Workshop's preview bar — frames from the shell's capture window,
 * the bundled ffmpeg encoding them — and a screenshot lands beside it. No
 * shell, no click per command, the same calls the collaborator makes.
 */
const PAGE = `<!doctype html><html><body style="margin:0;background:#071a12;color:#e9f3ec;font:48px Georgia;display:grid;place-items:center;height:100vh">
<div id="t">What are you doing in your Garden?</div>
<script>
const lines=['I\\'m working.','I\\'m vibing.','Made this ad.'];let i=0;
function next(){ if(i<lines.length){ document.getElementById('t').textContent=lines[i++]; setTimeout(next,600);} else document.body.dataset.done='1'; }
if(new URLSearchParams(location.search).get('auto')==='1') setTimeout(next,600);
</script></body></html>`;

function cruxFolder(dir: string): string {
  const garden = join(dir, 'garden');
  const [first] = readdirSync(garden);
  if (!first) throw new Error('no crux folder');
  return join(garden, first);
}

test('a timeline page becomes a video and a screenshot from the preview bar', async () => {
  test.setTimeout(240_000);
  const { app, page, dir } = await launchApp();
  page.on('console', (m) => {
    if (m.text().includes('[render]')) console.log('APP', m.text());
  });
  try {
    await enterGarden(page);
    await createCrux(page, 'Spot');
    await addArtifact(page, 'index.html');
    const folder = cruxFolder(dir);
    writeFileSync(join(folder, 'index.html'), PAGE);
    if (
      !(await page
        .getByTestId('pane-body-workshop')
        .isVisible()
        .catch(() => false))
    )
      await page.getByRole('button', { name: 'Toggle workshop' }).click();
    await page.getByRole('tree').getByText('index.html', { exact: true }).click();
    // The preview bar lives on the Clean view of the Workshop.
    await page
      .getByTestId('pane-body-workshop')
      .getByRole('button', { name: 'Clean', exact: true })
      .click();
    const shot = page.getByTestId('preview-screenshot');
    await expect(shot).toBeVisible({ timeout: 60_000 });
    await shot.click();
    await expect
      .poll(() => existsSync(join(folder, 'exports', 'preview.jpg')), { timeout: 60_000 })
      .toBe(true);

    await page.getByTestId('preview-export-video').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Export' }).click();
    const out = join(folder, 'exports', 'render.mp4');
    await expect
      .poll(() => existsSync(out) && statSync(out).size > 2000, { timeout: 120_000 })
      .toBe(true);
    const frames = readdirSync(join(folder, 'exports', 'render-frames')).filter((f) =>
      f.endsWith('.png'),
    );
    // ~2.4 s at 30 fps, stopped by the page's own done flag rather than the cap
    console.log('frames:', frames.length);
    expect(frames.length).toBeGreaterThan(40);
    expect(frames.length).toBeLessThan(300);
    await page.screenshot({ path: 'e2e/.results/render-video.png' });
  } finally {
    await app.close();
  }
});
