// functions/members.js — the people, owner first, then by when they came.
export default async function (req, ctx) {
  const rows = (await ctx.store.list('members/')).map((e) => e.value);
  const rank = { owner: 0, editor: 1, member: 2 };
  return rows.sort((a, b) => (rank[a.role] - rank[b.role]) || String(a.since).localeCompare(String(b.since)));
}
