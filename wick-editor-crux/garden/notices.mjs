import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
// Runtime dependency notices from the pinned lockfile's production dependencies.
const root = fileURLToPath(new URL('../', import.meta.url));
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
let text = 'Wick Editor local build dependency notices.\nUpstream Wick Editor is licensed under the GPL-3.0: see ../LICENSE.md; CREDITS.md lists its contributors and bundled libraries (engine corelibs: paper.js, Tone.js, howler and others under their own licenses). Modified source, the pinned lockfile and UPSTREAM.md accompany this runtime.\n';
for (const name of Object.keys(pkg.dependencies || {}).sort()) {
  const dir = join(root, 'node_modules', name);
  if (!existsSync(join(dir, 'package.json'))) continue;
  const dep = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  text += `\n=== ${dep.name}@${dep.version}: ${JSON.stringify(dep.license || 'See source')} ===\n`;
  for (const file of ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'license', 'COPYING'])
    if (existsSync(join(dir, file))) text += `\n${file}\n${readFileSync(join(dir, file), 'utf8')}\n`;
}
writeFileSync(join(root, 'runtime/THIRD_PARTY_NOTICES.txt'), text);
for (const file of ['LICENSE.md', 'CREDITS.md', 'UPSTREAM.md']) copyFileSync(join(root, file), join(root, 'runtime', file));
console.log('Wrote runtime notices.');
