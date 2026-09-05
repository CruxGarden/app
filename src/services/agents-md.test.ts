import { describe, it, expect } from 'vitest';
import {
  renderAgentsMd,
  renderWorkspaceGuide,
  renderAgentsMdSections,
  renderContentModel,
  syncAgentsMd,
  isGeneratedGuidePath,
  templateDisplayName,
  AGENTS_MD_PATH,
  CLAUDE_MD_PATH,
  CLAUDE_MD_CONTENT,
  type AgentsMdInput,
} from './agents-md';
import { applyTemplateMeta, loadTemplate } from '@/templates';
import { isInternalArtifactPath, publishableArtifacts } from './publish';
import { DEFAULT_PERSONA } from './persona';
import type { Artifact, Crux } from '@/api/types';

const TEMPLATE_IDS = ['astro-blog', 'astro-feed', 'astro-media', 'astro-homepage', 'astro-empty'];

function art(path: string, overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: `a-${path}`,
    type: 'artifact',
    kind: 'file',
    meta: { path },
    resourceId: 'crux-1',
    resourceType: 'crux',
    authorId: 'author-1',
    homeId: 'home-1',
    encoding: 'utf-8',
    mimeType: 'text/plain',
    filename: path.split('/').pop() || path,
    size: 10,
    created: '2026-01-01T00:00:00.000Z',
    updated: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as Artifact;
}

/** The input a crux created from `templateId` produces (meta stamped, template files present). */
async function inputForTemplate(templateId: string): Promise<AgentsMdInput> {
  const def = (await loadTemplate(templateId))!;
  const meta = applyTemplateMeta({ settings: { model: 'claude-sonnet-5' } }, def, templateId);
  return {
    crux: { title: `My ${templateDisplayName(templateId)}`, kind: 'webapp', meta } as Crux,
    artifacts: def.files.map((f) => art(f.path)),
    persona: DEFAULT_PERSONA,
    canBuild: true,
  };
}

describe('renderAgentsMd', () => {
  it.each(TEMPLATE_IDS)('%s: renders a stable file (snapshot)', async (id) => {
    const input = await inputForTemplate(id);
    const first = renderAgentsMd(input);
    // Deterministic: no timestamps, ids or live listings
    expect(renderAgentsMd(input)).toBe(first);
    expect(first).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(first).toMatchSnapshot();
  });

  it('carries every section for a content-model template', async () => {
    const md = renderAgentsMd(await inputForTemplate('astro-blog'));
    expect(md).toContain('# AGENTS.md');
    expect(md).toContain('## About this crux');
    expect(md).toContain('Template: Astro Blog (`astro-blog`)');
    expect(md).toContain('Kind: Site Crux');
    expect(md).toContain('## Content Model');
    expect(md).toContain('### Collection: Posts (singular "Post")');
    expect(md).toContain('src/pages/posts/*.md');
    expect(md).toContain('### Builder actions');
    expect(md).toContain('New Post — creates src/pages/posts/{slug}.md');
    expect(md).toContain('## Files and folder layout');
    expect(md).toContain('## Preview and verification');
    expect(md).toContain('`check_site`');
    expect(md).toContain('astro dev');
    expect(md).toContain('## Never touch');
    expect(md).toContain('`.crux/`');
    expect(md).toContain('`_crux/`');
    expect(md).toContain('`node_modules/`');
    expect(md).toContain('## Recording work (Growth)');
    expect(md).toContain('`restore(snapshotId)`');
    expect(md).toContain('## Voice');
    expect(md).toContain('**The Keeper**');
    expect(md).toContain(DEFAULT_PERSONA.systemPrompt.slice(0, 40));
    expect(md).toContain('## Instructions for this crux');
    expect(md).toContain('CONTEXT: This is a real Astro project');
  });

  it('omits the content model and instructions when the crux has none, and describes plain cruxes', () => {
    const md = renderAgentsMd({
      crux: { title: 'Plain', kind: 'page', meta: {} } as Crux,
      artifacts: [art('index.html')],
      persona: { name: 'Sage', systemPrompt: 'Be brief.' },
    });
    expect(md).not.toContain('## Content Model');
    expect(md).not.toContain('## Instructions for this crux');
    expect(md).toContain('Kind: page (static HTML');
    expect(md).toContain('served to the browser exactly as written');
    expect(md).toContain('esm.sh');
    expect(md).not.toContain('node_modules');
    expect(md).toContain('**Sage**');
    expect(md).toContain('Be brief.');
  });

  it('falls back to pnpm build guidance when check_site is unavailable', async () => {
    const input = await inputForTemplate('astro-empty');
    const md = renderAgentsMd({ ...input, canBuild: false });
    expect(md).not.toContain('`check_site`');
    expect(md).toContain('`pnpm build`');
  });

  it('the workspace guide is the file minus Voice and Instructions', async () => {
    const input = await inputForTemplate('astro-feed');
    const guide = renderWorkspaceGuide(input);
    const s = renderAgentsMdSections(input);
    expect(renderAgentsMd(input)).toContain(guide);
    expect(guide).not.toContain('## Voice');
    expect(guide).not.toContain('## Instructions for this crux');
    expect(guide).toContain(s.contentModel!);
    expect(guide).toContain(s.recording);
  });

  it('renderContentModel lists Builder actions including template extras', async () => {
    const def = (await loadTemplate('astro-media'))!;
    const md = renderContentModel(def.contentModel!);
    expect(md).toContain('### Builder actions');
    expect(md).toContain('Settings — edits src/config.json as a form.');
    expect(md).toMatch(/uploads audio\/video into public\/media\//);
  });
});

describe('guide files and publish', () => {
  it('names the guide files and keeps them out of publish and change detection', () => {
    expect(isGeneratedGuidePath(AGENTS_MD_PATH)).toBe(true);
    expect(isGeneratedGuidePath(CLAUDE_MD_PATH)).toBe(true);
    expect(isGeneratedGuidePath('docs/AGENTS.md')).toBe(false);
    expect(isInternalArtifactPath('AGENTS.md')).toBe(true);
    expect(isInternalArtifactPath('CLAUDE.md')).toBe(true);
    const shipped = publishableArtifacts([art('index.html'), art('AGENTS.md'), art('CLAUDE.md')]);
    expect(shipped.map((a) => a.meta?.path)).toEqual(['index.html']);
  });

  it('templateDisplayName title-cases ids', () => {
    expect(templateDisplayName('astro-blog')).toBe('Astro Blog');
    expect(templateDisplayName('astro-homepage')).toBe('Astro Homepage');
  });
});

describe('syncAgentsMd', () => {
  function fakeWriter(existing: Artifact[]) {
    const writes: { path: string; content: string }[] = [];
    const deps = {
      enabled: () => true,
      persona: () => ({ name: 'Sage', systemPrompt: 'Be brief.' }),
      canBuild: () => false,
      artifact: {
        findByResource: async () => existing,
        create: async (input: { content: string; meta?: { path?: string } }) => {
          writes.push({ path: input.meta!.path!, content: input.content });
        },
      },
      hash: async (content: string) => `h:${content}`,
    };
    return { deps, writes };
  }
  const crux = { id: 'crux-1', title: 'T', kind: 'page', meta: {} } as Crux;

  it('writes AGENTS.md and the one-line CLAUDE.md when absent', async () => {
    const { deps, writes } = fakeWriter([art('index.html')]);
    expect(await syncAgentsMd(crux, null, deps)).toBe(true);
    expect(writes.map((w) => w.path)).toEqual([AGENTS_MD_PATH, CLAUDE_MD_PATH]);
    expect(writes[0]!.content).toBe(
      renderAgentsMd({
        crux,
        artifacts: [art('index.html')],
        persona: deps.persona(),
        canBuild: false,
      }),
    );
    expect(writes[1]!.content).toBe(CLAUDE_MD_CONTENT);
    expect(CLAUDE_MD_CONTENT).toMatch(/^See AGENTS\.md/);
  });

  it('is a no-op when both files already match by fingerprint', async () => {
    const rendered = renderAgentsMd({
      crux,
      artifacts: [art('index.html')],
      persona: { name: 'Sage', systemPrompt: 'Be brief.' },
      canBuild: false,
    });
    const existing = [
      art('index.html'),
      art(AGENTS_MD_PATH, { fingerprint: `h:${rendered}` }),
      art(CLAUDE_MD_PATH, { fingerprint: `h:${CLAUDE_MD_CONTENT}` }),
    ];
    // The renderer must not depend on the guide files themselves being present
    const { deps, writes } = fakeWriter(existing);
    expect(await syncAgentsMd(crux, existing, deps)).toBe(false);
    expect(writes).toEqual([]);
  });

  it('rewrites when the persona or instructions changed the content', async () => {
    const stale = [
      art(AGENTS_MD_PATH, { fingerprint: 'h:old' }),
      art(CLAUDE_MD_PATH, { fingerprint: `h:${CLAUDE_MD_CONTENT}` }),
    ];
    const { deps, writes } = fakeWriter(stale);
    expect(await syncAgentsMd(crux, stale, deps)).toBe(true);
    expect(writes.map((w) => w.path)).toEqual([AGENTS_MD_PATH]);
  });

  it('does nothing when disabled (no Project Folder) and never throws', async () => {
    const { deps, writes } = fakeWriter([]);
    expect(await syncAgentsMd(crux, null, { ...deps, enabled: () => false })).toBe(false);
    expect(writes).toEqual([]);
    const failing = {
      ...deps,
      artifact: {
        ...deps.artifact,
        create: async () => {
          throw new Error('disk full');
        },
      },
    };
    expect(await syncAgentsMd(crux, null, failing)).toBe(false);
  });
});
