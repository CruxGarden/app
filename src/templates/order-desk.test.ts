import { expect, it } from 'vitest';
import { loadTemplate } from './index';
import { functionFiles } from '@/services/crux-functions';

it('packages the Order Desk: the page, crux.js, seven functions and the README', async () => {
  const template = (await loadTemplate('order-desk'))!;
  const paths = template.files.map((f) => f.path);
  for (const p of ['index.html', 'style.css', 'app.js', 'crux.js', 'README.md'])
    expect(paths).toContain(p);
  const fns = functionFiles(
    template.files.map((f) => ({ type: 'artifact', meta: { path: f.path } })) as never,
  );
  expect(fns.map((f) => f.name).sort()).toEqual([
    'menu',
    'on-order',
    'on-store',
    'order',
    'orders',
    'status',
    'whoami',
  ]);
  expect(fns.filter((f) => f.kind === 'event').map((f) => f.event)).toEqual(['order', 'store']);
  expect(template.skill).toBe('order-desk');
  expect(template.context).toBeUndefined();
  const page = template.files.find((f) => f.path === 'index.html')!.content;
  expect(page).toContain('<script src="crux.js"></script>');
  // The menu and the validator agree on the items.
  const menu = template.files.find((f) => f.path === 'functions/menu.js')!.content;
  const order = template.files.find((f) => f.path === 'functions/order.js')!.content;
  for (const item of [...menu.matchAll(/name: '([^']+)'/g)].map((m) => m[1]))
    expect(order).toContain(`'${item}'`);
});
