#!/usr/bin/env node
/**
 * Build the Crux Tools this build ships (ADR 0050).
 *
 * Reads every `*-crux/crux-tool.json`, picks the tools whose manifest says
 * `bundled: true` — or all of them with CRUX_BUNDLE_TOOLS=all — and runs the
 * matching `build:<tool>` script for each, serially, the way the old
 * `prebuild` chain in package.json did for every tool on every build. Tools
 * without a build script vendor a prebuilt runtime and need nothing.
 *
 *   CRUX_BUNDLE_TOOLS=all       every tool (the publishing job, full verify)
 *   CRUX_BUNDLE_TOOLS=bundled   the starter set (default)
 *   CRUX_BUNDLE_TOOLS=none      no tool builds (fast host-only iteration)
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const mode = process.env.CRUX_BUNDLE_TOOLS || 'bundled';
const scripts = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts;

/** Manifest ids whose folder short name differs from their build script. */
const SCRIPT_ALIASES = { 'wick-editor': 'wick' };

export function bundledTools(dir = root, want = mode) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith('-crux')) continue;
    const file = join(dir, entry, 'crux-tool.json');
    if (!existsSync(file)) continue;
    const manifest = JSON.parse(readFileSync(file, 'utf8'));
    if (want === 'all' || (want === 'bundled' && manifest.bundled)) out.push(manifest);
  }
  return out.sort((a, b) => a.order - b.order);
}

function run(script) {
  console.log(`\n▶ npm run ${script}`);
  const r = spawnSync('npm', ['run', script], { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`prebuild: npm run ${script} failed`);
    process.exit(r.status ?? 1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // The Astro editors (Notes, Moqira) are always in the app.
  if (mode !== 'none') run('prepare:astro-editors');
  const tools = mode === 'none' ? [] : bundledTools();
  const names = [];
  for (const m of tools) {
    const short = m.id.replace(/-app$/, '');
    const script = `build:${SCRIPT_ALIASES[short] ?? short}`;
    if (scripts[script]) {
      run(script);
      names.push(m.id);
    }
  }
  console.log(`\nprebuild (${mode}): ${tools.length} tools in this build, ${names.length} built`);
}
