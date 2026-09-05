import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ENGINE_FILES, SITE_FILES } from './5ws';

/**
 * The 5Ws site runs the app's own round engine in the visitor's browser
 * (ADR 0016). The template writes `src/game/*.ts` into the crux verbatim via
 * `?raw`, so the app's `src/game/` stays the one source — and every module
 * (minus the harness, its fixtures and tests) must be on the list. The play
 * surface under `src/templates/5ws-site/` is mirrored the same way: real files
 * here (type-checked, linted, unit-tested), the same bytes at the same
 * relative paths in the crux.
 */
const APP_SRC = join(__dirname, '..');
const GAME_DIR = join(APP_SRC, 'game');
const SITE_DIR = join(__dirname, '5ws-site');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

describe('5Ws site: engine and surface mirrored into the crux', () => {
  it('writes every engine module verbatim, and nothing test- or harness-shaped', () => {
    const modules = readdirSync(GAME_DIR)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'harness.ts')
      .sort();
    expect(modules).toEqual([
      'hidden.ts',
      'index.ts',
      'leaks.ts',
      'prompts.ts',
      'round.ts',
      'shelf.ts',
      'transcript.ts',
    ]);
    const written = new Map(ENGINE_FILES.map((f) => [f.path, f.content]));
    for (const m of modules) {
      const path = `src/game/${m}`;
      expect(written.has(path), `${path} must be written into the crux`).toBe(true);
      expect(written.get(path)).toBe(readFileSync(join(GAME_DIR, m), 'utf8'));
    }
    expect([...written.keys()].sort()).toEqual(modules.map((m) => `src/game/${m}`).sort());
    // The copy must not reach back into the app: relative imports only
    for (const [path, content] of written) {
      expect(content, path).not.toMatch(/from '@\//);
      expect(content, path).not.toMatch(/from '\.\.\//);
    }
  });

  it('writes the play surface at the same relative paths, byte for byte', () => {
    const files = walk(join(SITE_DIR, 'src'))
      .filter((p) => !p.includes(`${join('src', 'game')}`)) // the type-check shim stays home
      .filter((p) => !/\.test\.ts$/.test(p));
    expect(files.length).toBeGreaterThan(0);
    const written = new Map(SITE_FILES.map((f) => [f.path, f.content]));
    for (const abs of files) {
      const rel = relative(SITE_DIR, abs).split('\\').join('/');
      expect(written.has(rel), `${rel} must be written into the crux`).toBe(true);
      expect(written.get(rel)).toBe(readFileSync(abs, 'utf8'));
    }
    expect([...written.keys()].sort()).toEqual(
      files.map((abs) => relative(SITE_DIR, abs).split('\\').join('/')).sort(),
    );
    // Surface files import the engine by the crux's own path, never the app's
    for (const [path, content] of written) {
      expect(content, path).not.toMatch(/from '@\//);
      expect(content, path).not.toMatch(/\.\.\/\.\.\/game/);
    }
  });

  it('the shim under 5ws-site/src/game re-exports the app engine and is not written', () => {
    const shim = readFileSync(join(SITE_DIR, 'src', 'game', 'index.ts'), 'utf8');
    expect(shim).toContain("from '../../../../game/round'");
    expect(SITE_FILES.some((f) => f.path.startsWith('src/game/'))).toBe(false);
  });
});
