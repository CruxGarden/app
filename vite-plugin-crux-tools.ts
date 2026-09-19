import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';

/**
 * `virtual:crux-tools` — which Crux Tools this build carries (ADR 0050).
 *
 * Every tool's manifest is always compiled in (they are small, and the
 * picker lists installable tools too). What this decides is whose
 * *template module* — the file globs that pull a tool's runtime into the
 * bundle — is included: the manifests with `bundled: true`, or all of them
 * with CRUX_BUNDLE_TOOLS=all, or none with `none`. The dev server and Vitest
 * see every tool, because a developer working on one should not have to
 * flip a switch to open it.
 */
export default function cruxTools(root: string): Plugin {
  const id = 'virtual:crux-tools';
  const resolved = '\0' + id;
  let command: 'build' | 'serve' = 'build';
  return {
    name: 'crux-tools',
    configResolved(config) {
      command = config.command;
    },
    resolveId(source) {
      return source === id ? resolved : null;
    },
    load(source) {
      if (source !== resolved) return null;
      const mode =
        command === 'serve' || process.env.VITEST
          ? 'all'
          : process.env.CRUX_BUNDLE_TOOLS || 'bundled';
      const ids: string[] = [];
      for (const entry of readdirSync(root).sort()) {
        if (!entry.endsWith('-crux')) continue;
        const file = join(root, entry, 'crux-tool.json');
        if (!existsSync(file)) continue;
        const manifest = JSON.parse(readFileSync(file, 'utf8')) as {
          id: string;
          bundled?: boolean;
        };
        if (mode === 'all' || (mode === 'bundled' && manifest.bundled)) ids.push(manifest.id);
      }
      const loaders = ids
        .map(
          (tid) =>
            `  ${JSON.stringify(tid)}: () => import(${JSON.stringify(`/src/templates/${tid}.ts`)}),`,
        )
        .join('\n');
      return `export const bundled = ${JSON.stringify(ids)};\nexport const loaders = {\n${loaders}\n};\n`;
    },
  };
}
