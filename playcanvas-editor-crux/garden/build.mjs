import { cpSync, mkdirSync, rmSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const root = new URL('../', import.meta.url);
execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'production' }
});
const runtime = new URL('runtime/', root);
rmSync(runtime, { recursive: true, force: true });
mkdirSync(runtime);
cpSync(new URL('dist/', root), runtime, { recursive: true });
mkdirSync(new URL('garden/', runtime));
for (const name of ['bootstrap.js', 'bridge.js', 'config.js', 'schema.js', 'model.js', 'launch.js'])
    copyFileSync(new URL('garden/' + name, root), new URL('garden/' + name, runtime));
copyFileSync(new URL('garden/launch.html', root), new URL('launch.html', runtime));
copyFileSync(new URL('garden/index.html', root), new URL('index.html', runtime));
for (const name of ['playcanvas.js', 'playcanvas.d.ts'])
    copyFileSync(new URL('node_modules/playcanvas/build/' + name, root), new URL('js/' + name, runtime));
copyFileSync(new URL('LICENSE', root), new URL('LICENSE', runtime));
copyFileSync(new URL('UPSTREAM.md', root), new URL('UPSTREAM.md', runtime));

await import('./notices.mjs');
