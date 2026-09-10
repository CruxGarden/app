import { describe, it, expect, beforeEach } from 'vitest';
import { initServices, getServices } from './index';
import { applyTemplateToCrux } from './crux-create';

describe('applyTemplateToCrux', () => {
  beforeEach(async () => {
    await initServices('local');
  });

  it('writes the template files, stamps the Builder inputs and the template id', async () => {
    const { crux: cruxService, artifact } = getServices();
    const crux = await cruxService.create({
      title: 'Blog',
      type: 'workspace',
      meta: { settings: {} },
    });
    const result = await applyTemplateToCrux(crux, 'astro-blog', 'webapp');

    const paths = (await artifact.findByResource('crux', crux.id)).map((a) => a.meta?.path);
    expect(paths).toContain('astro.config.mjs');
    expect(paths).toContain('src/pages/posts/hello-world.md');
    expect(result.crux.meta?.template).toBe('astro-blog');
    expect(result.crux.meta?.contentModel).toBeTruthy();
    expect(result.messages?.[0]?.role).toBe('assistant');
    expect(result.layout).toBeTruthy();
    // No Project Folder in the test environment → no AGENTS.md (Desktop Mode writes it)
    expect(paths).not.toContain('AGENTS.md');
  });

  it('an unknown template only sets the kind', async () => {
    const { crux: cruxService } = getServices();
    const crux = await cruxService.create({ title: 'X', type: 'workspace' });
    const result = await applyTemplateToCrux(crux, 'nope', 'page');
    expect(result.crux.kind).toBe('page');
    expect(result.messages).toBeNull();
  });

  it('creates the offline game with real font bytes and no build requirement', async () => {
    const { crux: cruxService, artifact } = getServices();
    const crux = await cruxService.create({ title: 'One Big Sky', type: 'workspace' });
    const result = await applyTemplateToCrux(crux, 'onebigsky', 'webapp');
    const files = await artifact.findByResource('crux', crux.id);
    const paths = files.map((file) => file.meta?.path);
    expect(paths).toEqual(expect.arrayContaining(['index.html', 'game.js', 'ui/input.js', 'assets/fonts/OFL.txt']));
    expect(paths).not.toContain('package.json');
    expect(paths).not.toContain('server.cjs');
    expect(result.crux.meta?.settings).toMatchObject({ entryFile: 'index.html' });
    for (const name of ['Silkscreen-Regular', 'Silkscreen-Bold']) {
      const file = files.find((file) => file.meta?.path === `assets/fonts/${name}.ttf`)!;
      const bytes = new Uint8Array(await (await artifact.downloadBlob(file.id)).arrayBuffer());
      const { readFileSync } = await import('node:fs');
      const original = readFileSync(new URL(`../../onebigsky-crux/assets/fonts/${name}.ttf`, import.meta.url));
      expect(bytes).toEqual(new Uint8Array(original));
    }
  });
});
