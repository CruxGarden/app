# Agent tools for embedded apps

The shared registry in `src/services/embedded-app-tool-registry.ts` binds an app's
tool definitions and executor to one open Working Copy. The AI engine and external
MCP tool listing discover the tools for the requested Crux. Closing the app removes
its executor. An older frame's cleanup cannot unregister a replacement frame.

A trusted built-in adapter declares:

- Tool names, descriptions and JSON input schemas.
- The Artifact paths each mutating tool can affect (`writes`; empty for inspection).
- A `prepare(name, input)` function that validates and translates the request for
  that app. Semantic validation belongs to the adapter and app model.

`src/services/embedded-app-tool-adapters.ts` selects the adapter. Adding another
app's adapter does not require another command transport or new cases in the AI
engine's tool switch. App frames cannot register arbitrary tool definitions or
grant themselves capabilities. This first version supports built-in adapters;
installation of third-party tool manifests is separate future work.

`useNotebookProxy` sends the prepared command as
`{ type: 'crux:app:command', id, command }` to the currently owned preview frame.
The frame answers through its existing scoped protocol (`crux:app`, or the legacy
`crux:notebook` for Notes), with `op: 'tool-result'`, `commandId` and either `result`
or `error`. The host checks frame identity, origin, Crux ownership and current
Growth view. Unknown, timed-out and closed-frame commands fail visibly.

Commands use the app's manual model operations and existing scoped save bridge.
A successful mutating command should resolve only after its save is confirmed.
Garden enforces the declared paths against an agent's write scope, rejects writes
to non-writable Working Copies, marks successful operations as mutations and
invalidates affected read-before-write tracking. The app must preserve a draft and
report failure if saving conflicts; an error does not imply that no live parameter
changed. Inspect before retrying after an uncertain result. Agents do not receive
an implicit bypass of lifecycle, file scope or publication boundaries.

Cardinal supplies an instrument adapter: `inspect_instrument`,
`set_instrument_controls`, and `select_instrument_preset`. Its controller serializes
commands, saves pending manual changes first, updates the same native engine as
the controls, and confirms the final save. It never starts audio automatically.
Tigrana and Moqira retain their existing manual/file-tool workflows until their
own app-specific command adapters are added.

Tests cover independent adapters and Crux ownership, replacement/teardown, tool
discovery, write scope, malformed inputs and error/mutation handling. The Cardinal
desktop journey drives a scripted model through the real Collaboration executor,
frame command handler, native WASM engine, Project Folder and Growth path. A
scripted model verifies integration, not the quality of a live model's choices.

The local sampler adds OpenMosh, Tables, smplr, PlayCanvas, Excalidraw and Univer adapters through the same registry. `tool-cruxes/shared/session.js` accepts an optional asynchronous `capture` callback for native editors and a compact `inspect` projection. Capture commits the current editor buffer and runs inside the save queue. A generation counter keeps edits made during capture dirty and schedules a subsequent save. Render receives `{ reload: true }` when a saved document must replace the native draft, even if its JSON equals the last captured document. Native editor initialization, recalculation and image import errors must reject a save; a DOM canvas existing alone is not sufficient evidence that the editor works. See `productivity-tools/README.md` for verification and limits.
