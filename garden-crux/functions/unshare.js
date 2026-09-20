// functions/unshare.js — who shared it, or an owner or editor, takes it off the shelf.
export default async function (req, ctx) {
  const { cruxId } = (await req.json()) || {};
  if (!ctx.visitor) ctx.reject('Sign in first.', 401);
  const me = await ctx.store.get('members/' + ctx.visitor.id);
  const row = await ctx.store.get('cruxes/' + cruxId);
  if (!row) return { removed: false };
  const may = me && me.status === 'active' && (me.role === 'owner' || me.role === 'editor' || row.addedBy === ctx.visitor.id);
  if (!may) ctx.reject('Only who shared it, or an owner or editor, takes it off.', 403);
  await ctx.store.del('cruxes/' + cruxId);
  await ctx.emit('garden:unshared', { cruxId });
  return { removed: true };
}
