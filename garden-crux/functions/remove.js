// functions/remove.js — the owner removes someone (or withdraws an invitation).
export default async function (req, ctx) {
  const { authorId } = (await req.json()) || {};
  if (!ctx.visitor || !ctx.visitor.isOwner) ctx.reject('Only the owner removes people.', 403);
  const them = await ctx.store.get('members/' + authorId);
  if (!them) return { removed: false };
  if (them.role === 'owner') ctx.reject('The owner stays with the garden.');
  await ctx.store.del('members/' + authorId);
  await ctx.emit('garden:left', { authorId });
  return { removed: true };
}
