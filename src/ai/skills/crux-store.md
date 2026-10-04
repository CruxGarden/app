# Skill: crux-store
Use when: a crux needs state — counters, guestbooks, votes, forms.

`window.crux.store` is a JSON key/value Store. Workspace preview uses local SQLite; published pages use the hosted API's separate Store. Publishing files does not copy local test records. The Local test Garden is static: it has no Store, Functions or visitor sign-in.

- `await crux.store.get(key)` — value or null.
- `await crux.store.set(key, value, { mode })` — write JSON; mode defaults to `protected`.
- `await crux.store.increment(key, by?)` — atomic counter; do not implement counters with get + set.
- `await crux.store.delete(key)` — delete a value.
- `await crux.store.list()` — authoring only; refused in published visitor sessions.

A key's first write chooses its mode; subsequent writes cannot change it. The owner can change modes in the Store pane.

- **public**: anyone can read; signed-in visitors can write. Never put private names, addresses, credentials or customer notes here. A JSON convention is not an access policy.
- **protected**: a private value per visitor. Signed-out reads return null. Supply defaults, and test with two distinct visitors.

Direct published Store writes require sign-in. Await `crux.whenReady()` first. In published pages, `crux.auth.profile()` returns the current visitor and `crux.auth.isHosted()` tells whether sign-in is inherited from the Garden parent. In inherited mode, sign in/out in the parent. At a standalone published address, use `crux.auth.requestCode(email)`, then `crux.auth.login(email, code)`; use `crux.auth.logout()` to end that session. Listen for `crux:authchange` and refresh identity/data without discarding unsent input. The SDK owns scoped credentials and refresh; never put ordinary account tokens in a page or call account login endpoints yourself. The workspace preview has local identity, not a standalone hosted login flow.

Handle rejected writes visibly, preserve input and offer sign-in or retry as appropriate. Batch writes rather than loops; respect rate/quota refusals. A transport error may follow a successful write: do not blindly replay a non-idempotent operation.

Functions are trusted backend code with broader Store access. A callable Function is not automatically sign-in-only: explicitly validate `ctx.visitor`, input and app-level permissions before reading/writing private data. Do not expose unfiltered `ctx.store.list()` results. A published visitor session deliberately has no platform-owner authority, even for the creator. Atomic increment does not make a sequence of writes transactional.

```js
await crux.whenReady();
const prefs = (await crux.store.get('prefs')) ?? DEFAULT_PREFS;
```
