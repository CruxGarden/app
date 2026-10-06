// functions/status.js — the owner moves an order along: new → printing → ready → done.
const STEPS = ['new', 'printing', 'ready', 'done'];

export default async function (req, ctx) {
  if (!ctx.visitor || !ctx.visitor.isOwner) ctx.reject('Only the desk can change an order.', 403);
  const { id, status } = (await req.json()) || {};
  if (!STEPS.includes(status)) ctx.reject('Status is one of ' + STEPS.join(', ') + '.');
  const order = await ctx.store.get('orders/' + id);
  if (!order) ctx.reject('No order #' + id + '.', 404);
  const updated = { ...order, status, updatedAt: ctx.now() };
  await ctx.store.set('orders/' + id, updated, 'public');
  await ctx.emit('order:updated', updated);
  return updated;
}
