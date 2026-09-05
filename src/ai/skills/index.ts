/**
 * Skills (AI-COLLABORATION-V3 B6, ADR 0013) — template and Mood know-how as
 * files loaded into the prompt on demand instead of living in the system
 * prompt permanently.
 *
 * Every `*.md` in this folder is a skill. The first line is `# Skill: <name>`
 * (the name the model passes to `load_skill`), the second is `Use when: …`
 * (the one line the stable prefix carries in its index). The rest is the body
 * the model receives when the skill loads — through `load_skill`, or
 * automatically in the volatile workspace block when the crux's template (or
 * kind) calls for it.
 *
 * The folder IS the registry: adding a file registers a skill; the tests fail
 * on a file whose header does not parse, so there are no orphans.
 */
import type { ToolDefinition } from '../tools';
import type { Crux } from '@/services/types';
import { isSiteCrux } from '@/services/site';
import type { ArtifactPathSource } from '@/lib/artifact-path';

export interface Skill {
  /** The id the model uses: `blog`, `astro-basics`, `mood-design`… */
  name: string;
  /** One line: when to load it. Shown in the stable-prefix index. */
  summary: string;
  /** The full text handed to the model (header lines included). */
  text: string;
}

const files = import.meta.glob('./*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function parseSkill(path: string, text: string): Skill {
  const [first = '', second = ''] = text.split('\n');
  const name = /^# Skill:\s*(\S+)\s*$/.exec(first)?.[1];
  const summary = /^Use when:\s*(.+)$/.exec(second)?.[1]?.trim();
  const fileStem = path.replace(/^.*\//, '').replace(/\.md$/, '');
  if (!name || name !== fileStem) {
    throw new Error(`Skill ${path}: first line must be "# Skill: ${fileStem}"`);
  }
  if (!summary) throw new Error(`Skill ${path}: second line must be "Use when: …"`);
  return { name, summary, text: text.trimEnd() };
}

/** Every bundled skill, by name, in file order. */
export const SKILLS: Readonly<Record<string, Skill>> = Object.freeze(
  Object.fromEntries(
    Object.entries(files)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([path, text]) => {
        const skill = parseSkill(path, text);
        return [skill.name, skill];
      }),
  ),
);

export function skillNames(): string[] {
  return Object.keys(SKILLS);
}

export function hasSkill(name: unknown): name is string {
  return typeof name === 'string' && Object.prototype.hasOwnProperty.call(SKILLS, name);
}

export function getSkill(name: string): Skill | null {
  return hasSkill(name) ? SKILLS[name]! : null;
}

/**
 * Which skill a built-in template's cruxes load automatically. New cruxes
 * carry `meta.skills` (stamped by `applyTemplateMeta`); this map covers cruxes
 * created before B6 — and is asserted against the template definitions in the
 * tests so the two cannot drift.
 */
export const TEMPLATE_SKILLS: Readonly<Record<string, string>> = Object.freeze({
  'astro-blog': 'blog',
  'astro-feed': 'feed',
  'astro-media': 'media',
  'astro-homepage': 'homepage',
  'astro-empty': 'astro-basics',
  '5ws': '5ws',
});

/** Skill loaded for every Site Crux regardless of template. */
export const SITE_SKILL = 'astro-basics';

/**
 * The skills to include automatically for this crux: the template's (from
 * `meta.skills`, else the built-in map) plus `astro-basics` for any Site Crux.
 * Pure; no unknown names come out.
 */
export function skillsForCrux(crux: Pick<Crux, 'meta'>, artifacts: ArtifactPathSource[]): Skill[] {
  const meta = (crux.meta ?? {}) as Record<string, unknown>;
  const names: string[] = [];
  if (isSiteCrux(artifacts)) names.push(SITE_SKILL);
  const stamped = Array.isArray(meta.skills) ? meta.skills : null;
  if (stamped) {
    for (const n of stamped) if (hasSkill(n)) names.push(n);
  } else if (typeof meta.template === 'string' && TEMPLATE_SKILLS[meta.template]) {
    names.push(TEMPLATE_SKILLS[meta.template]!);
  }
  return [...new Set(names)].map((n) => SKILLS[n]!);
}

/** The index the stable prefix carries: one line per skill plus the rule. */
export function renderSkillsIndex(): string {
  return [
    '## Skills',
    'Know-how lives in skills, not here. Before that kind of work, call load_skill(name) unless it is already in this conversation (this crux\'s are in <workspace_context>).',
    ...Object.values(SKILLS).map((s) => `- **${s.name}** — ${s.summary}`),
  ].join('\n');
}

/** The auto-loaded skills as they appear in the volatile block (empty string when none). */
export function renderLoadedSkills(skills: Skill[]): string {
  if (skills.length === 0) return '';
  return ['# Skills loaded for this crux', ...skills.map((s) => s.text)].join('\n\n');
}

// ── The tool ────────────────────────────────────────────────────────────────

export const SKILL_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'load_skill',
    description:
      'Load a skill — the know-how for one kind of work (a template, composing a Mood, the soundscape, the Crux Store). ' +
      'USE WHEN: You are about to do that kind of work and the skill is not already in this conversation. ' +
      'The Skills section of your instructions lists every name and when to use it. Returns the skill text; nothing is saved.',
    input_schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'The skill name exactly as listed, e.g. "mood-design" or "blog".',
        },
      },
      required: ['name'],
      additionalProperties: false,
    },
  },
];

export function runSkillTool(input: Record<string, unknown>): string {
  const skill = getSkill(String(input.name));
  if (!skill) {
    return `Error: Unknown skill "${String(input.name)}". Available: ${skillNames().join(', ')}.`;
  }
  return skill.text;
}
