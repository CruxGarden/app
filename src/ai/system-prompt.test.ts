import { describe, it, expect } from 'vitest';
import {
  buildPromptPartsFromData,
  buildContextFromData,
  CONTEXT_BLOCK_OPEN,
} from './system-prompt';
import type { Crux, Artifact } from '@/services/types';

function makeCrux(overrides: Partial<Crux> = {}): Crux {
  return {
    id: 'crux-1',
    slug: 'test',
    title: 'Test Crux',
    data: '',
    status: 'living',
    visibility: 'private',
    discoverable: false,
    authorId: 'author-1',
    homeId: 'home-1',
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    ...overrides,
  };
}

function makeArtifact(path: string, overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: `att-${path}`,
    type: 'artifact',
    kind: 'file',
    meta: { path },
    resourceId: 'crux-1',
    resourceType: 'crux',
    authorId: 'author-1',
    homeId: 'home-1',
    encoding: 'utf-8',
    mimeType: 'text/html',
    filename: path.split('/').pop() || path,
    size: 100,
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    ...overrides,
  };
}

describe('buildPromptPartsFromData', () => {
  it('splits stable system from volatile context (A2)', () => {
    const { system, context } = buildPromptPartsFromData(makeCrux(), [makeArtifact('index.html')]);

    // Stable prefix: persona, rules, kind guidance — no per-file state
    expect(system).toContain('## Identity');
    expect(system).toContain('## Capabilities');
    expect(system).toContain('## Process');
    expect(system).toContain('## Rules');
    expect(system).toContain('## Edge Cases');
    expect(system).not.toContain('- index.html');

    // Volatile context: file list, wrapped in the workspace_context block
    expect(context.startsWith(CONTEXT_BLOCK_OPEN)).toBe(true);
    expect(context).toContain('</workspace_context>');
    expect(context).toContain('## Current Files');
    expect(context).toContain('- index.html');
  });

  it('uses default Keeper persona when no custom prompt', () => {
    const { system } = buildPromptPartsFromData(makeCrux(), []);
    expect(system).toContain('The Keeper');
    expect(system).toContain('Crux Garden');
  });

  it('adds a per-crux prompt as Instructions alongside the persona identity', () => {
    // Since the persona system landed, identity always comes from the Mood
    // persona; a per-crux systemPrompt is workspace INSTRUCTIONS, not a
    // replacement personality.
    const crux = makeCrux({
      meta: { settings: { systemPrompt: 'You are a coding assistant.' } },
    });
    const { system } = buildPromptPartsFromData(crux, []);
    expect(system).toContain('## Instructions');
    expect(system).toContain('You are a coding assistant.');
    expect(system).toContain('## Identity'); // persona identity is retained
  });

  it('gives browser-native (esm.sh) guidance for non-site cruxes', () => {
    const { system } = buildPromptPartsFromData(makeCrux(), [makeArtifact('index.html')]);
    expect(system).toContain('## Web Applications');
    expect(system).toContain('esm.sh');
    expect(system).not.toContain('## Site Crux');
  });

  it('swaps in Site Crux guidance when the crux has an Astro config', () => {
    const artifacts = [makeArtifact('astro.config.mjs'), makeArtifact('src/pages/index.astro')];
    const { system } = buildPromptPartsFromData(makeCrux(), artifacts);
    expect(system).toContain('## Site Crux');
    expect(system).toContain('package.json');
    // The esm.sh import-map pattern is actively wrong for a toolchain project
    expect(system).not.toContain('## Web Applications');
    expect(system).not.toContain('<script type="importmap">');
  });
});

describe('buildContextFromData', () => {
  it('lists artifact files in Current Files section', () => {
    const artifacts = [makeArtifact('index.html'), makeArtifact('styles.css')];
    const context = buildContextFromData(makeCrux(), artifacts);
    expect(context).toContain('- index.html');
    expect(context).toContain('- styles.css');
  });

  it('shows "No files yet." when no artifacts', () => {
    const context = buildContextFromData(makeCrux(), []);
    expect(context).toContain('No files yet.');
  });

  it('excludes version artifacts from file listing', () => {
    const artifacts = [
      makeArtifact('index.html'),
      makeArtifact('snapshot.html', { type: 'version' }),
    ];
    const context = buildContextFromData(makeCrux(), artifacts);
    expect(context).toContain('- index.html');
    expect(context).not.toContain('- snapshot.html');
  });

  it('includes workspace context when summary exists', () => {
    const crux = makeCrux({
      meta: {
        summary: {
          crux: 'Portfolio Site',
          purpose: 'Showcase work',
          stage: 'In progress',
          themes: 'Minimalist',
          stack: 'HTML/CSS/JS',
        },
      },
    });
    const context = buildContextFromData(crux, []);
    expect(context).toContain('## Workspace Context');
    expect(context).toContain('Project: Portfolio Site');
    expect(context).toContain('Purpose: Showcase work');
  });

  it('omits workspace context when no summary', () => {
    const context = buildContextFromData(makeCrux(), []);
    expect(context).not.toContain('## Workspace Context');
  });

  it('renders the content model so chat and the Builder agree', () => {
    const crux = makeCrux({
      meta: {
        contentModel: {
          collections: [
            {
              name: 'Posts',
              singular: 'Post',
              glob: 'src/pages/posts/*.md',
              routeBase: '/posts/',
              fields: [
                { key: 'title', label: 'Title', type: 'text' },
                { key: 'date', label: 'Date', type: 'text' },
              ],
              new: {
                pathTemplate: 'src/pages/posts/{slug}.md',
                frontmatter: {
                  layout: '../../layouts/PostLayout.astro',
                  title: '{title}',
                  date: '{today}',
                },
              },
              sort: { field: 'date', dir: 'desc' },
            },
          ],
          settings: {
            path: 'src/config.json',
            fields: [{ key: 'title', label: 'Blog Title', type: 'text' }],
          },
        },
      },
    });
    const context = buildContextFromData(crux, []);
    expect(context).toContain('## Content Model');
    expect(context).toContain('Collection: Posts (singular "Post")');
    expect(context).toContain('src/pages/posts/*.md');
    expect(context).toContain('src/pages/posts/{slug}.md');
    expect(context).toContain('layout: ../../layouts/PostLayout.astro');
    expect(context).toContain('date: {today}');
    expect(context).toContain('Settings file: src/config.json');
    expect(context).toContain('descending order by "date"');
  });

  it('omits the content model section when the crux has none', () => {
    const context = buildContextFromData(makeCrux(), []);
    expect(context).not.toContain('## Content Model');
  });
});

describe('AGENTS.md as the single source (B1)', () => {
  it('the context block embeds the same workspace guide the Project Folder file carries', async () => {
    const { renderWorkspaceGuide, renderAgentsMd } = await import('@/services/agents-md');
    const { applyTemplateMeta, loadTemplate } = await import('@/templates');
    const { getPersona } = await import('@/services/persona');
    const def = (await loadTemplate('astro-blog'))!;
    const crux = makeCrux({ meta: applyTemplateMeta({}, def, 'astro-blog') });
    const artifacts = def.files.map((f) => makeArtifact(f.path));

    const context = buildContextFromData(crux, artifacts);
    const guide = renderWorkspaceGuide({ crux, artifacts, persona: getPersona(), canBuild: false });
    expect(context).toContain('# Workspace guide (AGENTS.md)');
    expect(context).toContain(guide);
    // …and the file is that guide plus voice and instructions
    const file = renderAgentsMd({ crux, artifacts, persona: getPersona(), canBuild: false });
    expect(file).toContain(guide);
    // Content model still reaches the model (now via the guide), once
    expect(context.match(/## Content Model/g)).toHaveLength(1);
    expect(context).toContain('Template: Astro Blog');
  });

  it('voice and instructions live in the stable prefix, not the volatile block', () => {
    const crux = makeCrux({ meta: { settings: { systemPrompt: 'Prefer short posts.' } } });
    const { system, context } = buildPromptPartsFromData(crux, []);
    expect(system).toContain('Prefer short posts.');
    expect(context).not.toContain('Prefer short posts.');
    expect(context).not.toContain('## Voice');
  });

  it('describes the Growth tools and when to use them (B0)', () => {
    const { system } = buildPromptPartsFromData(makeCrux(), []);
    expect(system).toContain('### Growth (version history)');
    expect(system).toContain(
      '**snapshot** / **list_snapshots** / **restore** / **branch** / **diff**',
    );
    expect(system).toMatch(/Before a risky or multi-file change, call snapshot/);
    expect(system).toMatch(/call restore with that snapshot id/);
  });
});

describe('garden memory and skills in the prompt (B6)', () => {
  it('carries the memory section in the stable prefix, after the persona and before the tools', async () => {
    const { clearMemory, setMemory } = await import('@/services/memory');
    const { initServices } = await import('@/services');
    await initServices();
    await setMemory('## Preferences\n- prefers British spelling\n');
    try {
      const { system, context } = buildPromptPartsFromData(makeCrux(), []);
      expect(system).toContain('## What you know about this gardener');
      expect(system).toContain('- prefers British spelling');
      expect(context).not.toContain('prefers British spelling');
      expect(system.indexOf('## Identity')).toBeLessThan(
        system.indexOf('## What you know about this gardener'),
      );
      expect(system.indexOf('## What you know about this gardener')).toBeLessThan(
        system.indexOf('## Capabilities'),
      );
      // Persona voice and gardener memory stay distinct sections
      expect(system).toContain('your own voice comes from Identity');
    } finally {
      await clearMemory();
    }
  });

  it('lists remember and load_skill among the capabilities and carries the skills index', () => {
    const { system } = buildPromptPartsFromData(makeCrux(), []);
    expect(system).toContain('**remember**');
    expect(system).toContain('**load_skill**');
    expect(system).toContain('## Skills');
    expect(system).toContain('**resonance** — ');
    // Long guidance moved to skills; the short rules stayed
    expect(system).toContain('### Theme and soundscape');
    expect(system).toContain('Never persist a change they did not ask for');
    expect(system).not.toContain('### Crux Store');
    expect(system).not.toContain('25 token groups');
  });
});
