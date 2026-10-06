import { expect, it } from 'vitest';
import { loadTemplate } from './index';
import { functionFiles } from '@/services/crux-functions';

it('packages the Garden: the page, crux.js, the functions that are the rules, the hook, the README', async () => {
  const template = (await loadTemplate('garden'))!;
  const paths = template.files.map((f) => f.path);
  for (const p of [
    'index.html',
    'style.css',
    'app.js',
    'crux.js',
    'README.md',
    'functions/NOTES.md',
  ])
    expect(paths).toContain(p);
  const fns = functionFiles(
    template.files.map((f) => ({ type: 'artifact', meta: { path: f.path } })) as never,
  );
  expect(fns.map((f) => f.name).sort()).toEqual([
    'accept',
    'invite',
    'leave',
    'members',
    'on-store',
    'post',
    'posts',
    'remove',
    'setup',
    'share',
    'shelf',
    'unshare',
    'whoami',
  ]);
  expect(template.skill).toBe('garden');
  expect(template.meta?.kind).toBe('garden');
  const hook = template.files.find((f) => f.path === 'functions/on-store.js')!.content;
  expect(hook).toContain("export const match = 'store:*'");
  for (const prefix of ['members', 'cruxes', 'posts']) expect(hook).toContain(prefix);
  const page = template.files.find((f) => f.path === 'app.js')!.content;
  expect(page).toContain('crux.directory(');
  expect(page).not.toMatch(/crux\.store\.set\(/);
});
