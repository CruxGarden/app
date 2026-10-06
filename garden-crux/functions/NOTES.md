// functions/_lib.js — not a handler (a leading underscore is skipped); notes on the shape
// the garden's functions share. Each handler repeats what it needs, since a handler is one file.
//
// Store keys (all public — the page reads them, only functions write them; on-store.js refuses the rest):
//   garden                 { name, description }
//   members/<authorId>     { authorId, username, displayName, role: owner|editor|member, status: invited|active, since, invitedBy }
//   cruxes/<cruxId>        { cruxId, title, url, authorUsername, addedBy, at }
//   posts/<at>-<id>        { id, authorId, username, text, at }
