// functions/invite.js — an owner or editor invites a person from the directory; they are "invited" until they accept.
export default async function (req, ctx) {
  const { authorId, username, displayName, role } = (await req.json()) || {};
  if (!ctx.visitor) ctx.reject('Sign in first.', 401);
  const me = await ctx.store.get('members/' + ctx.visitor.id);
  if (!me || me.status !== 'active' || !(me.role === 'owner' || me.role === 'editor')) ctx.reject('Only an owner or editor invites.', 403);
  if (!authorId || !username) ctx.reject('Pick someone from the directory.');
  const wanted = role === 'editor' ? 'editor' : 'member';
  const existing = await ctx.store.get('members/' + authorId);
  if (existing && existing.status === 'active') return existing;
  const row = { authorId, username, displayName: displayName || username, role: wanted, status: 'invited', since: ctx.now(), invitedBy: ctx.visitor.id };
  await ctx.store.set('members/' + authorId, row, 'public');
  await ctx.emit('garden:invited', { authorId, username, role: wanted });
  return row;
}
