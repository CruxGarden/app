// functions/order.js — place an order: validate, number it, store it, announce it.
// The page calls crux.fn('order', { name, item, qty, note }).
const ITEMS = ['A3 poster', 'Greeting card (pack of 5)', 'Business cards (100)', 'Sticker sheet'];

export default async function (req, ctx) {
  const body = (await req.json()) || {};
  const name = String(body.name || '').trim();
  const item = String(body.item || '').trim();
  const qty = Number(body.qty);
  const note = String(body.note || '').trim().slice(0, 140);
  if (!name || name.length > 60) ctx.reject('Tell the desk your name (up to 60 characters).');
  if (!ITEMS.includes(item)) ctx.reject('Pick an item from the menu.');
  if (!Number.isInteger(qty) || qty < 1 || qty > 50) ctx.reject('Quantity is 1 to 50.');

  // Order numbers come from an atomic counter: two orders never share one.
  const n = await ctx.store.increment('orders:next', 1, 'public');
  const id = String(n).padStart(4, '0');
  const order = {
    id,
    name,
    item,
    qty,
    note,
    status: 'new',
    placedBy: ctx.visitor ? ctx.visitor.id : null,
    at: ctx.now(),
  };
  await ctx.store.set('orders/' + id, order, 'public');
  ctx.log('order', id, qty + ' × ' + item, 'for', name);
  await ctx.emit('order:placed', order);
  return order;
}
