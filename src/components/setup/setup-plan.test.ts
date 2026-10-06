import { describe, expect, it } from 'vitest';
import { templateCatalog } from '@/components/garden/NewCruxModal';
import { BUNDLED_MOODS } from '@/lib/moods/bundled-moods';
import { isToolAvailable } from '@/services/crux-tools/registry';
import {
  FALLBACK_TEMPLATE,
  NEEDS,
  SETUP_MOODS,
  WINDOWS_PATH_LINE,
  firstSectionFor,
  offeredSections,
  pathLine,
  resolveStartingPoint,
  SETUP_STEPS,
  disclosuresFor,
  usernameFormatError,
  visibleSections,
} from './setup-plan';

const catalog = templateCatalog();

describe('step 1 → starting point', () => {
  it('maps every need only to starting points that exist in the Add Crux catalog', () => {
    const ids = new Set(catalog.map((t) => t.id));
    for (const need of NEEDS) {
      expect(need.templates.length).toBeGreaterThan(0);
      for (const id of need.templates) expect(ids, `${need.id} → ${id}`).toContain(id);
    }
    expect(ids).toContain(FALLBACK_TEMPLATE);
  });

  it('suggests a starting point this build ships (bundled tools, not ones to install)', () => {
    for (const need of NEEDS) {
      const entry = resolveStartingPoint(need.id, catalog, {
        canBuild: true,
        isAvailable: isToolAvailable,
      });
      expect(entry, need.id).toBeDefined();
      expect(isToolAvailable(entry!.id)).toBe(true);
      expect([...need.templates, FALLBACK_TEMPLATE]).toContain(entry!.id);
    }
  });

  it('suggests the first choice on desktop: the home page keeps its walkthrough', () => {
    const rules = { canBuild: true, isAvailable: () => true };
    expect(resolveStartingPoint('website', catalog, rules)?.id).toBe('hello-world');
    expect(resolveStartingPoint('app', catalog, rules)?.id).toBe('private-requests');
    expect(resolveStartingPoint('writing', catalog, rules)?.id).toBe('notes');
    expect(resolveStartingPoint('music', catalog, rules)?.id).toBe('tool-smplr');
    expect(resolveStartingPoint('art', catalog, rules)?.id).toBe('tool-excalidraw');
    expect(resolveStartingPoint('game', catalog, rules)?.id).toBe('bitsy-app');
    expect(resolveStartingPoint(null, catalog, rules)?.id).toBe('hello-world');
  });

  it('skips desktop-only and unavailable starting points, ending at Blank', () => {
    const web = { canBuild: false, isAvailable: () => true };
    expect(resolveStartingPoint('app', catalog, web)?.id).toBe('private-requests');
    expect(resolveStartingPoint('writing', catalog, web)?.id).toBe(FALLBACK_TEMPLATE);
    const nothing = { canBuild: true, isAvailable: (id: string) => id === FALLBACK_TEMPLATE };
    expect(resolveStartingPoint('game', catalog, nothing)?.id).toBe(FALLBACK_TEMPLATE);
  });
});

describe('step 1 → which section opens first', () => {
  const all = offeredSections({ localInference: true, agentHost: true });
  it('opens the section that fits what the person wants to make', () => {
    expect(firstSectionFor('art', all)).toBe('images');
    expect(firstSectionFor('app', all)).toBe('agents');
    expect(firstSectionFor('website', all)).toBe('collaborator');
    expect(firstSectionFor(null, all)).toBe('collaborator');
  });
  it('falls back when the platform does not offer that section', () => {
    const web = offeredSections({ localInference: false, agentHost: false });
    expect(web).toEqual(['collaborator', 'images']);
    expect(firstSectionFor('app', web)).toBe('collaborator');
  });
});

describe('No AI', () => {
  it('hides every collaborator section', () => {
    const all = offeredSections({ localInference: true, agentHost: true });
    expect(visibleSections(true, all)).toEqual([]);
    expect(visibleSections(false, all)).toEqual(all);
  });
});

describe('steps and disclosure', () => {
  it('every run walks the same five steps, ending at the garden summary', () => {
    expect(SETUP_STEPS).toEqual(['need', 'garden', 'ai', 'mood', 'crux']);
  });
  it('an app with a backend opens the developer options; a website keeps them folded', () => {
    const all = offeredSections({ localInference: true, agentHost: true });
    expect(disclosuresFor('app', all)).toEqual({ more: false, developers: true });
    expect(disclosuresFor('website', all)).toEqual({ more: false, developers: false });
    expect(disclosuresFor('art', all)).toEqual({ more: false, developers: false });
    const web = offeredSections({ localInference: false, agentHost: false });
    expect(disclosuresFor('app', web)).toEqual({ more: false, developers: false });
  });
});

describe('details', () => {
  it('offers only bundled Moods that ship', () => {
    for (const id of SETUP_MOODS) expect(BUNDLED_MOODS.map((m) => m.id)).toContain(id);
    expect(SETUP_MOODS[0]).toBe('plasma');
  });
  it('keeps the Gateway username rules', () => {
    expect(usernameFormatError('')).toBe('');
    expect(usernameFormatError('ab')).toBe('At least 3 characters');
    expect(usernameFormatError('a b c')).toMatch(/Letters/);
    expect(usernameFormatError('river-moss')).toBe('');
  });
  it('gives the exact PATH lines for ~/.local/bin', () => {
    expect(pathLine('zsh')).toBe(
      `echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc && source ~/.zshrc`,
    );
    expect(pathLine('bash')).toContain('~/.bashrc');
    expect(WINDOWS_PATH_LINE).toContain('.local\\bin');
  });
});
