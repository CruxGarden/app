#!/usr/bin/env node
/**
 * The public website must not reach the authoring tree.
 *
 * crux.garden is built from `site/`, which shares components with the desktop
 * app through `src/`. What keeps that build fast is not the entry file being
 * small — it is that nothing in its import graph reaches `src/templates/` or a
 * vendored `*-crux/` package. Those pull two dozen upstream toolchains in with
 * them, and the earlier whole-app public build exhausted Node's heap on CI for
 * exactly that reason.
 *
 * One import is all it takes to bring it back, so this walks the graph and
 * names the chain instead of letting a build discover it the hard way.
 */
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = path.join(root, 'site', 'main.tsx');
const FORBIDDEN = [/^src\/templates\//, /^[a-z0-9-]+-crux\//];
const EXTENSIONS = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx'];

/** Import and re-export specifiers, ignoring `import type`. */
function specifiers(source) {
  const found = [];
  const re =
    /(?:^|\n)\s*(?:import|export)\s+(?!type\s)(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const m of source.matchAll(re)) found.push(m[1] ?? m[2]);
  return found;
}

function resolve(spec, fromFile) {
  let base;
  if (spec.startsWith('@/')) base = path.join(root, 'src', spec.slice(2));
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(fromFile), spec);
  else return null; // a package, not ours
  for (const ext of EXTENSIONS) {
    const candidate = base + ext;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

const seen = new Set();
const offenders = [];

function walk(file, chain) {
  if (seen.has(file)) return;
  seen.add(file);
  const rel = path.relative(root, file);
  if (FORBIDDEN.some((re) => re.test(rel))) {
    offenders.push([...chain, rel]);
    return; // report the boundary, do not descend into it
  }
  if (!/\.(ts|tsx|js|jsx)$/.test(file)) return;
  let source;
  try {
    source = readFileSync(file, 'utf8');
  } catch {
    return;
  }
  for (const spec of specifiers(source)) {
    const target = resolve(spec, file);
    if (target) walk(target, [...chain, rel]);
  }
}

walk(ENTRY, []);

if (offenders.length) {
  console.error('\nThe public website reaches the authoring tree:\n');
  for (const chain of offenders.slice(0, 5)) {
    console.error('  ' + chain.join('\n    → '));
    console.error('');
  }
  console.error(
    `${offenders.length} path(s). Keep ${path.relative(root, ENTRY)} clear of src/templates/ and *-crux/,\n` +
      'or crux.garden goes back to building every embedded app.\n',
  );
  process.exit(1);
}
console.log(`site graph clean — ${seen.size} modules, no authoring tree`);
