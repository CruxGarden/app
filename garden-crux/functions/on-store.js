// functions/on-store.js — the Store hook: the page never writes the garden's records directly.
// People, the shelf and the notes change only through the functions above.
export const match = 'store:*';
export default async function (req, ctx) {
  const { key } = ctx.event.data;
  if (key === 'garden' || /^(members|cruxes|posts)\//.test(key))
    ctx.reject('The garden changes through its functions, not by writing its Store.', 403);
  return { allowed: key };
}
