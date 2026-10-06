import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { Plugin } from 'vite';

/** Collect the packages actually loaded by the renderer and its Vite workers. */
export default function notices(root: string): { main: Plugin; worker: () => Plugin } {
  const packages = new Set<string>();
  const collect = (id: string) => {
    const match = id.match(/^(.*\/node_modules\/(?:@[^/]+\/)?[^/]+)\//);
    if (match && existsSync(join(match[1]!, 'package.json'))) packages.add(match[1]!);
  };
  const worker = (): Plugin => ({
    name: 'crux-worker-notices',
    moduleParsed: ({ id }) => collect(id),
  });
  return {
    worker,
    main: {
      name: 'crux-renderer-notices',
      apply: 'build',
      buildStart: () => {
        packages.clear();
      },
      moduleParsed: ({ id }) => collect(id),
      generateBundle() {
        const fallbackDir = join(root, 'licenses/renderer');
        const fallbacks = JSON.parse(
          readFileSync(join(fallbackDir, 'sources.json'), 'utf8'),
        ) as Record<string, { version: string; file: string; sha256: string; source: string }>;
        const sections: string[] = [readFileSync(join(fallbackDir, 'Apache-2.0.txt'), 'utf8')];
        for (const dir of [...packages].sort()) {
          const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
          const files = readdirSync(dir)
            .filter(
              (name) =>
                /^(licen[cs]e|copying|notice)([.-]|$)/i.test(name) &&
                statSync(join(dir, name)).isFile(),
            )
            .sort();
          let texts = files.map((name) => readFileSync(join(dir, name), 'utf8'));
          if (!texts.length) {
            const fallback = fallbacks[pkg.name];
            if (!fallback || fallback.version !== pkg.version)
              this.error(`Review and supply upstream notices for ${pkg.name}@${pkg.version}`);
            const bytes = readFileSync(join(fallbackDir, fallback.file));
            if (createHash('sha256').update(bytes).digest('hex') !== fallback.sha256)
              this.error(`Notice hash mismatch: ${pkg.name}`);
            texts = [`Source: ${fallback.source}\n\n${bytes.toString('utf8')}`];
          }
          sections.push(
            `${pkg.name}@${pkg.version}\nDeclared license: ${JSON.stringify(pkg.license ?? pkg.licenses ?? 'unspecified')}\n\n${texts.join('\n\n')}`,
          );
        }
        this.emitFile({
          type: 'asset',
          fileName: 'THIRD-PARTY-NOTICES.txt',
          source:
            'Third-party renderer and worker notices. Each component retains its own license.\nGSAP uses its Standard No Charge license, not an OSI license.\nBundled Crux Tools carry separate notices in their files.\n\n' +
            sections.join('\n\n' + '='.repeat(72) + '\n\n'),
        });
      },
    },
  };
}
