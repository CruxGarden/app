// functions/whoami.js — is this visitor the desk (the crux's owner)?
export default async function (req, ctx) {
  return { id: ctx.visitor ? ctx.visitor.id : null, owner: !!(ctx.visitor && ctx.visitor.isOwner) };
}
