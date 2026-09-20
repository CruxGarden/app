# Skill: garden
Use when: the crux grew from the Garden template — a place people belong to.

A garden crux is a place other people join: its Store holds `garden` (the card), `members/<authorId>`, `cruxes/<cruxId>` (the shelf) and `posts/*` (notes); `functions/` are the only way they change (`on-store.js` refuses the page writing them). Read README.md in the crux first.

- Roles are three words: **owner** (the crux's author, `ctx.visitor.isOwner`), **editor** (invites, curates the shelf), **member** (shares own cruxes, posts). Keep them; a finer rule is a new check inside a function, not a new role.
- Nobody joins without `accept`: `invite` writes *invited*, the person's own `accept` makes them *active*. Never write `members/*` from a page or a script.
- The directory is Crux Garden's: the page calls `crux.directory(q)`; the host asks the API as the signed-in person. Pages never hold a token; `crux.visitor` gives the viewer's id, name and @username.
- The garden works at its shared address (the API's Store and functions) and, for the owner, in the workspace preview against the local Store. Test a rule with `test_function` (`{ name: 'invite', body: {...} }`) here.
- To add a kind of record (an event, a task): a Store prefix, a function that writes it with the role check, the prefix added to `on-store.js`, a list function, and the page. Emit `garden:<something>` so open pages refresh.
