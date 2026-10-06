// functions/share.js — an active member puts one of their published cruxes on the shelf.
export default async function (req, ctx) {
  const { cruxId, title, url } = (await req.json()) || {};
  if (!ctx.visitor) ctx.reject('Sign in first.', 401);
  const me = await ctx.store.get('members/' + ctx.visitor.id);
  if (!me || me.status !== 'active') ctx.reject('Only members share here.', 403);
  if (!cruxId || !title || !/^https?:\/\//.test(String(url || ''))) ctx.reject('A crux needs an id, a title and its address.');
  const row = { cruxId, title: String(title).slice(0, 120), url, authorUsername: me.username, addedBy: ctx.visitor.id, at: ctx.now() };
  await ctx.store.set('cruxes/' + cruxId, row, 'public');
  await ctx.emit('garden:shared', { cruxId, title: row.title, by: me.username });
  return row;
}
