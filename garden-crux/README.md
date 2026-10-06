# A garden with people

This crux is a garden other people can belong to. Its Store holds the people, the shelf of cruxes they share here, and the notes they leave each other; its functions are the only way any of that changes; the API contributes the directory (who can be invited) and the answer to "which gardens am I in".

| Function | Who | Does |
| --- | --- | --- |
| `whoami` | anyone | you, your role and status, the garden's card; writes the owner's own membership the first time |
| `members`, `shelf`, `posts` | anyone | the lists |
| `setup` | owner | names the garden (`garden` in the Store) |
| `invite` | owner, editor | adds a person as *invited* (member or editor) |
| `accept` | the invited | makes them *active* — nobody joins without saying yes |
| `leave`, `remove` | member; owner | out of the garden (the owner stays) |
| `share`, `unshare` | active members | a published crux on the shelf; off it (who shared it, or an owner or editor) |
| `post` | active members | a note to the garden |
| `on-store` | — | refuses any page writing `garden`, `members/*`, `cruxes/*` or `posts/*` directly |

Roles are three words: **owner** (the crux's author), **editor** (invites and curates), **member** (shares and posts). The garden's name and description are the crux's title and description, kept in the Store as `garden`.

Share the crux to open the garden; people find it on Home under *Gardens* once they are invited.
