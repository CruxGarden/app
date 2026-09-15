import { expect, it } from 'vitest';
import { loadTemplate } from './index';
it('packages the calendar organizer: the EventCalendar bundle with license and reference, the form, the bridge', async () => {
  const template = (await loadTemplate('eventcalendar-app'))!;
  const paths = template.files.map((file) => file.path);
  for (const path of [
    'index.html',
    'style.css',
    'organizer.js',
    'vendor/event-calendar.min.js',
    'vendor/event-calendar.min.css',
    'vendor/LICENSE',
    'vendor/README.md',
    'garden/bridge.js',
    'garden/document.js',
    'garden/commands.js',
    'garden/shared/command-session.js',
    'UPSTREAM.md',
    '.cruxignore',
    'data/project.json',
  ])
    expect(paths).toContain(path);
  expect(new Set(paths).size).toBe(paths.length);
  expect(template.files.every((f) => f.encoding !== 'asset-url')).toBe(true);
  expect(paths.some((p) => p.endsWith('.map'))).toBe(false);
  expect((template.meta?.settings as { entryFile?: string } | undefined)?.entryFile).toBe(
    'index.html',
  );
});
