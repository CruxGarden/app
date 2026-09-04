import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { GARDEN_DARK } from './garden-dark';

/**
 * Every Mood token must reach a pixel: its CSS variable has to be consumed
 * somewhere outside the token definitions (globals.css, a component, the
 * Monaco theme, the per-pane derivations). A token nothing reads is a lie in
 * the Mood Builder and in set_theme.
 */
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|css)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}
const kebab = (k: string) => k.replace(/([A-Z])/g, (m) => '-' + m.toLowerCase());

describe('token coverage', () => {
  it('every token is consumed by CSS or a component', () => {
    const root = join(__dirname, '..', '..');
    const files = walk(root).filter(
      (f) =>
        !f.endsWith('garden-dark.ts') &&
        !f.endsWith('token-groups.ts') &&
        !f.includes('/moods/presets'),
    );
    const corpus = files.map((f) => readFileSync(f, 'utf8')).join('\n');
    const tokenValues = Object.values(GARDEN_DARK).join('\n');
    // Background animations read their tokens through template names (`--bloom-${i}`, `--star-…`)
    const dynamic =
      /^(bloom\d|bloom(Opacity|Blur|Speed)|star[A-Z]\w*|drift[A-Z]\w*|flow(Speed|Color|Bg))$/;
    // Per-pane tokens are rebound by pattern in globals.css (.pane-<name> { --panel: var(--pane-<name>-body) … })
    // and read in TopBar via template strings, so they are checked by their generic suffix instead.
    const paneRe =
      /^pane(Collaboration|Artifacts|Workshop|Details|History|Export|Sync|Publish|Store)([A-Z].*)$/;
    const dead = Object.keys(GARDEN_DARK).filter((k) => {
      if (dynamic.test(k)) return false;
      const pane = paneRe.exec(k);
      if (pane) {
        const suffix = kebab(pane[2]!);
        return (
          !corpus.includes(`-${suffix.replace(/^-/, '')})`) &&
          !corpus.includes(`${suffix.replace(/^-/, '')}\``)
        );
      }
      const v = `--${kebab(k)}`;
      // consumed as var(--x), as a Tailwind utility mapping, read at runtime by name
      // (getPropertyValue('--x') / readCSSVar('--x')), referenced by another token's
      // value, or by key in a theme derivation
      return (
        !corpus.includes(`var(${v})`) &&
        !corpus.includes(`${v})`) &&
        !corpus.includes(`${v}'`) &&
        !corpus.includes(`${v}"`) &&
        !tokenValues.includes(`var(${v})`) &&
        !corpus.includes(`'${k}'`) &&
        !corpus.includes(`"${k}"`)
      );
    });
    expect(dead, `tokens nothing reads:\n${dead.join('\n')}`).toEqual([]);
  });
});
