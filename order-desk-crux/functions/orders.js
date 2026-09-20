// functions/orders.js — the queue, newest last, with the rollup on-order.js keeps.
export default async function (req, ctx) {
  const entries = await ctx.store.list('orders/');
  const orders = entries.map((e) => e.value).sort((a, b) => a.id.localeCompare(b.id));
  const summary = await ctx.store.get('orders:summary');
  return { orders, summary };
}
