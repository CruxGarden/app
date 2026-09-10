import { build } from 'esbuild';
import { readFile, writeFile, mkdir, mkdtemp, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const source = resolve(process.argv[2]);
const pin = 'f49c27bb6bd475efe6db0c1596d6d65362e4ee90';
if (execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() !== pin)
  throw new Error('Use the pinned OpenMosh source revision.');
const temp = await mkdtemp(join(tmpdir(), 'crux-openmosh-extract-'));
const output = join(temp, 'effects.mjs');
await build({
  entryPoints: [join(source, 'src/lib/gl/effect-shaders.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: output,
});
const upstream = await import(pathToFileURL(output).href);
const { EFFECTS } = await import('../shared/model.js');
const shaders = { vertex: upstream.VERTEX_SHADER, passthrough: upstream.PASSTHROUGH_FRAG };
for (const key of Object.keys(EFFECTS)) shaders[key] = upstream.EFFECT_SHADERS[key].fragment;
const dest = fileURLToPath(new URL('../openmosh/vendor/', import.meta.url));
await mkdir(dest, { recursive: true });
await writeFile(join(dest, 'effects.json'), JSON.stringify(shaders, null, 2) + '\n');
await copyFile(join(source, 'LICENSE'), join(dest, 'LICENSE'));
await writeFile(
  join(dest, 'provenance.json'),
  JSON.stringify(
    {
      repository: 'https://github.com/zivavu/OpenMosh',
      revision: pin,
      file: 'src/lib/gl/effect-shaders.ts',
      effects: Object.keys(EFFECTS),
      note: 'Selected original GLSL fragments; no upstream UI, BPM, media exporter, fonts or other shaders are included.',
    },
    null,
    2,
  ) + '\n',
);
