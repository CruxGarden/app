#!/usr/bin/env node
/**
 * Run the Crux Tools' own suites for the tools this build ships (ADR 0050).
 *
 * The app's `verify` used to chain every tool's `test:<tool>` on every run,
 * which builds every upstream tree — 16 GB of node_modules on a CI runner.
 * Now it runs the suites of the bundled set (plus the app's own templates,
 * which are always in), and CRUX_BUNDLE_TOOLS=all runs the whole catalog —
 * the weekly job, or a developer touching a tool.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { bundledTools } from './prebuild.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const scripts = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts;
const mode = process.env.CRUX_BUNDLE_TOOLS || 'bundled';

/** Templates the app itself ships; they have suites but no manifest. */
const ALWAYS = ['notes', 'moqira', 'onebigsky', 'cardinal', 'tool-sampler', 'digital-garden'];
const SCRIPT_ALIASES = { 'wick-editor': 'wick', 'am-1': 'am1' };

const names = [...ALWAYS];
for (const m of bundledTools(root, mode)) {
  const short = m.id.replace(/-app$/, '');
  names.push(SCRIPT_ALIASES[short] ?? short);
}
const suites = names.map((n) => `test:${n}`).filter((s) => scripts[s]);
console.log(`verify-tools (${mode}): ${suites.length} suites\n  ${suites.join(' ')}`);
for (const script of suites) {
  console.log(`\n▶ npm run ${script}`);
  const r = spawnSync('npm', ['run', script], { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`verify-tools: npm run ${script} failed`);
    process.exit(r.status ?? 1);
  }
}
