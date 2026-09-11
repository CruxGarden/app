import { expect, it } from 'vitest';
import { loadTemplate } from './index';
it('packages the actual miniPaint app and rebuildable source', async () => {
  const template = (await loadTemplate('minipaint-app'))!;
  const paths = new Set(template.files.map((file) => file.path));
  for (const path of [
    'index.html',
    'runtime/bundle.js',
    'src/js/main.js',
    'src/js/modules/file/open.js',
    'src/js/modules/file/save.js',
    'src/js/garden/bridge.js',
    'garden/model.js',
    'package.json',
    'package-lock.json',
    '.babelrc',
    'webpack.config.js',
    'MIT-LICENSE.txt',
    'data/project.json',
  ])
    expect(paths.has(path), path).toBe(true);
}, 15000);
