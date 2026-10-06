// functions/leave.js — a member leaves; the owner stays with the garden.
export default async function (req, ctx) {
  if (!ctx.visitor) ctx.reject('Sign in first.', 401);
  const me = await ctx.store.get('members/' + ctx.visitor.id);
  if (!me) return { left: false };
  if (me.role === 'owner') ctx.reject('The owner stays with the garden.');
  await ctx.store.del('members/' + ctx.visitor.id);
  await ctx.emit('garden:left', { authorId: ctx.visitor.id });
  return { left: true };
}
