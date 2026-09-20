// functions/on-order.js — after any order:* event, keep the rollup the page shows.
export const match = 'order:*';

export default async function (req, ctx) {
  const orders = (await ctx.store.list('orders/')).map((e) => e.value);
  const byStatus = {};
  const byItem = {};
  for (const o of orders) {
    byStatus[o.status] = (byStatus[o.status] || 0) + 1;
    byItem[o.item] = (byItem[o.item] || 0) + o.qty;
  }
  const summary = {
    total: orders.length,
    open: orders.filter((o) => o.status !== 'done').length,
    byStatus,
    byItem,
    updatedAt: ctx.now(),
  };
  await ctx.store.set('orders:summary', summary, 'public');
  return summary;
}
