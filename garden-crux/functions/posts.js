// functions/posts.js — the notes members left each other, oldest first, the last fifty.
export default async function (req, ctx) {
  return (await ctx.store.list('posts/')).map((e) => e.value).sort((a, b) => String(a.at).localeCompare(String(b.at))).slice(-50);
}
