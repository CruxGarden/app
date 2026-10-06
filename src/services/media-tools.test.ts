import { describe, it, expect } from 'vitest';
import manifest from '../../media-crux/crux-tool.json';
import { parseManifest } from './crux-tools/manifest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { planFfmpegRun } from '../../electron/src/ffmpeg-command';
import { planMagickRun } from '../../electron/src/magick-command';

/**
 * Media Tools (MAKING-THE-AD-PARITY gap 13): the bench that carries ffmpeg
 * and ImageMagick. The binaries are the shell's (platform-aware) and the
 * journey proves a real conversion; here we hold the manifest, the recipes
 * and the page's contract with the host.
 */
describe('Media Tools', () => {
  it('admits every built-in media recipe and its fallback through the desktop planners', async () => {
    const { default: files } = await import('@/templates/media-app');
    const app = files.files.find((file) => file.path === 'app.js')!.content;
    // Evaluate only this repository's constant recipe declarations, not the
    // browser application or any user-provided script.
    const recipes = runInNewContext(
      app.slice(app.indexOf('var VIDEO'), app.indexOf('function ext(')) + '\nBUILT_IN',
    ) as {
      id: string;
      tool: string;
      accepts: string[];
      args: string[];
      out: string;
      alt?: { tool: string; args: string[] };
    }[];
    const folder = mkdtempSync(join(tmpdir(), 'crux-bench-recipes-'));
    try {
      for (const recipe of recipes) {
        const input = `source${recipe.accepts[0]}`;
        writeFileSync(join(folder, input), 'fixture');
        const output = recipe.out.replace('{name}', 'source');
        for (const variant of [recipe, recipe.alt].filter((value) => !!value)) {
          if (variant.tool !== 'ffmpeg' && variant.tool !== 'magick') continue;
          const args = variant.args.map((arg) =>
            arg.replace('{in}', input).replace('{out}', output),
          );
          const plan = variant.tool === 'ffmpeg' ? planFfmpegRun : planMagickRun;
          expect.soft(() => plan(folder, args), `${recipe.id}: ${variant.tool}`).not.toThrow();
        }
      }
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it('is a valid Crux Tool manifest, bundled, and claims no drop routes', () => {
    const m = parseManifest(manifest);
    expect(m.id).toBe('media-app');
    expect(m.app).toBe('media');
    expect(m.bundled).toBe(true);
    expect(m.desktopOnly).toBe(true);
    expect(m.entryFile).toBe('index.html');
    // The editors own those extensions — a dropped video belongs to OpenCut,
    // a dropped note to Notes. The bench converts what is already in its Crux,
    // and Artifacts offers conversion everywhere else.
    expect(m.routes).toEqual([]);
    // The collaborator is told which tools it has and that one may be absent.
    for (const word of ['run_ffmpeg', 'run_magick', 'run_pandoc', 'probe_media', 'may be absent'])
      expect(m.context).toContain(word);
  });

  it('ships the page, its bridge and the log, and nothing that needs a network', async () => {
    const { default: files } = await import('@/templates/media-app');
    const paths = files.files.map((f) => f.path);
    for (const p of [
      'index.html',
      'style.css',
      'app.js',
      'garden/bridge.js',
      'README.md',
      'UPSTREAM.md',
      'log.md',
    ])
      expect(paths).toContain(p);
    const page = files.files.find((f) => f.path === 'index.html')!.content;
    expect(page).toContain('garden/bridge.js');
    expect(page).not.toMatch(/https?:\/\//);
  });

  it('every built-in recipe names its tool, what it accepts, and where the output goes', async () => {
    const { default: files } = await import('@/templates/media-app');
    const app = files.files.find((f) => f.path === 'app.js')!.content;
    const block = app.slice(app.indexOf('var BUILT_IN'), app.indexOf('function ext('));
    const ids = [...block.matchAll(/id: '([a-z0-9-]+)'/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThanOrEqual(20);
    expect(new Set(ids).size).toBe(ids.length);
    // Each recipe writes into exports/ and uses the placeholders the host fills.
    const outs = [...block.matchAll(/out: '([^']+)'/g)].map((m) => m[1]!);
    expect(outs.length).toBe(ids.length);
    for (const out of outs) expect(out.startsWith('exports/')).toBe(true);
    // `pdf` is the app itself: Pandoc writes a page and Crux Garden prints it,
    // or Typst typesets it when the machine has Typst.
    for (const tool of [...block.matchAll(/tool: '([a-z]+)'/g)].map((m) => m[1]))
      expect(['ffmpeg', 'magick', 'pandoc', 'pdf']).toContain(tool);
    // ffmpeg overwrites deliberately; a recipe that forgets -y stalls on a prompt.
    for (const args of [...block.matchAll(/tool: 'ffmpeg'[^}]*args: \[([^\]]+)\]/g)].map(
      (m) => m[1]!,
    ))
      expect(args).toContain("'-y'");
  });

  it('the bridge talks to the host and never reaches for a binary itself', async () => {
    const { default: files } = await import('@/templates/media-app');
    const bridge = files.files.find((f) => f.path === 'garden/bridge.js')!.content;
    for (const call of [
      'crux:media:files',
      'crux:media:run',
      'crux:media:probe',
      'crux:media:tools',
    ])
      expect(bridge).toContain(call);
    expect(bridge).not.toMatch(/require\(|child_process|\bfetch\(/);
  });
});
