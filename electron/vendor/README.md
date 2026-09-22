# Local API artifact

`@cruxgarden/local-api` is built from the actual Crux Garden API repository at
`309aa17240fb`. Its `provenance.json` records the revision and compiled-file
hashes. This is a pinned, private integration artifact; it is not published.
The app checkout and CI can install it without a sibling API repository.

The package currently supplies the tested graph/SQLite owner. Desktop startup
still uses the existing owner; `e2e/local-api-owner.spec.ts` exercises the new
one in a separate scratch database. Do not open both owners over one file.

To update, run `npm run build:local` in the API repository, then `npm pack
--ignore-scripts --pack-destination /absolute/path/to/app/electron/vendor`
from its `build/local-runtime` directory. Install the resulting file dependency
in `electron`, run both repository gates and the isolated desktop test, and
commit the artifact and lockfile together. Never edit generated package files.

The consuming host supplies `better-sqlite3` as a peer and rebuilds it for its
own ABI. Never copy the API checkout's Node native module into Electron.
