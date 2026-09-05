# Skill: crux-store
Use when: building something stateful for a published crux — counters, guestbooks, leaderboards, votes, saved preferences, form submissions.

Published cruxes have a persistent key-value store at `window.crux.store`. It works in both preview (local SQLite) and published (API) mode with no code changes.

- `await crux.store.get(key)` — read a value (null if not found).
- `await crux.store.set(key, value)` — write a JSON-serializable value.
- `await crux.store.increment(key, by?)` — atomic increment (default +1, race-safe). Use it instead of get + set for counters.
- `await crux.store.delete(key)` — delete a key.
- `await crux.store.list()` — list all keys (author only).

Keys have two modes, set by the author in the Store pane, not in code (default `protected`):
- **public** — anyone can read/write, no account needed (counters, guestbooks, votes).
- **protected** — requires a crux.garden account, scoped per visitor (preferences, saves). For unauthenticated visitors, protected `get` returns null and protected `set` is a no-op — always provide fallback defaults:

```js
const prefs = (await crux.store.get("prefs")) ?? DEFAULT_PREFS;
```
