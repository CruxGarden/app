import { describe, it, expect } from 'vitest';
import { applyTemplateMeta, loadTemplate, type TemplateDefinition } from './index';

const TEMPLATE_IDS = ['astro-homepage', 'astro-blog', 'astro-feed', 'astro-media'] as const;

describe('applyTemplateMeta', () => {
  const def: TemplateDefinition = {
    files: [],
    context: 'This is an Astro project.',
    greeting: 'Your site is ready.',
    contentModel: {
      collections: [
        {
          name: 'Posts',
          singular: 'Post',
          glob: 'src/pages/posts/*.md',
          fields: [{ key: 'title', label: 'Title', type: 'text' }],
          new: { pathTemplate: 'src/pages/posts/{slug}.md', frontmatter: { title: '{title}' } },
        },
      ],
      settings: {
        path: 'src/config.json',
        fields: [{ key: 'name', label: 'Name', type: 'text' }],
      },
    },
  };

  // Regression: this ran behind an `if (meta.settings.systemPrompt)` gate that
  // new cruxes never satisfy, so every template shipped without its Builder,
  // config form, greeting, and AI context.
  it('stamps the Builder inputs on a fresh crux (no pre-existing systemPrompt)', () => {
    const meta = applyTemplateMeta({ settings: { model: 'claude-sonnet-5' } }, def);

    expect(meta.contentModel).toEqual(def.contentModel);
    expect((meta.formSchema as { fields: unknown[] }).fields).toEqual(
      def.contentModel!.settings!.fields,
    );
    expect(meta.messages).toEqual([{ role: 'assistant', content: 'Your site is ready.' }]);
    expect((meta.settings as { systemPrompt: string }).systemPrompt).toBe(
      'CONTEXT: This is an Astro project.',
    );
    // Untouched settings survive
    expect((meta.settings as { model: string }).model).toBe('claude-sonnet-5');
  });

  it('appends context to an existing system prompt instead of replacing it', () => {
    const meta = applyTemplateMeta({ settings: { systemPrompt: 'Be terse.' } }, def);
    expect((meta.settings as { systemPrompt: string }).systemPrompt).toBe(
      'Be terse.\n\nCONTEXT: This is an Astro project.',
    );
  });

  it('preserves unrelated meta and tolerates empty input', () => {
    const meta = applyTemplateMeta({ summary: { crux: 'keep me' } }, def);
    expect(meta.summary).toEqual({ crux: 'keep me' });
    expect(applyTemplateMeta(undefined, def).contentModel).toEqual(def.contentModel);
  });

  it('an explicit schema wins over the content model settings', () => {
    const schema = { fields: [{ key: 'custom', label: 'Custom', type: 'text' as const }] };
    const meta = applyTemplateMeta({}, { ...def, schema });
    expect(meta.formSchema).toEqual(schema);
  });

  it('leaves messages alone when the template has no greeting', () => {
    const meta = applyTemplateMeta(
      { messages: [{ role: 'assistant', content: 'hi' }] },
      {
        ...def,
        greeting: '',
      },
    );
    expect(meta.messages).toEqual([{ role: 'assistant', content: 'hi' }]);
  });
});

describe('toolchain-only templates', () => {
  it('astro-empty ships the Astro toolchain files and no content model', async () => {
    const def = (await loadTemplate('astro-empty'))!;
    const paths = def.files.map((f) => f.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        'package.json',
        'astro.config.mjs',
        '.cruxignore',
        'src/pages/index.astro',
      ]),
    );
    expect(def.contentModel).toBeUndefined();
    expect(def.greeting).toMatch(/empty Astro project/i);
  });
});

describe('shipped template definitions', () => {
  it.each(TEMPLATE_IDS)('%s: settings form fields exist in its config file', async (id) => {
    const def = (await loadTemplate(id))!;
    expect(def).toBeTruthy();
    const settings = def.contentModel?.settings;
    expect(settings).toBeTruthy();

    const configFile = def.files.find((f) => f.path === settings!.path);
    expect(configFile, `${settings!.path} must exist in the template files`).toBeTruthy();

    const config = JSON.parse(configFile!.content) as Record<string, unknown>;
    for (const field of settings!.fields) {
      expect(Object.keys(config), `${id}: config is missing "${field.key}"`).toContain(field.key);
    }
  });

  it.each(TEMPLATE_IDS)('%s: new-item recipe matches the collection fields', async (id) => {
    const def = (await loadTemplate(id))!;
    for (const collection of def.contentModel?.collections ?? []) {
      const recipeKeys = Object.keys(collection.new.frontmatter);
      for (const field of collection.fields) {
        expect(recipeKeys, `${id}/${collection.name}: recipe lacks "${field.key}"`).toContain(
          field.key,
        );
      }
      // Items land where the glob looks for them
      const globDir = collection.glob.slice(0, collection.glob.lastIndexOf('/'));
      expect(collection.new.pathTemplate.startsWith(globDir + '/')).toBe(true);
    }
  });

  it.each(TEMPLATE_IDS)('%s: sample posts carry the recipe frontmatter keys', async (id) => {
    const def = (await loadTemplate(id))!;
    for (const collection of def.contentModel?.collections ?? []) {
      const dir = collection.glob.slice(0, collection.glob.lastIndexOf('/'));
      const samples = def.files.filter(
        (f) => f.path.startsWith(dir + '/') && f.path.endsWith('.md'),
      );
      expect(samples.length, `${id}: expected at least one sample item`).toBeGreaterThan(0);
      for (const sample of samples) {
        for (const key of Object.keys(collection.new.frontmatter)) {
          expect(sample.content, `${sample.path} missing "${key}:"`).toContain(`${key}:`);
        }
      }
    }
  });

  it.each(TEMPLATE_IDS)('%s: ignores build machinery and ships an astro config', async (id) => {
    const def = (await loadTemplate(id))!;
    const paths = def.files.map((f) => f.path);
    expect(paths).toContain('astro.config.mjs');
    expect(paths).toContain('package.json');

    const cruxignore = def.files.find((f) => f.path === '.cruxignore');
    expect(cruxignore).toBeTruthy();
    for (const dir of ['node_modules/', 'dist/', '.astro/']) {
      expect(cruxignore!.content).toContain(dir);
    }
  });
});

describe('content model consistency', () => {
  // `layout` is Astro plumbing the recipe writes but nobody edits — every other
  // recipe key must be a declared field, or the item form would hide it.
  const STRUCTURAL_KEYS = new Set(['layout']);

  it.each(TEMPLATE_IDS)('%s: recipe frontmatter keys are declared fields', async (id) => {
    const def = (await loadTemplate(id))!;
    for (const collection of def.contentModel?.collections ?? []) {
      const fieldKeys = collection.fields.map((f) => f.key);
      for (const key of Object.keys(collection.new.frontmatter)) {
        if (STRUCTURAL_KEYS.has(key)) continue;
        expect(fieldKeys, `${id}/${collection.name}: recipe key "${key}" is not a field`).toContain(
          key,
        );
      }
    }
  });

  it.each(TEMPLATE_IDS)('%s: builder actions point at existing collections', async (id) => {
    const def = (await loadTemplate(id))!;
    const names = (def.contentModel?.collections ?? []).map((c) => c.name);
    for (const action of def.contentModel?.actions ?? []) {
      if ('collection' in action.do) {
        expect(names, `${id}: action "${action.label}" targets an unknown collection`).toContain(
          action.do.collection,
        );
      }
      if (action.do.type === 'open-file') {
        const path = action.do.path;
        expect(
          def.files.some((f) => f.path === path),
          `${id}: action "${action.label}" opens a file the template does not ship (${path})`,
        ).toBe(true);
      }
    }
  });

  it('astro-media ships an empty folder marker, not prose, for public/media', async () => {
    const def = (await loadTemplate('astro-media'))!;
    const keep = def.files.find((f) => f.path === 'public/media/.gitkeep');
    expect(keep?.content).toBe('');
  });
});

describe('applyTemplateMeta template lineage', () => {
  it('stamps meta.template with the template id when given', async () => {
    const def = (await loadTemplate('astro-blog'))!;
    expect(applyTemplateMeta({}, def, 'astro-blog').template).toBe('astro-blog');
    expect(applyTemplateMeta({}, def).template).toBeUndefined();
  });
});
