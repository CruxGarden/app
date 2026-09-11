import { build } from 'esbuild';
import { mkdir, copyFile, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const entries = {
  smplr: 'export { Sampler, Sequencer } from "smplr";',
  playcanvas: 'export * from "playcanvas";',
  tables: 'export { TabulatorFull as Tabulator } from "tabulator-tables";',
};
const provenance = {};
const packages = { smplr: 'smplr', playcanvas: 'playcanvas', tables: 'tabulator-tables' };
for (const [name, contents] of Object.entries(entries)) {
  await mkdir(`${name}/vendor`, { recursive: true });
  const outfile = `${name}/vendor/engine.js`;
  if (name === 'playcanvas')
    await copyFile('node_modules/playcanvas/build/playcanvas.min.mjs', outfile);
  else
    await build({
      stdin: { contents, resolveDir: process.cwd() },
      bundle: true,
      format: 'esm',
      minify: true,
      legalComments: 'eof',
      outfile: resolve(outfile),
    });
  const bytes = await readFile(outfile);
  const pkg = JSON.parse(await readFile(`node_modules/${packages[name]}/package.json`, 'utf8'));
  provenance[name] = {
    package: packages[name],
    version: pkg.version,
    license: pkg.license,
    repository: pkg.repository,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    build:
      name === 'playcanvas'
        ? 'Upstream build/playcanvas.min.mjs, copied unchanged'
        : 'esbuild 0.25.12, bundle ESM, minify, legalComments eof',
    entry: contents,
  };
  await writeFile(
    `${name}/vendor/provenance.json`,
    JSON.stringify(provenance[name], null, 2) + '\n',
  );
}
await copyFile(
  'node_modules/tabulator-tables/dist/css/tabulator_midnight.min.css',
  'tables/vendor/engine.css',
);
for (const [name, pkg] of [
  ['playcanvas', 'playcanvas'],
  ['tables', 'tabulator-tables'],
]) {
  await copyFile(`node_modules/${pkg}/LICENSE`, `${name}/vendor/LICENSE`);
}
await writeFile('runtime-provenance.json', JSON.stringify(provenance, null, 2) + '\n');

await import('./productivity-build.mjs');
