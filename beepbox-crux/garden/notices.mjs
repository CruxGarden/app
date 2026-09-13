import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
// BeepBox bundles one runtime dependency (imperative-html); lamejs is served next
// to the editor for MP3 export instead of from a CDN. Their licenses travel with the runtime.
const root = fileURLToPath(new URL('../', import.meta.url));
let text = 'BeepBox local build dependency notices.\nUpstream BeepBox is licensed under the MIT license: see ../LICENSE.md. Modified source, the pinned lockfile and UPSTREAM.md accompany this runtime.\n';
for (const name of ['imperative-html', 'lamejs']) {
  const dir = join(root, 'node_modules', name);
  if (!existsSync(join(dir, 'package.json'))) continue;
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  text += `\n=== ${pkg.name}@${pkg.version}: ${JSON.stringify(pkg.license || 'See source')} ===\n`;
  for (const file of ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'COPYING'])
    if (existsSync(join(dir, file))) text += `\n${file}\n${readFileSync(join(dir, file), 'utf8')}\n`;
}
writeFileSync(join(root, 'website/THIRD_PARTY_NOTICES.txt'), text);
for (const file of ['LICENSE.md', 'UPSTREAM.md']) copyFileSync(join(root, file), join(root, 'website', file));
const lame = join(root, 'node_modules/lamejs/lame.min.js');
if (existsSync(lame)) copyFileSync(lame, join(root, 'website/lame.min.js'));
console.log('Wrote notices' + (existsSync(lame) ? ' and lame.min.js' : ''));
