// functions/whoami.js — who is asking, their membership, and the garden's card.
// The owner's own membership is written the first time the owner asks.
export default async function (req, ctx) {
  const garden = await ctx.store.get('garden');
  if (!ctx.visitor) return { me: null, garden };
  const body = (await req.json()) || {};
  let me = await ctx.store.get('members/' + ctx.visitor.id);
  if (!me && ctx.visitor.isOwner) {
    me = { authorId: ctx.visitor.id, username: String(body.username || ''), displayName: String(body.displayName || body.username || ''), role: 'owner', status: 'active', since: ctx.now(), invitedBy: null };
    await ctx.store.set('members/' + ctx.visitor.id, me, 'public');
  } else if (me && me.role === 'owner' && !me.username && body.username) {
    me = { ...me, username: String(body.username), displayName: String(body.displayName || body.username) };
    await ctx.store.set('members/' + ctx.visitor.id, me, 'public');
  }
  return { me, garden };
}
