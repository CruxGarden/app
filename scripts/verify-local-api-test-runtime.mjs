import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

const root = new URL('../', import.meta.url);
const json = async (path) => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const [app, electron, fixture, desktop] = await Promise.all([
  json('package.json'),
  json('electron/package.json'),
  json('node_modules/@cruxgarden/local-api/package.json'),
  json('electron/node_modules/@cruxgarden/local-api/package.json'),
]);
if (
  basename(app.devDependencies['@cruxgarden/local-api']) !==
    basename(electron.dependencies['@cruxgarden/local-api']) ||
  fixture.version !== desktop.version
)
  throw new Error(
    'Renderer tests and Electron must consume the same local API archive. Update both manifests/lockfiles and install both before verifying.',
  );
console.log(`Renderer fixture and desktop use the same API: ${fixture.version}`);
