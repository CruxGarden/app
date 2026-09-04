import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { GARDEN_DARK } from './garden-dark';

/**
 * Every Mood token must reach a pixel. For each key in GARDEN_DARK, the CSS
 * variable `--kebab-key` has to be consumed somewhere outside the token
 * definitions (garden-dark, token-groups, presets, bundled Moods), by one of:
 *
 *   - `var(--x)` inside a CSS rule or an inline style / arbitrary utility
 *     (`rounded-[var(--x)]`) — comments are stripped first, so a mention in
 *     prose does not count;
 *   - a runtime read by name: `getPropertyValue('--x')`, `readCSSVar('--x')`;
 *   - a Tailwind utility generated from its `@theme` mapping. The mapping
 *     itself (`--color-x: var(--x)`) is NOT consumption: `--color-x` counts
 *     only if `bg-x` / `text-x` / `border-x` / `ring-x` / … appears in a
 *     .ts/.tsx file, `--radius-x` needs `rounded-x`, `--shadow-x` needs
 *     `shadow-x`, `--font-x` needs `font-x`, `--text-x` needs `text-x`;
 *   - another token's value (`fooBorder: 'var(--border)'` consumes `--border`);
 *   - for per-pane tokens, the generic suffix rebound in globals.css
 *     (`.pane-<name> { --panel: var(--pane-<name>-body) }`) or read in TopBar
 *     through a template string;
 *   - two named exceptions read by key rather than by variable: background
 *     animation tokens (`--bloom-${i}` …) and the font-face slots
 *     (`FONT_FACE_FAMILIES` in lib/moods/assets.ts).
 *
 * A bare `'tokenKey'` string literal is NOT consumption (it matched generic
 * words like 'title' or 'link'), and neither is a mention inside a comment.
 *
 * A token nothing reads is a lie in the Mood Builder and in set_theme.
 */

const SRC = join(__dirname, '..', '..');
// Presets and bundled Moods stay in the corpus: a preset value such as
// `syntaxString: 'var(--pane-details)'` is a real consumer of that token.
const DEFINITIONS = ['/lib/moods/garden-dark.ts', '/lib/moods/token-groups.ts'];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|css)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

const kebab = (k: string) => k.replace(/([A-Z])/g, (m) => '-' + m.toLowerCase());
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Drop comments so a token named in prose does not count. CSS: every block
// comment. TS/TSX: docblocks and block comments that start a line, JSX comment
// expressions, and `//` line comments that are not part of a URL. (A blanket
// block-comment regex would also eat the code between a glob such as '**/*'
// and the next comment close.)
function stripComments(src: string, css: boolean): string {
  if (css) return src.replace(/\/\*[\s\S]*?\*\//g, '');
  return src
    .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

/** `@theme inline { … }` from globals.css: utility mappings, and the rest of the file. */
function splitTheme(css: string): { theme: string; rules: string } {
  const start = css.indexOf('@theme');
  if (start < 0) return { theme: '', rules: css };
  const open = css.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) {
      return { theme: css.slice(open + 1, i), rules: css.slice(0, start) + css.slice(i + 1) };
    }
  }
  return { theme: css.slice(open + 1), rules: css.slice(0, start) };
}

type Kind = 'color' | 'radius' | 'shadow' | 'font' | 'text';
const VARIANTS = String.raw`(?:[\w\[\]=/-]+:)*`;
const utilityRe = (kind: Kind, name: string): RegExp => {
  const n = esc(name);
  const stem = {
    color: String.raw`(?:bg|text|border(?:-[xytrblse])?|ring(?:-offset)?|inset-ring|outline|accent|fill|stroke|divide|caret|decoration|shadow|inset-shadow|from|via|to|placeholder)`,
    radius: String.raw`rounded(?:-(?:t|r|b|l|tl|tr|br|bl|s|e|ss|se|ee|es))?`,
    shadow: String.raw`(?:shadow|inset-shadow|drop-shadow|text-shadow)`,
    font: 'font',
    text: 'text',
  }[kind];
  return new RegExp(String.raw`(?<![\w-])${VARIANTS}${stem}-${n}(?![\w-])`);
};

describe('token coverage', () => {
  const files = walk(SRC).filter((f) => !DEFINITIONS.some((d) => f.endsWith(d)));
  let cssRules = '';
  let themeBlock = '';
  let tsCorpus = '';
  for (const f of files) {
    const raw = readFileSync(f, 'utf8');
    if (f.endsWith('.css')) {
      const { theme, rules } = splitTheme(stripComments(raw, true));
      themeBlock += theme + '\n';
      cssRules += rules + '\n';
    } else {
      tsCorpus += stripComments(raw, false) + '\n';
    }
  }
  const ALIAS =
    /^\s*--(?:color|radius|shadow|font|text)-[a-z0-9-]+\s*:\s*var\(--[a-z0-9-]+\)\s*;\s*$/;
  const themeRules = themeBlock
    .split('\n')
    .filter((l) => !ALIAS.test(l))
    .join('\n');
  const corpus = cssRules + themeRules + tsCorpus;
  const tokenValues = Object.values(GARDEN_DARK).join('\n');

  // `--color-foo: var(--foo)` → utilities for --foo: [{ kind: 'color', name: 'foo' }]
  const mappings = new Map<string, { kind: Kind; name: string }[]>();
  for (const m of themeBlock.matchAll(
    /--(color|radius|shadow|font|text)-([a-z0-9-]+)\s*:\s*var\((--[a-z0-9-]+)\)/g,
  )) {
    const [, kind, name, token] = m as unknown as [string, Kind, string, string];
    const list = mappings.get(token) ?? [];
    list.push({ kind, name });
    mappings.set(token, list);
  }

  // Background animations read their tokens through template names (`--bloom-${i}`, `--star-…`)
  const dynamic =
    /^(bloom\d|bloom(Opacity|Blur|Speed)|star[A-Z]\w*|drift[A-Z]\w*|flow(Speed|Color|Bg))$/;
  // Per-pane tokens are rebound by pattern in globals.css and read in TopBar via template strings.
  const paneRe =
    /^pane(Collaboration|Artifacts|Workshop|Details|History|Export|Sync|Publish|Store)([A-Z].*)$/;

  // Font-face slots are read by key: lib/moods/assets.ts maps them to the
  // @font-face family it registers (FONT_FACE_FAMILIES), not to a CSS variable.
  const byKey = /^fontFace(Display|Body|Mono)$/;

  const consumed = (k: string): boolean => {
    if (dynamic.test(k) || byKey.test(k)) return true;
    const pane = paneRe.exec(k);
    if (pane) {
      const suffix = kebab(pane[2]!).replace(/^-/, '');
      return corpus.includes(`-${suffix})`) || corpus.includes(`${suffix}\``);
    }
    const v = `--${kebab(k)}`;
    if (corpus.includes(`var(${v})`)) return true;
    if (tokenValues.includes(`var(${v})`)) return true;
    if (tsCorpus.includes(`'${v}'`) || tsCorpus.includes(`"${v}"`) || tsCorpus.includes(`\`${v}\``))
      return true;
    const self = /^--(color|radius|shadow|font|text)-([a-z0-9-]+)$/.exec(v);
    const utilities = [...(mappings.get(v) ?? [])];
    if (self) utilities.push({ kind: self[1] as Kind, name: self[2]! });
    for (const { kind, name } of utilities) {
      if (utilityRe(kind, name).test(tsCorpus)) return true;
      if (corpus.includes(`var(--${kind}-${name})`)) return true;
    }
    return false;
  };

  it('finds the @theme mappings', () => {
    expect(mappings.size).toBeGreaterThan(100);
  });

  it('every token is consumed by CSS or a component', () => {
    const dead = Object.keys(GARDEN_DARK).filter((k) => !consumed(k));
    expect(dead, `tokens nothing reads:\n${dead.join('\n')}`).toEqual([]);
  });

  it('every @theme mapping points at a defined token', () => {
    const defined = new Set(Object.keys(GARDEN_DARK).map((k) => `--${kebab(k)}`));
    // Tokens set on :root by CSS itself (not Mood tokens) are fine to map as well.
    const rootVars = new Set([...cssRules.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]!));
    const orphans = [...mappings.keys()].filter((t) => !defined.has(t) && !rootVars.has(t));
    expect(orphans, `@theme maps variables no token defines:\n${orphans.join('\n')}`).toEqual([]);
  });
});
