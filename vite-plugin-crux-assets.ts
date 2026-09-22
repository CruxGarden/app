import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import type { Plugin } from 'vite';

/** Built tool files are portable bytes, not styles/modules for the Garden bundler to transform. */
export default function cruxAssets(): Plugin {
  const prefix = '\0crux-package-asset:';
  const paths = new Map<string, string>();
  return {
    name: 'crux-package-assets',
    enforce: 'pre',
    apply: 'build',
    async resolveId(source, importer) {
      if (!/[?&]url(?:&|$)/.test(source)) return;
      const resolved = await this.resolve(source, importer, { skipSelf: true });
      const path = resolved?.id.split('?')[0];
      if (!path || !/-crux\//.test(path)) return;
      // A .js virtual ID also keeps later CSS transform hooks away from this module.
      const id = prefix + encodeURIComponent(path) + '.js';
      paths.set(id, path);
      return id;
    },
    load(id) {
      const path = paths.get(id);
      if (!path) return;
      const ref = this.emitFile({
        type: 'asset',
        name: basename(path),
        source: readFileSync(path),
      });
      return `export default import.meta.ROLLUP_FILE_URL_${ref};`;
    },
  };
}
