# Order Desk

A small shop's order queue with a real backend, and nothing to host: the crux's Store keeps the orders, the crux's functions are the only way they change.

## How it works

| File | Role |
| --- | --- |
| `index.html`, `style.css`, `app.js` | the page: an order form and the live queue |
| `crux.js` | the page's handle on its crux (`crux.fn`, `crux.on`, `crux.store`); works in the workspace preview and at the shared address |
| `functions/menu.js` | what the desk sells — the one list the page and the validator both read |
| `functions/order.js` | `crux.fn('order', …)`: validates, takes a number from an atomic counter, writes `orders/<id>`, emits `order:placed` |
| `functions/orders.js` | `crux.fn('orders')`: the queue plus the rollup |
| `functions/status.js` | `crux.fn('status', { id, status })`: the owner moves an order along; anyone else is refused (403) |
| `functions/on-order.js` | runs after every `order:*` event and rebuilds `orders:summary` |
| `functions/on-store.js` | a Store hook: a page writing `orders/*` or `orders:*` directly is refused before the write lands |
| `functions/whoami.js` | tells the page whether the visitor is the owner, so it shows the desk's buttons |

Try it in the preview: place two orders (they are #0001 and #0002), mark one *ready* (you are the owner here), and watch the queue and the summary follow through `crux.on`. The Share pane's **Functions** section runs and emits each handler by hand.

Share the crux and the same handlers run at the address as each signed-in visitor: customers place orders under their own account, only you can move them, and every run counts on your usage.

## Make it yours

- Change the items in `functions/menu.js` (and the copy of the list in `functions/order.js`).
- Add a field to the form, carry it through `order.js`, show it in `app.js`.
- Add `functions/on-order-placed.js` (`export const match = 'order:placed'`) to do something when an order arrives — a rollup, another event, a log line.
