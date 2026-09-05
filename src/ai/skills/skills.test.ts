import { describe, it, expect, beforeEach } from 'vitest';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  SKILLS,
  TEMPLATE_SKILLS,
  SITE_SKILL,
  skillNames,
  hasSkill,
  getSkill,
  skillsForCrux,
  renderSkillsIndex,
  renderLoadedSkills,
  SKILL_TOOL_DEFINITIONS,
  runSkillTool,
} from './index';
import { buildPromptPartsFromData, buildContextFromData } from '../system-prompt';
import { validateToolInput } from '../validation';
import { applyTemplateMeta, loadTemplate } from '@/templates';
import { initServices } from '@/services';
import { clearMemory } from '@/services/memory';
import type { Crux, Artifact } from '@/services/types';

const REQUIRED = ['blog', 'feed', 'media', 'homepage', 'astro-basics', 'mood-design', 'resonance'];

function makeCrux(meta: Record<string, unknown> = {}): Crux {
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
    created: '2026-01-01T00:00:00.000Z',
    updated: '2026-01-01T00:00:00.000Z',
    meta,
  } as Crux;
}

function makeArtifact(path: string): Artifact {
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
    mimeType: 'text/plain',
    filename: path.split('/').pop() || path,
    size: 100,
    created: '2026-01-01T00:00:00.000Z',
    updated: '2026-01-01T00:00:00.000Z',
  } as Artifact;
}

async function blogCrux(): Promise<{ crux: Crux; artifacts: Artifact[] }> {
  const def = (await loadTemplate('astro-blog'))!;
  return {
    crux: makeCrux(applyTemplateMeta({}, def, 'astro-blog')),
    artifacts: def.files.map((f) => makeArtifact(f.path)),
  };
}

describe('skills registry (B6)', () => {
  it('registers every *.md in the folder — no orphans, no ghosts', () => {
    const onDisk = readdirSync(join(__dirname))
      .filter((f) => f.endsWith('.md'))
      .map((f) => f.replace(/\.md$/, ''))
      .sort();
    expect(skillNames().slice().sort()).toEqual(onDisk);
    for (const name of REQUIRED) expect(hasSkill(name)).toBe(true);
  });

  it('every skill has a parsable header, a summary, and a body beyond the header', () => {
    for (const s of Object.values(SKILLS)) {
      expect(s.text.split('\n')[0]).toBe(`# Skill: ${s.name}`);
      expect(s.summary.length).toBeGreaterThan(10);
      expect(s.text.split('\n').length).toBeGreaterThan(3);
      expect(s.text).not.toMatch(/\bAI\b/);
    }
  });

  it('the index names every skill once with its summary and the load_skill rule', () => {
    const index = renderSkillsIndex();
    expect(index.startsWith('## Skills')).toBe(true);
    expect(index).toContain('call load_skill(name)');
    for (const s of Object.values(SKILLS)) {
      expect(index.match(new RegExp(`\\*\\*${s.name}\\*\\* — `, 'g'))).toHaveLength(1);
      expect(index).toContain(s.summary);
    }
  });

  it('TEMPLATE_SKILLS matches what each built-in template declares', async () => {
    for (const [templateId, skill] of Object.entries(TEMPLATE_SKILLS)) {
      const def = (await loadTemplate(templateId))!;
      expect(def, templateId).toBeTruthy();
      expect(def.skill).toBe(skill);
      expect(hasSkill(skill)).toBe(true);
      // The template no longer bakes its know-how into the crux instructions
      expect(def.context).toBeUndefined();
    }
  });

  describe('auto-load', () => {
    it('a Blog crux loads blog + astro-basics; meta.skills is stamped at creation', async () => {
      const { crux, artifacts } = await blogCrux();
      expect((crux.meta as { skills: string[] }).skills).toEqual(['blog']);
      expect(skillsForCrux(crux, artifacts).map((s) => s.name)).toEqual([SITE_SKILL, 'blog']);
    });

    it('a pre-B6 template crux (no meta.skills) falls back to the template map', () => {
      const crux = makeCrux({ template: 'astro-feed' });
      expect(skillsForCrux(crux, [makeArtifact('astro.config.mjs')]).map((s) => s.name)).toEqual([
        SITE_SKILL,
        'feed',
      ]);
    });

    it('a plain crux loads nothing; unknown stamped names are dropped', () => {
      expect(skillsForCrux(makeCrux(), [makeArtifact('index.html')])).toEqual([]);
      expect(
        skillsForCrux(makeCrux({ skills: ['nope', 'mood-design'] }), []).map((s) => s.name),
      ).toEqual(['mood-design']);
      expect(renderLoadedSkills([])).toBe('');
    });

    it('the loaded skills ride in the volatile block, never the stable prefix', async () => {
      const { crux, artifacts } = await blogCrux();
      const { system, context } = buildPromptPartsFromData(crux, artifacts);
      expect(context).toContain('# Skills loaded for this crux');
      expect(context).toContain('# Skill: blog');
      expect(context).toContain('# Skill: astro-basics');
      expect(context).not.toContain('# Skill: mood-design');
      expect(system).not.toContain('# Skill: blog');
      expect(system).toContain('## Skills'); // the index only
      expect(system).toContain('**mood-design** — ');
      // The prose that used to live in the prefix is gone from it
      expect(system).not.toContain('window.crux.store');
      expect(system).not.toContain('per-component radii');
      expect(system).not.toContain('import.meta.glob');
      expect(buildContextFromData(makeCrux(), [])).not.toContain('# Skills loaded');
    });
  });

  describe('load_skill tool', () => {
    it('is defined and returns the skill text', () => {
      expect(SKILL_TOOL_DEFINITIONS.map((t) => t.name)).toEqual(['load_skill']);
      expect(runSkillTool({ name: 'resonance' })).toBe(getSkill('resonance')!.text);
      expect(runSkillTool({ name: 'nope' })).toMatch(/^Error: Unknown skill "nope"/);
    });

    it('validation refuses unknown or missing names and lists the options', () => {
      expect(validateToolInput('load_skill', { name: 'blog' })).toEqual({ valid: true });
      expect(validateToolInput('load_skill', {}).valid).toBe(false);
      const unknown = validateToolInput('load_skill', { name: 'cooking' });
      expect(unknown.valid).toBe(false);
      expect(unknown.error).toContain('Unknown skill "cooking"');
      expect(unknown.error).toContain('mood-design');
    });
  });
});

describe('prompt size (B6 gate)', () => {
  beforeEach(async () => {
    await initServices();
    await clearMemory();
  });

  /**
   * The stable prefix for a Blog crux (default persona, empty memory) before
   * B6 — measured 2026-09-04 on ace45a5 with the theme/soundscape guidance,
   * the Crux Store section, the long Site Crux section and the template
   * CONTEXT all inlined: 13,510 chars (~3,378 tokens at chars/4).
   */
  const LEGACY_BLOG_STABLE_PREFIX_CHARS = 13_510;

  it('a Blog crux stable prefix is at least 20% smaller than before skills', async () => {
    const { crux, artifacts } = await blogCrux();
    const { system } = buildPromptPartsFromData(crux, artifacts);
    const tokens = Math.ceil(system.length / 4);
    const legacyTokens = Math.ceil(LEGACY_BLOG_STABLE_PREFIX_CHARS / 4);
    console.log(
      `[B6] Blog stable prefix: ${system.length} chars (~${tokens} tokens), was ${LEGACY_BLOG_STABLE_PREFIX_CHARS} (~${legacyTokens})`,
    );
    expect(system.length).toBeLessThanOrEqual(LEGACY_BLOG_STABLE_PREFIX_CHARS * 0.8);
    // …while the essentials the tests always relied on are still there
    expect(system).toContain('## Site Crux');
    expect(system).toContain('package.json');
    expect(system).toContain('### Growth (version history)');
    expect(system).toContain('## What you know about this gardener');
  });
});
