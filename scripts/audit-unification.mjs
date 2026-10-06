import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// Static inventory only: no application startup, database or secret reads.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ledger = JSON.parse(
  readFileSync(resolve(root, 'src/test/fixtures/unification/settings-ledger.json'), 'utf8'),
);
const output = resolve(root, 'docs/unification/persistence-inventory.json');
const keys = new Map();
const sql = [];
function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory())
      return ['test', 'generated', 'node_modules'].includes(entry.name) ? [] : files(path);
    return /\.(ts|tsx)$/.test(path) && !/\.(test|spec)\./.test(path) ? [path] : [];
  });
}
for (const path of [
  ...files(resolve(root, 'src')),
  ...files(resolve(root, 'electron/src')),
].sort()) {
  const file = relative(root, path);
  const source = ts.createSourceFile(
    file,
    readFileSync(path, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const visit = (node) => {
    // Covers direct constants and interpolated SQL/key prefixes. Comments are
    // excluded by the parser. Dynamically assembled nonliteral keys need review.
    if (
      ts.isStringLiteralLike(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      for (const match of node.text.matchAll(/cruxgarden:[A-Za-z0-9:_-]+/g)) {
        if (!keys.has(match[0])) keys.set(match[0], new Set());
        keys.get(match[0]).add(file);
      }
    }
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ['run', 'exec', 'prepare'].includes(node.expression.name.text)
    ) {
      const argument = node.arguments[0];
      if (argument) {
        const expression = argument.getText(source).replace(/\s+/g, ' ');
        if (/\b(?:INSERT|UPDATE|DELETE|REPLACE|ALTER|CREATE|DROP)\b/i.test(expression)) {
          sql.push({ file, method: node.expression.getText(source), statement: expression });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}
const missing = [];
const settings = [...keys]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([key, sources]) => {
    const entry =
      ledger.entries.find((entry) => entry.key === key) ??
      ledger.entries.find((entry) => entry.prefix && key.startsWith(entry.prefix));
    if (!entry) missing.push(key);
    return { key, sources: [...sources].sort(), ledger: entry?.key ?? entry?.prefix ?? null };
  });
if (missing.length)
  throw new Error(`Classify new persistence keys before proceeding: ${missing.join(', ')}`);
const report =
  JSON.stringify(
    {
      version: 1,
      scope:
        'Literal cruxgarden keys and literal mutation SQL in app src + electron/src; excludes tests/generated sources. Not a transitive writer/callgraph audit. Dynamic wrappers, per-Crux metadata, files, secrets and external services require separate review.',
      settings,
      literalSqlMutations: sql,
    },
    null,
    2,
  ) + '\n';
if (process.argv.includes('--write')) {
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, report);
} else if (readFileSync(output, 'utf8') !== report) {
  throw new Error(
    'Persistence inventory changed. Review ownership and regenerate with npm run audit:unification -- --write.',
  );
}
console.log(
  `Unification inventory: ${settings.length} literal keys/prefixes, ${sql.length} literal SQL mutation sites; all keys classified.`,
);
