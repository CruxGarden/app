# Local API artifact

`@cruxgarden/local-api` is built from the actual Crux Garden API repository.
The file dependency in `electron/package.json` selects the exact artifact; its
`provenance.json` records the revision and compiled-file hashes. This is a pinned, private integration artifact; it is not published.
The app checkout and CI can install it without a sibling API repository.

The package supplies the actual desktop graph/SQLite owner, including schema 5
manifest file commands. Desktop startup always uses it. The isolated
`e2e/local-api-owner.spec.ts` and content/Growth suites exercise its packaged
runtime, fresh databases, refused writes, recovery and restart. Do not open two
owners over one file.

To update, run `npm run build:local` in the API repository, then `npm pack
--ignore-scripts --pack-destination /absolute/path/to/app/electron/vendor`
from its `build/local-runtime` directory. Install the resulting file dependency
in `electron`, run both repository gates and the isolated desktop test, and
commit the artifact and lockfile together. Never edit generated package files.

The consuming host supplies `better-sqlite3` as a peer and rebuilds it for its
own ABI. Never copy the API checkout's Node native module into Electron.
