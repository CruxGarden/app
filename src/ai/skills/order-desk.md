# Skill: order-desk
Use when: the crux grew from the Order Desk template, or orders or sign-ups need a backend.

A small shop's order queue whose backend is the crux itself: the Store holds the orders, `functions/` are the only way they change. Read README.md in the crux first; it names every file.

- The page (`index.html`, `app.js`) never writes the Store. It calls `crux.fn('menu')`, `crux.fn('order', body)`, `crux.fn('orders')`, `crux.fn('status', { id, status })`, `crux.fn('whoami')`, and refreshes on `crux.on('*', …)` for `order:*` events. Keep it that way: `functions/on-store.js` refuses page writes to `orders/*` and `orders:*`.
- `functions/order.js` validates, takes the number from `ctx.store.increment('orders:next')` (atomic, never shared), writes `orders/<id>` public, emits `order:placed`. `functions/status.js` is owner-only (`ctx.visitor.isOwner`) and emits `order:updated`. `functions/on-order.js` (`match = 'order:*'`) rebuilds `orders:summary`.
- The menu lives in `functions/menu.js`; `functions/order.js` carries the same item names for validation — change both.
- Handlers run in the workspace against the local Store (you are the owner there) and at the shared address as each signed-in visitor. Test with the Share pane's Functions section (Run / Emit) or by using the preview; `check_site` after changing the page.
- Adding a step: a new handler file for a new `crux.fn`, an `on-<event>.js` for something that should happen after an event, and one more line in `app.js`. Keep `crux.js` as written.
