# Skill: crux-store
Use when: building something stateful for a published crux — counters, guestbooks, leaderboards, votes, saved preferences, form submissions.

Published cruxes have a persistent key-value store at `window.crux.store`. It works in both preview (local SQLite) and published (API) mode with no code changes.

- `await crux.store.get(key)` — read a value (null if not found).
- `await crux.store.set(key, value)` — write a JSON-serializable value.
- `await crux.store.increment(key, by?)` — atomic increment (default +1, race-safe). Use it instead of get + set for counters.
- `await crux.store.delete(key)` — delete a key.
- `await crux.store.list()` — list all keys (author only).

Keys have three modes, chosen by the writer — `crux.store.set(key, value, { mode })`, default `protected`; the author can also flip a key's mode in the Store pane:
- **public** — anyone can read/write, no account needed (counters, guestbooks, votes).
- **protected** — requires a crux.garden account, scoped per visitor and private to them (preferences, saves). For unauthenticated visitors, protected `get` returns null and protected `set` is a no-op — always provide fallback defaults.
- **common** — one value per key belonging to the crux: anyone reads it, writing needs a crux.garden account (leaderboards, shared lists, a group's settings). The page maintains the value — read, change, write back; any convention inside it (one entry per name, say) is the page's, not the store's, and a signed-in visitor could write anything. Re-read once right before writing to narrow races; the last writer wins.

A page opened at its own published URL has no visitor token — the SDK gets one only from a host frame (the crux.garden page or the workshop preview, which proxy the calls with the viewer's credentials). For protected or common writes from a standalone page, sign the visitor in on the page (the API's email-code flow) and call `PUT {apiBase}/store/{cruxId}/{key}` with `{ value, mode }` and `Authorization: Bearer <token>` yourself; `window.crux.publish` gives `cruxId` and `apiBase`.

```js
const prefs = (await crux.store.get("prefs")) ?? DEFAULT_PREFS;
```
