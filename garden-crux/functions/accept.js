// functions/accept.js — the invited person says yes. Nobody joins a garden without this.
export default async function (req, ctx) {
  if (!ctx.visitor) ctx.reject('Sign in first.', 401);
  const me = await ctx.store.get('members/' + ctx.visitor.id);
  if (!me) ctx.reject('You have not been invited here.', 404);
  if (me.status === 'active') return me;
  const body = (await req.json()) || {};
  const row = { ...me, status: 'active', since: ctx.now(), username: body.username || me.username, displayName: body.displayName || me.displayName };
  await ctx.store.set('members/' + ctx.visitor.id, row, 'public');
  await ctx.emit('garden:joined', { authorId: row.authorId, username: row.username });
  return row;
}
