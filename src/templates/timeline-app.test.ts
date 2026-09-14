import { expect, it } from 'vitest';
import { loadTemplate } from './index';
it('packages TimelineJS: the page, the editor, the starter, the bridge, the validator, the licences and upstream’s build', async () => {
  const template = (await loadTemplate('timeline-app'))!;
  const paths = template.files.map((file) => file.path);
  for (const path of [
    'index.html',
    'style.css',
    'app.js',
    'timeline.json',
    'garden/bridge.js',
    'garden/document.js',
    'licenses/timelinejs-LICENSE.txt',
    'runtime/js/timeline.js',
    'runtime/js/locale/fr.json',
    'runtime/css/timeline.css',
    'runtime/css/icons/tl-icons.woff2',
    'runtime/css/fonts/font.default.css',
    'runtime/css/themes/timeline.theme.dark.css',
    'UPSTREAM.md',
    'data/project.json',
  ])
    expect(paths).toContain(path);
  expect(paths.some((p) => p.includes('.test.') || p.includes('node_modules') || p.endsWith('.map'))).toBe(false);
  expect(new Set(paths).size).toBe(paths.length);
  expect(template.files.find((f) => f.path === 'runtime/js/timeline.js')!.encoding).toBe('asset-url');
  expect(template.files.find((f) => f.path === 'runtime/css/timeline.css')!.encoding).toBeUndefined();
  expect(template.files.find((f) => f.path === 'runtime/css/timeline.css')!.content).toContain("url('icons/tl-icons.woff2')");
  expect(JSON.parse(template.files.find((f) => f.path === 'timeline.json')!.content).events).toHaveLength(4);
  expect((template.meta?.settings as { entryFile?: string })?.entryFile).toBe('index.html');
}, 60_000);
