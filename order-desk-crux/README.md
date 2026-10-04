# Order Desk — Functions + Store example

A public demonstration queue for a fictional print shop. Use made-up names and notes: the queue, notes and summary are readable by everyone after publishing. This is a learning example, not a private customer-order system or a checkout.

## Try it

1. Create **Order Desk** from **Add Crux**, then place two orders in Workshop. No online account or AI key is needed in the workspace.
2. Move an order through printing, ready and done. The workspace preview runs as the local owner.
3. Open **Panels → Store** to inspect `orders/0001`, `orders/0002`, `orders:next` and `orders:summary` in the **Local** Store.
4. Open **Share → Optional enhancements → Functions** to inspect and run the handlers.

## How it works

| File                                | Role                                                                                   |
| ----------------------------------- | -------------------------------------------------------------------------------------- |
| `index.html`, `style.css`, `app.js` | The form and queue; calls Functions instead of writing order records directly          |
| `crux.js`                           | Workspace bridge; the published SDK takes over at the online address                   |
| `functions/menu.js`                 | The displayed menu; keep its item names aligned with the validator in `order.js`       |
| `functions/order.js`                | Validates, increments an atomic counter, writes `orders/<id>` and emits `order:placed` |
| `functions/orders.js`               | Reads the public queue and summary                                                     |
| `functions/status.js`               | Requires trusted owner authority to update a known status                              |
| `functions/on-order.js`             | Rebuilds `orders:summary` after `order:*` events                                       |
| `functions/on-store.js`             | Rejects direct page writes to order keys; Function writes use the trusted backend path |
| `functions/whoami.js`               | Reports visitor identity and whether the caller has owner authority                    |

The form prevents repeated submissions while a request is pending and keeps a refused draft. This does not provide server-side idempotency: after a lost response, inspect the queue before submitting again. Numbering, saving and updating the summary are separate operations, not one transaction. The status handler accepts known states; it does not enforce a forward-only workflow.

## Workspace, static test copy and online app

Workspace preview runs Functions against the local Store. The **Local test Garden** serves static files only: it cannot run this app's Functions or Store operations. Use Workshop to try the example, and a full test API for hosted acceptance. Online publication has a separate Store; local test orders are not copied there. Schedules run only on the full API's clock.

This example's `order` Function deliberately accepts anonymous requests and saves public records. Direct Store writes and Function calls have different authority; do not infer a sign-in requirement from the Store's direct-write policy.

Published visitor sessions deliberately have no platform-owner authority, including when the creator signs in. The online page will not show the workspace's owner controls. Use the trusted app's Function controls for owner operations. A real staff dashboard needs an explicit app-role policy, not ordinary account credentials embedded in a page.

For standalone visitor sign-in, use the published SDK's `crux.auth.requestCode`, `login`, `profile` and `logout`; hosted pages inherit identity from the Garden parent. Do not call account-auth endpoints or copy account tokens into the page. This public demo does not require a sign-in form.

## Make it yours

- Change items in both `functions/menu.js` and `functions/order.js`.
- Add a non-sensitive field to the form, validate it in `order.js`, and display it in `app.js`.
- Add an event handler with `export const match = 'order:placed'` for a follow-up action.
- Before adapting it for real customers, add private record policies, authenticated customer/staff roles, request idempotency and a two-visitor full-API test. Do not just hide public fields in the UI.
