import { copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const appRoot = fileURLToPath(new URL('../', import.meta.url));
// Copies travel with a Crux so its upstream source rebuilds independently.
// Edit the canonical files in embedded-apps/shared, never these generated copies.
for (const app of ['pptist', 'minipaint', 'jupyterlite', 'piskel', 'blockbench']) {
  const destination = join(appRoot, `${app}-crux/${app === 'piskel' ? 'src/' : ''}garden/shared`);
  mkdirSync(destination, { recursive: true });
  for (const file of [
    'command-session.js',
    'command-session.d.ts',
    'project-image.js',
    'project-image.d.ts',
  ]) {
    copyFileSync(join(appRoot, 'embedded-apps/shared', file), join(destination, file));
  }
}
