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
});
