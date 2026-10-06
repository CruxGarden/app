// functions/on-store.js — a Store hook: the page may not write orders directly.
// Orders are placed with crux.fn('order') and moved with crux.fn('status'); a
// write from the page to orders/* or orders:* is refused before it lands.
// (Writes made by functions never come through here.)
export const match = 'store:*';

export default async function (req, ctx) {
  const { key } = ctx.event.data;
  if (key.startsWith('orders/') || key.startsWith('orders:'))
    ctx.reject('Orders are placed with crux.fn("order"), not written directly.', 403);
  return { allowed: key };
}
