/** One source Crux; two static mounts. Generated output is never a source Artifact. */
import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runNpm } from './run-npm.mjs';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const project = join(root, 'documentation-crux');
const dist = join(project, 'dist');
function build(base, extra) {
  const result = runNpm(['run', 'build'], {
    cwd: project,
    stdio: 'inherit',
    env: { ...process.env, CRUX_DOCS_BASE: base, CRUX_DOCS_APP_LINKS: '1', ...extra },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
function replace(source, target) {
  rmSync(target, { recursive: true, force: true });
  cpSync(source, target, { recursive: true });
}
const routing = spawnSync(process.execPath, ['--test', 'infra/public-site-router.test.mjs'], {
  cwd: root,
  stdio: 'inherit',
});
if (routing.status !== 0) process.exit(routing.status ?? 1);
// The journal is a custom Astro layout, using the same content/style project.
build('/', { CRUX_DOCS_GUIDE_BASE: '/docs' });
replace(join(dist, 'blog'), join(root, 'public/blog'));
// Keep its root assets under their own prefix, rather than mix with Vite assets.
replace(join(dist, '_astro'), join(root, 'public/_astro'));
cpSync(join(dist, 'mark.svg'), join(root, 'public/mark.svg'));
build('/docs', { CRUX_DOCS_BLOG_BASE: '/blog' });
replace(dist, join(root, 'public/docs'));
// Include upstream notices with the built publication as well as editable source.
mkdirSync(join(root, 'public/docs/licenses'), { recursive: true });
for (const name of ['LICENSE', 'UPSTREAM.md'])
  cpSync(join(project, name), join(root, 'public/docs/licenses', name));
writeFileSync(
  join(root, 'public/docs/build.json'),
  JSON.stringify({
    title: 'Crux Garden field guide',
    source: 'documentation-crux',
    starlight: JSON.parse(readFileSync(join(project, 'package.json'))).dependencies[
      '@astrojs/starlight'
    ],
  }) + '\n',
);
