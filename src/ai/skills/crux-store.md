# Skill: crux-store
Use when: building something stateful for a published crux — counters, guestbooks, leaderboards, votes, saved preferences, form submissions.

Published cruxes have a persistent key-value store at `window.crux.store`. It works in both preview (local SQLite) and published (API) mode with no code changes.

- `await crux.store.get(key)` — read a value (null if not found).
- `await crux.store.set(key, value)` — write a JSON-serializable value.
- `await crux.store.increment(key, by?)` — atomic increment (default +1, race-safe). Use it instead of get + set for counters.
- `await crux.store.delete(key)` — delete a key.
- `await crux.store.list()` — list all keys (author only).

Every write — set, increment, delete — needs a crux.garden account: there are no anonymous writes, so abuse is one username and can be stopped. Reads are where the two modes differ. A key's mode is chosen by its first write — `crux.store.set(key, value, { mode })`, default `protected` — and fixed from then on (a different mode later is refused); the author can flip a key's mode in the Store pane.
- **public** — one value per key belonging to the crux: anyone reads it, a signed-in visitor writes it (counters, leaderboards, guestbooks, shared lists, a group's settings). The page maintains the value — read, change, write back; any convention inside it (one entry per name, say) is the page's, not the store's, and a signed-in visitor could write anything. Re-read once right before writing to narrow races; the last writer wins.
- **protected** — scoped per visitor and private to them (preferences, saves). For a signed-out visitor, protected `get` returns null — always provide fallback defaults.

Signed out, every write rejects with the API's message ("Writing to the store requires a signed-in account"); catch it and show the sign-in instead. A page opened at its own published URL has no visitor token — the SDK gets one only from a host frame (the crux.garden page or the workshop preview, which proxy the calls with the viewer's credentials). For writes from a standalone page, sign the visitor in on the page (the API's email-code flow) and call `PUT {apiBase}/store/{cruxId}/{key}` with `{ value, mode }` and `Authorization: Bearer <token>` yourself; `window.crux.publish` gives `cruxId` and `apiBase`. Writes are capped per account (60 a minute by default; 429 beyond) — batch, do not loop.

```js
const prefs = (await crux.store.get("prefs")) ?? DEFAULT_PREFS;
```
