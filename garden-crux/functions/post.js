// functions/post.js — a note to the garden from an active member.
export default async function (req, ctx) {
  const { text } = (await req.json()) || {};
  if (!ctx.visitor) ctx.reject('Sign in first.', 401);
  const me = await ctx.store.get('members/' + ctx.visitor.id);
  if (!me || me.status !== 'active') ctx.reject('Only members post here.', 403);
  const clean = String(text || '').trim().slice(0, 500);
  if (!clean) ctx.reject('Say something.');
  const at = ctx.now();
  const id = Math.random().toString(36).slice(2, 8);
  const row = { id, authorId: ctx.visitor.id, username: me.username, text: clean, at };
  await ctx.store.set('posts/' + at + '-' + id, row, 'public');
  await ctx.emit('garden:posted', { id, username: me.username });
  return row;
}
