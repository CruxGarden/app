import { build } from 'esbuild';
import { mkdir, readFile, writeFile, cp, readdir } from 'node:fs/promises';
import { resolve, dirname, relative, join } from 'node:path';
import { createHash } from 'node:crypto';
const entries = {
  excalidraw: `export {default as React} from 'react'; export {createRoot} from 'react-dom/client'; export {Excalidraw,exportToBlob,exportToSvg,serializeAsJSON} from '@excalidraw/excalidraw'; import '@excalidraw/excalidraw/index.css';`,
  univer: `export {createUniver,LocaleType,mergeLocales} from '@univerjs/presets'; export {UniverSheetsCorePreset} from '@univerjs/preset-sheets-core'; export {default as enUS} from '@univerjs/preset-sheets-core/locales/en-US'; import '@univerjs/preset-sheets-core/lib/index.css';`,
};
async function files(dir) {
  return (
    await Promise.all(
      (await readdir(dir, { withFileTypes: true })).map(async (x) =>
        x.isDirectory() ? files(join(dir, x.name)) : [join(dir, x.name)],
      ),
    )
  ).flat();
}
for (const [name, contents] of Object.entries(entries)) {
  const outdir = resolve(name, 'vendor');
  await mkdir(outdir, { recursive: true });
  const result = await build({
    stdin: { contents, resolveDir: process.cwd(), sourcefile: 'engine.js' },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    conditions: ['production'],
    define: { 'process.env.NODE_ENV': '"production"', 'process.env.IS_PREACT': '"false"' },
    minify: true,
    legalComments: 'eof',
    metafile: true,
    outdir,
    entryNames: 'engine',
    assetNames: 'assets/[name]-[hash]',
    loader: { '.woff2': 'file', '.woff': 'file', '.ttf': 'file', '.png': 'file', '.svg': 'file' },
  });
  if (name === 'excalidraw') {
    await cp('node_modules/@excalidraw/excalidraw/dist/prod/fonts', join(outdir, 'fonts'), {
      recursive: true,
    });
    await cp(
      'license-supplements/LiberationSans-Regular.woff2',
      join(outdir, 'fonts/Liberation/LiberationSans-Regular.woff2'),
    );
    await cp(
      'license-supplements/liberation-font-provenance.json',
      join(outdir, 'liberation-font-provenance.json'),
    );
  }
  const roots = new Set();
  for (const input of Object.keys(result.metafile.inputs)) {
    if (!input.includes('node_modules/')) continue;
    let folder = dirname(resolve(input));
    while (folder.includes('node_modules')) {
      try {
        const candidate = JSON.parse(await readFile(join(folder, 'package.json'), 'utf8'));
        if (!candidate.name) {
          folder = dirname(folder);
          continue;
        }
        roots.add(folder);
        break;
      } catch {}
      folder = dirname(folder);
    }
  }
  const notices = [];
  const supplements = {
    '@excalidraw/excalidraw': 'excalidraw',
    '@univerjs/protocol': 'univer-protocol',
    fastdom: 'fastdom',
    fuzzy: 'fuzzy',
    'react-remove-scroll-bar': 'react-remove-scroll-bar',
    'franc-min': 'franc-min',
    'ot-json1': 'ot-json1',
    'ot-text-unicode': 'ot-text-unicode',
    unicount: 'unicount',
  };
  for (const root of [...roots].sort()) {
    const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
    const texts = [];
    for (const file of await readdir(root))
      if (/^(license|licence|copying|notice)(\.|$)/i.test(file)) {
        try {
          texts.push(await readFile(join(root, file), 'utf8'));
        } catch {}
      }
    if (!texts.length) {
      const supplement = pkg.name.startsWith('@radix-ui/') ? 'radix' : supplements[pkg.name];
      if (!supplement) throw new Error(`Missing license text for ${pkg.name}`);
      texts.push(await readFile(`license-supplements/${supplement}.txt`, 'utf8'));
    }
    notices.push(
      `## ${pkg.name} ${pkg.version}\nLicense: ${pkg.license || 'See source'}\nSource: ${typeof pkg.repository === 'object' ? pkg.repository.url : pkg.repository || pkg.homepage || ''}\n\n${texts.join('\n\n')}`,
    );
  }
  if (name === 'excalidraw')
    for (const font of ['excalidraw-fonts', 'liberation-font'])
      notices.push(await readFile(`license-supplements/${font}.txt`, 'utf8'));
  await writeFile(join(outdir, 'THIRD-PARTY-NOTICES.md'), notices.join('\n\n'));
  const artifacts = {};
  for (const path of (await files(outdir)).sort()) {
    if (path.endsWith('/provenance.json')) continue;
    const bytes = await readFile(path);
    artifacts[relative(outdir, path)] = {
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    };
  }
  await writeFile(
    join(outdir, 'provenance.json'),
    JSON.stringify(
      {
        entry: contents,
        build: 'esbuild 0.25.12 production ESM; pinned npm lockfile; local fonts',
        artifacts,
      },
      null,
      2,
    ) + '\n',
  );
}
