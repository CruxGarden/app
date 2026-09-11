import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { loadTemplate } from './index';
for (const [id, root] of [
  ['gephi-app', 'gephi-crux'],
  ['ketcher-app', 'ketcher-crux'],
  ['twine-app', 'twine-crux'],
  ['blockbench-app', 'blockbench-crux'],
  ['svgedit-app', 'svgedit-crux'],
  ['jupyterlite-app', 'jupyterlite-crux'],
  ['rawgraphs-app', 'rawgraphs-crux'],
  ['piskel-app', 'piskel-crux'],
  ['mermaid-app', 'mermaid-crux'],
  ['openmosh-app', 'openmosh-crux'],
  ['minipaint-app', 'minipaint-crux'],
]) {
  it(`${id} preserves CSS bytes and relative font/icon URLs in portable Cruxes`, async () => {
    const t = (await loadTemplate(id!))!;
    const styles = t.files.filter((f) => f.path.endsWith('.css'));
    expect(styles.length).toBeGreaterThan(0);
    for (const f of styles) {
      expect(f.encoding).not.toBe('asset-url');
      expect(f.content).toBe(readFileSync(resolve(root!, f.path), 'utf8'));
    }
  }, 30000);
}
