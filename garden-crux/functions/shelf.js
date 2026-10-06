// functions/shelf.js — what members have shared here, newest first.
export default async function (req, ctx) {
  return (await ctx.store.list('cruxes/')).map((e) => e.value).sort((a, b) => String(b.at).localeCompare(String(a.at)));
}
