import { describe, it, expect } from 'vitest';
import { loadTemplate, applyTemplateMeta } from './index';

describe('Documentation Crux package', () => {
  it('ships editable source, provenance and offline fonts, without generated output or a fake conversation', async () => {
    const template = (await loadTemplate('documentation'))!;
    expect(template.greeting).toBe('');
    expect(
      applyTemplateMeta(
        { messages: [{ role: 'assistant', content: 'Default greeting' }] },
        template,
      ).messages,
    ).toEqual([]);
    expect(template.contentModel?.collections.map((c) => c.name)).toEqual(['Pages', 'Journal']);
    const paths = template.files.map((f) => f.path);
    expect(paths).toContain('astro.config.mjs');
    expect(paths).toContain('package-lock.json');
    expect(paths).toContain('LICENSE');
    expect(paths).toContain('UPSTREAM.md');
    expect(paths).toContain('public/fonts/Inter-OFL.txt');
    expect(paths).toContain('src/content/docs/start/first-home.md');
    expect(paths.some((p) => /(^|\/)(node_modules|dist|\.astro)\//.test(p))).toBe(false);
    expect(new Set(paths).size).toBe(paths.length);
    expect(template.files.filter((file) => file.path.endsWith('.woff2'))).toHaveLength(2);
    for (const file of template.files.filter((file) => /\.(woff2|png|jpg|webp)$/.test(file.path)))
      expect(file.encoding, file.path).toBe('asset-url');
  });
});
