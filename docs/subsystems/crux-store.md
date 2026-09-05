# Crux Store

A lightweight key-value store every published crux gets, with Crux Garden accounts as the
identity. Pages use it through `window.crux.store`; the same code works in the Workshop preview
(local SQLite, proxied over postMessage) and when published (the API, `/store/:cruxId/:key`).

## Three buckets

Every key is in one of three modes, chosen by its **first write** and fixed from then on (a write
naming a different mode is refused with 409; the author changes a mode by deleting the key in the
Store pane and writing it again).

| mode | who writes | who reads | for |
|---|---|---|---|
| `public` — open | anyone | anyone | counters, guestbooks without identity, votes |
| `common` — protected common | a connected account (its own token) | anyone | a leaderboard, a guestbook with names, anything the crux owns that only members may change |
| `protected` — protected user | a connected account, its own slot | only that account | preferences, saves, progress |

The store knows nothing beyond that. Conventions such as "one entry per person" or "the highest
score wins" are the page's to enforce on a `common` value — if the app creator wants to add onto
those abstractions, they can.

## SDK

```js
await crux.store.get(key);                       // null when unset; protected → your own slot
await crux.store.set(key, value, { mode });      // mode defaults to 'protected'
await crux.store.increment(key, by, { mode });   // atomic; mode used only when the key is new
await crux.store.delete(key);                    // public/common: the value; protected: your slot
await crux.store.list();                         // author only
```

Unauthenticated visitors: `common` and `protected` writes reject with a plain message; `public`
works; `get` on a `common` key returns the value, on a `protected` key `null`. Always default.

## Where a page's sign-in comes from

Inside crux.garden the host frame lends the viewer's session to the SDK. A standalone published
page has to sign the visitor in itself (email code via `/auth/code` + `/auth/login`) and call
`/store/:cruxId/:key` with `Authorization: Bearer <token>` — the 5Ws template's `lib/store.ts`
does this and is the reference.

## Limits and metering

Reads and writes count as Crux Store requests against the author's plan (see Usage). Keep values
small; the store is a store, not a database — nothing here lists or queries across visitors.
