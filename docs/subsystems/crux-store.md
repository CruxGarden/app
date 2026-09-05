# Crux Store

A lightweight key-value store every published crux gets, with Crux Garden accounts as the
identity. Pages use it through `window.crux.store`; the same code works in the Workshop preview
(local SQLite, proxied over postMessage) and when published (the API, `/store/:cruxId/:key`).

## Two buckets, every write signed

**Every write — set, increment, delete — needs a connected account.** There are no anonymous
writes, so there is no anonymous abuse: whoever misbehaves is one username, and that can be
stopped. The buckets differ only in who reads.

Every key is in one of two modes, chosen by its **first write** and fixed from then on (a write
naming a different mode is refused with 409; the author changes a mode by deleting the key in the
Store pane and writing it again).

| mode | who writes | who reads | for |
|---|---|---|---|
| `public` — open | a connected account (its own token) | anyone | counters, a leaderboard, a guestbook with names, anything the crux owns that members change |
| `protected` — protected user | a connected account, its own slot | only that account | preferences, saves, progress |

`public` is one value per key belonging to the crux. The store knows nothing beyond that:
conventions such as "one entry per person" or "the highest score wins" are the page's to enforce
on a `public` value — read, change, write back; the last writer wins.

`common` (2026-09-05, "anyone reads, a connected account writes") was exactly what `public` now
is; the API still accepts `mode: 'common'` as a deprecated alias and stores `public`.

## SDK

```js
await crux.store.get(key);                       // null when unset; protected → your own slot
await crux.store.set(key, value, { mode });      // mode defaults to 'protected'
await crux.store.increment(key, by, { mode });   // atomic; mode used only when the key is new
await crux.store.delete(key);                    // public: the value; protected: your slot
await crux.store.list();                         // author only
```

Unauthenticated visitors: every write rejects with the API's plain message, `Writing to the store
requires a signed-in account`; `get` on a `public` key returns the value, on a `protected` key
`null`. Always default.

## Where a page's sign-in comes from

Inside crux.garden the host frame lends the viewer's session to the SDK. A standalone published
page has to sign the visitor in itself (email code via `/auth/code` + `/auth/login`) and call
`/store/:cruxId/:key` with `Authorization: Bearer <token>` — the 5Ws template's `lib/store.ts`
does this and is the reference.

## Limits and metering

Reads and writes count as Crux Store requests against the author's plan (see Usage). Because every
write is attributable, the API also caps writes per account: `STORE_WRITES_PER_MINUTE_PER_ACCOUNT`
(default 60) per minute, then 429 with a plain message and the account id in the API log. Keep
values small; the store is a store, not a database — nothing here lists or queries across visitors.
