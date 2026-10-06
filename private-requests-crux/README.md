# Private Requests — a private Functions + Store example

Each signed-in visitor keeps **one editable request**. They can read, update and delete their own protected Store value. The creator can read the inbox and delete requests after handling them. This is a small private inbox, not a booking, payment or immutable approval system.

## Try it in Workshop

1. Create **Private Requests** from **Add Crux**. No key or online account is needed locally.
2. Save a subject and details. Saving twice updates one record; a pending submission is guarded.
3. The **Owner inbox** shows the request. Delete a handled request with the explicit confirmation.
4. Open **Panels → Store**. The record is `requests/<visitor ID>` with mode **protected**.
5. Close and reopen the workspace: saved data stays. Unsaved text stays through failed operations/refreshes in this page, not after closing or signing out.

## Try the published customer experience

Publish with the current API, then open the site in two separate browser profiles. Each visitor signs in using the page's email-code form. A page hosted inside the Garden inherits its parent's sign-in instead. Send different requests: neither visitor should see the other's details. Signing out clears private details from the page. The creator's published visitor session also has no platform-owner controls.

The online Store is separate from local test data. **Local test Garden is static-only** and cannot exercise Functions, visitor sign-in or protected Store operations. Test the backend in Workshop and against a full test API before using real customer data.

## Handle online requests as the creator

Use the trusted desktop app: **Share → Optional enhancements → Functions → requests**. The body is JSON:

- Read the inbox: `{ "action": "list" }`.
- Delete one handled request: `{ "action": "remove", "visitorId": "the visitorId returned by list" }`.

After publication, this Functions panel runs against the online API. Workshop still uses the local Store. Deletion is permanent; export the Store first if you need a retained copy. Customers can refresh their page to see that the open request was removed. This example sends no notifications or private events.

## Why the records stay private

`functions/requests.js` writes `protected` values under a key derived from `ctx.visitor.id`. Sign-in is required. Lists select the **persisted Store row's `visitorId`**, mode and canonical key, never a visitor ID, status or permission supplied inside editable JSON. The function projects only the intended subject/details fields. It never returns an unfiltered Store list or emits request contents on the public event stream.

This requires the API update that includes `visitorId` in trusted `ctx.store.list()` metadata. Older APIs fail visibly instead of presenting existing protected records as an empty inbox. No general role framework, account token or extra provider service is needed. Published sign-in uses `crux.auth`; do not replace it with ordinary account tokens.

This is customer-editable data: a signed-in customer may write or delete their own slot directly through the Store API. Server validation shapes the normal form; it is not an immutable-record policy. The inbox ignores malformed, public and falsely attributed records. Do not add trusted payment/approval fields inside the customer's editable value. Owner administration requires `ctx.visitor.isOwner` on the trusted Function call.

## Recovery and limits

A failed save keeps the draft. A lost response can follow a committed save: refresh to inspect the result, or repeat the same save. The deterministic per-visitor key converges to one record; concurrent different edits remain last-writer-wins. If a save succeeds but refresh fails, the page explicitly says it was saved. Error details show operation/environment/time without copying the draft or credentials.

There is no queue/history, transactional booking, delivery guarantee or automatic email. Owner inbox listing reads the Store and is intended for a small example; larger datasets need bounded queries/pagination. Store exports and backups contain private records and must be handled accordingly.
