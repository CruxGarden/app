import { describe, it, expect } from 'vitest';
import {
  applyTemplateMeta,
  loadTemplate,
  FIVE_WS_NAME,
  FIVE_WS_SITE_TITLE,
  FIVE_WS_TEMPLATE_ID,
  type TemplateDefinition,
} from './index';
import { parseShelf } from '@/game/shelf';
import { parseTranscriptMarkdown } from '@/game/transcript';

const TEMPLATE_IDS = [
  'astro-homepage',
  'astro-blog',
  'astro-feed',
  'astro-media',
  FIVE_WS_TEMPLATE_ID,
] as const;

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

describe('5ws (ADR 0016)', () => {
  it('ships a parsable Shelf at meta.game.shelfPath, a sample round and the three pages', async () => {
    const def = (await loadTemplate(FIVE_WS_TEMPLATE_ID))!;
    const meta = applyTemplateMeta({}, def, FIVE_WS_TEMPLATE_ID);
    const game = meta.game as { shelfPath: string };
    expect(game.shelfPath).toBe('shelf.json');
    expect(meta.skills).toEqual(['5ws']);

    const shelfFile = def.files.find((f) => f.path === game.shelfPath)!;
    const shelf = parseShelf(shelfFile.content);
    expect(shelf.id).toBe('history');
    expect(shelf.question).toBe('Who am I?');
    expect(shelf.entries.length).toBeGreaterThanOrEqual(40);

    const paths = def.files.map((f) => f.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        'src/pages/index.astro',
        'src/pages/rounds/[slug].astro',
        'src/pages/about.astro',
        'src/layouts/Base.astro',
        'shelves/things.json',
      ]),
    );
    // Exactly one sample round, flagged so the site can hide it once real rounds exist
    const rounds = def.files.filter((f) => f.path.startsWith('rounds/'));
    expect(rounds).toHaveLength(1);
    expect(rounds[0]!.content).toContain('sample: true');
    // …and it is an instance of the transcript format the round engine writes
    const transcript = parseTranscriptMarkdown(rounds[0]!.content);
    expect(transcript.entry.name).toBe('Hypatia');
    expect(transcript.outcome).toBe('won');
    expect(transcript.guesses.map((g) => g.correct)).toEqual([false, false, true]);
    expect(transcript.reveal?.misses).toHaveLength(2);
    expect(transcript.exchanges).toHaveLength(transcript.questions);
  });

  it('the pages take their heading from the Shelf question; the product name is only the <title> tagline', async () => {
    const def = (await loadTemplate(FIVE_WS_TEMPLATE_ID))!;
    const pages = def.files.filter((f) => f.path.endsWith('.astro') || f.path.endsWith('.css'));
    for (const page of pages) {
      const body = page.content.replace(FIVE_WS_SITE_TITLE, '');
      expect(body, page.path).not.toContain(FIVE_WS_NAME);
      expect(body, page.path).not.toMatch(/Who Am I\?/);
    }
    const base = def.files.find((f) => f.path === 'src/layouts/Base.astro')!;
    expect(base.content).toContain(JSON.stringify(FIVE_WS_SITE_TITLE));
    expect(FIVE_WS_SITE_TITLE).toBe('5Ws — Ten Questions. Five minutes. Good luck.');
    for (const page of def.files.filter((f) => f.path.startsWith('src/pages/'))) {
      expect(page.content, page.path).toContain('questionFor(shelf)');
      // A transcript page is headed by its round; /play by the voice itself (the island)
      if (page.path !== 'src/pages/rounds/[slug].astro' && page.path !== 'src/pages/play.astro') {
        expect(page.content, page.path).toContain('<h1 class="question">{question}</h1>');
      }
    }
    // Serif for the voice, sans for the interface
    const css = def.files.find((f) => f.path === 'src/styles/global.css')!.content;
    expect(css).toMatch(/--serif:[^;]*serif;/);
    expect(css).toMatch(/--sans:[^;]*sans-serif;/);
    expect(css).toContain('.transcript h3');
    expect((css.match(/@keyframes/g) ?? []).length).toBeLessThanOrEqual(1);
  });

  it('declares the Rounds collection, the Shelf as settings, and the two Builder actions', async () => {
    const def = (await loadTemplate(FIVE_WS_TEMPLATE_ID))!;
    const model = def.contentModel!;
    expect(model.collections.map((c) => c.name)).toEqual(['Rounds']);
    expect(model.collections[0]!.glob).toBe('rounds/*.md');
    expect(model.settings!.path).toBe('shelf.json');
    expect(model.actions!.map((a) => a.do)).toEqual([
      { type: 'add-shelf-entry', path: 'shelf.json' },
      { type: 'open-round' },
    ]);
    expect(def.greeting).toContain(FIVE_WS_NAME);
  });

  it('/play is a React island that runs the round in the browser; the site carries the engine and the AI SDK', async () => {
    const def = (await loadTemplate(FIVE_WS_TEMPLATE_ID))!;
    const play = def.files.find((f) => f.path === 'src/pages/play.astro')!.content;
    expect(play).toContain('<Round client:only="react"');
    expect(play).toContain('<Base title={question} bare>');
    const pkg = JSON.parse(def.files.find((f) => f.path === 'package.json')!.content) as {
      dependencies: Record<string, string>;
    };
    for (const dep of [
      '@astrojs/react',
      'react',
      'react-dom',
      'ai',
      '@ai-sdk/anthropic',
      '@ai-sdk/openai',
      '@ai-sdk/google',
    ]) {
      expect(pkg.dependencies[dep], dep).toBeTruthy();
    }
    expect(def.files.find((f) => f.path === 'astro.config.mjs')!.content).toContain('react()');
    // The engine rides along verbatim (5ws-site.test.ts checks byte equality)
    const paths = def.files.map((f) => f.path);
    for (const m of ['hidden', 'shelf', 'round', 'prompts', 'transcript', 'leaks']) {
      expect(paths).toContain(`src/game/${m}.ts`);
    }
    expect(paths).not.toContain('src/game/harness.ts');
    // Every page links to the game; nothing tells the visitor to open the app to play
    for (const f of def.files.filter((x) => x.path.endsWith('.astro'))) {
      expect(f.content, f.path).not.toMatch(/Open this crux in Crux Garden/);
    }
    const island = def.files.find((f) => f.path === 'src/components/Round.tsx')!.content;
    expect(island).toContain('Connect your AI');
    expect(island).toContain('searchUrlFor'); // Search opens a tab; the clock keeps running
    expect(def.files.find((f) => f.path === 'src/lib/format.ts')!.content).toContain(
      "'https://duckduckgo.com/?q='",
    );
  });

  it('the index reads the daily board from the crux’s own store and never writes it', async () => {
    const def = (await loadTemplate(FIVE_WS_TEMPLATE_ID))!;
    const index = def.files.find((f) => f.path === 'src/pages/index.astro')!.content;
    expect(index).toContain('id="today"');
    expect(index).toContain("import { storeFor } from '../lib/store'");
    expect(index).toContain('readBoard(store, utcDayAgo(0))');
    expect(index).toContain('readBoard(store, utcDayAgo(1))');
    expect(index).toContain('No one has played');
    expect(index).not.toMatch(/\.set\(/);
    expect(index).not.toMatch(/fetch\(/);
    expect(index).not.toContain('/leaderboard/'); // the removed API endpoint
    // The board and the played record are store keys; the page carries the store client
    const paths = def.files.map((f) => f.path);
    expect(paths).toContain('src/lib/store.ts');
    const lb = def.files.find((f) => f.path === 'src/lib/leaderboard.ts')!.content;
    expect(lb).toContain('`leaderboard:${day}`');
    expect(lb).toContain('`played:${day}`');
    expect(lb).toContain("'public'");
    expect(lb).toContain("'protected'");
    expect(lb).not.toContain("'common'"); // the retired third bucket
    expect(lb).not.toContain('/leaderboard/');
  });
});

describe('applyTemplateMeta template lineage', () => {
  it('shallow-merges a template meta block (meta.game) under the stamped keys', () => {
    const def: TemplateDefinition = {
      files: [],
      greeting: '',
      meta: { game: { shelfPath: 'shelf.json' } },
    };
    const meta = applyTemplateMeta({ summary: { crux: 'keep' }, game: { old: true } }, def, 'x');
    expect(meta.game).toEqual({ shelfPath: 'shelf.json' });
    expect(meta.summary).toEqual({ crux: 'keep' });
    expect(meta.template).toBe('x');
  });

  it('stamps meta.template with the template id when given', async () => {
    const def = (await loadTemplate('astro-blog'))!;
    expect(applyTemplateMeta({}, def, 'astro-blog').template).toBe('astro-blog');
    expect(applyTemplateMeta({}, def).template).toBeUndefined();
  });
});
