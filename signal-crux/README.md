# signal (Song Crux)

Signal, the MIDI sequencer, as a Crux Garden creation tool. See `UPSTREAM.md` for the upstream commit, the few fork changes and the Garden document; `garden/build.cjs` builds `runtime/`.

```sh
npm ci --ignore-scripts
npm run build:crux    # runtime/
npm run check:crux    # upstream's typecheck, bridge included
npm run test:crux     # the document validator
```
