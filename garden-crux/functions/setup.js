// functions/setup.js — the owner names the garden (its card, kept in the Store as `garden`).
export default async function (req, ctx) {
  if (!ctx.visitor || !ctx.visitor.isOwner) ctx.reject('Only the owner names the garden.', 403);
  const { name, description } = (await req.json()) || {};
  const card = { name: String(name || 'A garden').trim().slice(0, 80), description: String(description || '').trim().slice(0, 500) };
  await ctx.store.set('garden', card, 'public');
  await ctx.emit('garden:named', card);
  return card;
}
