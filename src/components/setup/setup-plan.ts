import { isReservedUsername } from '@/lib/site';

/**
 * The Setup wizard's plan (ROADMAP § Setup wizard): what a person wants to
 * make decides the suggested first Crux and which collaborator section opens
 * first. Pure data and pure functions, so the mapping is tested against the
 * real template registry rather than trusted.
 */

export type SetupNeed = 'website' | 'app' | 'writing' | 'music' | 'art' | 'game' | 'exploring';

/** The collaborator sections of step 3, in the order they are shown. */
export type AiSection = 'collaborator' | 'images' | 'local' | 'agents' | 'outside';

export type SetupStepId = 'need' | 'garden' | 'ai' | 'mood' | 'crux';

/** First run: the whole journey. Again: everything but the first Crux, unless asked for. */
export type SetupMode = 'first' | 'again';

export interface NeedChoice {
  id: SetupNeed;
  label: string;
  description: string;
  /** Starting points to suggest, best first. Each must exist in the Add Crux catalog. */
  templates: string[];
  /** Which section of step 3 opens first. */
  firstSection: AiSection;
  /** The gentle first choice, marked Recommended. */
  recommended?: boolean;
}

export const NEEDS: NeedChoice[] = [
  {
    id: 'website',
    label: 'A home page or website',
    description: 'A page about you, a blog, a portfolio or a small business',
    templates: ['hello-world', 'astro-homepage', 'astro-blog'],
    firstSection: 'collaborator',
    recommended: true,
  },
  {
    id: 'app',
    label: 'An app with a backend',
    description: 'Forms, saved data and sign-in for the people who use it',
    templates: ['private-requests', 'order-desk'],
    firstSection: 'agents',
  },
  {
    id: 'writing',
    label: 'Writing and notes',
    description: 'A notebook, a journal or a guide you can share',
    templates: ['notes', 'documentation'],
    firstSection: 'collaborator',
  },
  {
    id: 'music',
    label: 'Music and sound',
    description: 'Beats, loops and instruments to play with',
    templates: ['tool-smplr', 'cardinal-drone'],
    firstSection: 'collaborator',
  },
  {
    id: 'art',
    label: 'Art and visuals',
    description: 'Drawings, diagrams and pictures',
    templates: ['tool-excalidraw', 'photo-gallery'],
    firstSection: 'images',
  },
  {
    id: 'game',
    label: 'A game',
    description: 'Tiny worlds, puzzles and playable stories',
    templates: ['bitsy-app', 'onebigsky'],
    firstSection: 'collaborator',
  },
  {
    id: 'exploring',
    label: 'Just exploring',
    description: 'Look around first and decide later',
    templates: ['hello-world'],
    firstSection: 'collaborator',
  },
];

/** The starting point every catalog has: the last resort for any need. */
export const FALLBACK_TEMPLATE = 'blank';
/** The starting point that keeps the first home page walkthrough. */
export const HOME_PAGE_TEMPLATE = 'hello-world';

export function needChoice(need: SetupNeed | null | undefined): NeedChoice | undefined {
  return NEEDS.find((n) => n.id === need);
}

/** What `templateCatalog()` in NewCruxModal answers, reduced to what is needed here. */
export interface CatalogEntry {
  id: string;
  label: string;
  description: string;
  kind: string;
  desktopOnly: boolean;
}

export interface StartingPointRules {
  /** Capability.Build: desktop-only starting points need it. */
  canBuild: boolean;
  /** Bundled or installed; a tool that is neither is never suggested. */
  isAvailable: (id: string) => boolean;
}

/** The suggested first Crux for a need: the first candidate this build can create. */
export function resolveStartingPoint(
  need: SetupNeed | null | undefined,
  catalog: CatalogEntry[],
  rules: StartingPointRules,
): CatalogEntry | undefined {
  const usable = (id: string) => {
    const entry = catalog.find((t) => t.id === id);
    if (!entry || !rules.isAvailable(id) || (entry.desktopOnly && !rules.canBuild)) return;
    return entry;
  };
  const candidates = [...(needChoice(need ?? 'exploring')?.templates ?? []), FALLBACK_TEMPLATE];
  for (const id of candidates) {
    const entry = usable(id);
    if (entry) return entry;
  }
  return undefined;
}

/** The section of step 3 that opens first, when this platform offers it. */
export function firstSectionFor(
  need: SetupNeed | null | undefined,
  offered: readonly AiSection[],
): AiSection | null {
  const wanted = needChoice(need)?.firstSection ?? 'collaborator';
  if (offered.includes(wanted)) return wanted;
  return offered[0] ?? null;
}

export interface SectionRules {
  /** Capability.LocalInference */
  localInference: boolean;
  /** Capability.AgentHost */
  agentHost: boolean;
}

/** Desktop-only sections are offered by Capability, never by platform name. */
export function offeredSections(rules: SectionRules): AiSection[] {
  const all: AiSection[] = ['collaborator', 'images', 'local', 'agents', 'outside'];
  return all.filter(
    (s) =>
      (s !== 'local' || rules.localInference) &&
      ((s !== 'agents' && s !== 'outside') || rules.agentHost),
  );
}

/**
 * Progressive disclosure: what everyone sees, what sits under "More options",
 * and what sits under "For developers".
 */
export type SectionTier = 'everyone' | 'more' | 'developers';
export const SECTION_TIER: Record<AiSection, SectionTier> = {
  collaborator: 'everyone',
  images: 'everyone',
  local: 'more',
  agents: 'developers',
  outside: 'developers',
};

/** Which disclosures open by themselves: the ones holding the section step 1 asked for. */
export function disclosuresFor(
  need: SetupNeed | null | undefined,
  offered: readonly AiSection[],
): { more: boolean; developers: boolean } {
  const first = firstSectionFor(need, offered);
  return {
    more: first !== null && SECTION_TIER[first] === 'more',
    developers: first !== null && SECTION_TIER[first] === 'developers',
  };
}

/** With No AI on, nothing about collaborators stays on screen. */
export function visibleSections(noAi: boolean, offered: readonly AiSection[]): AiSection[] {
  return noAi ? [] : [...offered];
}

/** Every run ends at "Here's your garden"; running again only makes a Crux when asked. */
export const SETUP_STEPS: SetupStepId[] = ['need', 'garden', 'ai', 'mood', 'crux'];

/** The format rules the Gateway always used for a local username. */
export function usernameFormatError(name: string): string {
  if (!name) return '';
  if (name.length < 3) return 'At least 3 characters';
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) return 'Letters, numbers, hyphens, underscores only';
  if (isReservedUsername(name)) return 'That name is kept for the website';
  return '';
}

/** A placeholder name the app gave, not one the person chose. */
export function isPlaceholderUsername(name: string | null | undefined): boolean {
  return !name || name.startsWith('wanderer-');
}

/** A few bundled Moods to choose from: the Default Mood first, then a spread of looks. */
export const SETUP_MOODS = [
  'plasma',
  'digital-fractal-garden',
  'summer-meadow',
  'parchment',
  'lofi-sunset',
  'night-city',
] as const;

/** The shell line that puts ~/.local/bin on PATH for the `crux` command. */
export function pathLine(shell: 'zsh' | 'bash'): string {
  const rc = shell === 'zsh' ? '~/.zshrc' : '~/.bashrc';
  return `echo 'export PATH="$HOME/.local/bin:$PATH"' >> ${rc} && source ${rc}`;
}

/** Windows: the same, for the current user, in PowerShell. */
export const WINDOWS_PATH_LINE =
  "[Environment]::SetEnvironmentVariable('Path', \"$env:USERPROFILE\\.local\\bin;\" + [Environment]::GetEnvironmentVariable('Path', 'User'), 'User')";
