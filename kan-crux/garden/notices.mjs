import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
// Collect the license of every npm package that reached the built runtime, by
// walking the build's source maps back into node_modules.
const root = fileURLToPath(new URL('../', import.meta.url));
const packages = new Map();
function add(dir) {
  if (!existsSync(join(dir, 'package.json'))) return;
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  if (!pkg.name) return false;
  packages.set(dir, pkg);
  return true;
}
for (const name of readdirSync(join(root, 'runtime'), { recursive: true }).filter((n) =>
  n.endsWith('.map'),
)) {
  let map;
  try {
    map = JSON.parse(readFileSync(join(root, 'runtime', name), 'utf8'));
  } catch {
    continue;
  }
  for (const source of map.sources || []) {
    const pos = source.indexOf('node_modules/');
    if (pos < 0) continue;
    let dir = dirname(resolve(root, source.slice(pos)));
    while (dir.startsWith(join(root, 'node_modules'))) {
      if (existsSync(join(dir, 'package.json')) && add(dir)) break;
      dir = dirname(dir);
    }
  }
}
let text =
  'Kan local build dependency notices.\nUpstream Kan is licensed under the AGPL-3.0: see ../LICENSE. Modified source, the pinned lockfile and UPSTREAM.md accompany this runtime.\n';
for (const [dir, pkg] of [...packages].sort((a, b) => a[1].name.localeCompare(b[1].name))) {
  text += `\n=== ${pkg.name}@${pkg.version}: ${JSON.stringify(pkg.license || pkg.licenses || 'See source')} ===\n`;
  for (const name of readdirSync(dir).filter((n) => /^(license|licence|copying|notice)/i.test(n))) {
    if (statSync(join(dir, name)).isFile()) text += `\n${name}\n${readFileSync(join(dir, name), 'utf8')}\n`;
  }
}
writeFileSync(join(root, 'runtime/THIRD_PARTY_NOTICES.txt'), text);
console.log(`Included notices for ${packages.size} dependency packages.`);
for (const file of ['LICENSE', 'UPSTREAM.md'])
  writeFileSync(join(root, 'runtime', file), readFileSync(join(root, file)));
