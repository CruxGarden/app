// Private Requests: one editable request in each visitor's protected Store slot.
// The row's visitorId is trusted metadata; fields inside value are customer input.
export default async function (req, ctx) {
  const body = (await req.json()) || {};
  const action = body.action || 'list';
  if (action === 'profile') return { visitor: ctx.visitor };
  if (!ctx.visitor) ctx.reject('Sign in to view or save your private request.', 401);
  const keyFor = (id) => 'requests/' + id;
  const validText = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
  const project = (row) => ({
    visitorId: row.visitorId,
    subject: row.value.subject,
    details: row.value.details,
  });
  const rows = async () => {
    const stored = await ctx.store.list('requests/');
    if (stored.some((r) => r.mode === 'protected' && typeof r.visitorId !== 'string'))
      ctx.reject('The API needs the Private Requests update. Your saved data is unchanged.', 503);
    return stored.filter(
      (r) =>
        r.mode === 'protected' &&
        r.key === keyFor(r.visitorId) &&
        r.value &&
        validText(r.value.subject, 100) &&
        validText(r.value.details, 2000),
    );
  };
  if (action === 'list') {
    const records = await rows();
    // Owner sees the inbox; visitors see their own record only, regardless of body fields.
    return {
      requests: records
        .filter((r) => ctx.visitor.isOwner || r.visitorId === ctx.visitor.id)
        .map(project),
    };
  }
  if (action === 'save') {
    if (!validText(body.subject, 100)) ctx.reject('Add a subject of 1 to 100 characters.');
    if (!validText(body.details, 2000)) ctx.reject('Add details of 1 to 2,000 characters.');
    const value = { subject: body.subject.trim(), details: body.details.trim() };
    await ctx.store.set(keyFor(ctx.visitor.id), value, 'protected');
    return { saved: true, request: { visitorId: ctx.visitor.id, ...value } };
  }
  if (action === 'remove') {
    if (!ctx.visitor.isOwner) ctx.reject('Handle requests in the owner workspace.', 403);
    if (typeof body.visitorId !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(body.visitorId))
      ctx.reject('Choose a request from the inbox.');
    const record = (await rows()).find((r) => r.visitorId === body.visitorId);
    if (!record) ctx.reject('That request is no longer in the inbox.', 404);
    await ctx.store.del(record.key);
    return { removed: true };
  }
  ctx.reject('Choose a supported request action.');
}
