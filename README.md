<img src=".github/banner.jpg" alt="Crux Garden App — grow anything" width="100%">

# Crux Garden

**Make something, with or without AI. Keep its story. Share when you’re ready.**
Crux Garden brings files, creative tools, optional AI collaboration, and version history into one workspace.

Crux Garden is a local-first creative workspace for macOS, Windows, and Linux. Your work lives in ordinary folders on your disk; AI uses your own key, an included subscription allowance, or a
local model. Publishing, sync and included collaboration use our servers as described below.

- Website and downloads: https://crux.garden
- Explore what people made: https://crux.garden/explore
- This repo: the desktop app (`electron/`) and the web app it wraps (`src/`)

## Run it from source

```bash
nvm use                       # app/.nvmrc: Node 22
npm ci
cd electron
nvm use                       # electron/.nvmrc: Node 24
npm ci                        # downloads Electron and rebuilds its native modules
cd ..
nvm use
npm run build                 # builds the renderer, guide and bundled tools
```

Then use two terminals:

```bash
# Terminal 1, app/ (Node 22)
npm run dev:site               # Vite renderer/public site at http://localhost:8080
# Terminal 2, app/electron/ (Node 24)
npm run dev                   # actual desktop app, using that renderer with HMR
```

Browser authoring is retired; use Electron for creating and editing. Public Explore,
docs and published views remain browser surfaces. Local creation needs no cloud
account or sibling API checkout. Authentication, sync and hosted publishing need a
configured API; see `.env.example`. Never put secrets in public `VITE_*` inputs.

On macOS/Linux, `npm run dev:app` starts the desktop and Vite together. Its `--live`
option uses the production API, where publishing is real. For a bundled local launch,
run `npm start` inside `electron/` after the renderer build. Native Node and Electron
modules are separate installations; do not copy `node_modules` between them.

Package on the target OS with `electron` scripts `dist:win`, `dist:linux`, or
`dist:mac:unsigned` (ad-hoc Mac testing). `npm run test:packaged` in `electron/`
checks the unpacked package in `release/` using a fresh, isolated garden.
Native Windows and Linux packaged-runtime CI checks pass. Signed installers, updates, older OS versions and real hardware still need release acceptance; see CONTRIBUTING.md.

## Verify

For the full desktop gate or packaging, first prepare the matched native media tools
with `npm run binaries:build` in `electron/`; see the [toolchain prerequisites](CONTRIBUTING.md#native-media-binaries).
The renderer build and local creation can be checked before that longer source build.

```bash
npm run verify                # typecheck + lint + unit tests + build
cd electron && nvm use && npm run verify && npm run test:e2e -- --project=gate   # Playwright against the real app
```

## Field guide and first project

New Gardens offer an AI-free home page walkthrough: add a name and photo, preview,
and use Share when ready. Marking a version in Growth is optional. Share distinguishes
a saved edition in your **Local test Garden** (this computer) from the online site
on **crux.garden**. Explore includes a field guide
with offline navigation and search. Make a copy to edit the guide as an ordinary
Starlight Crux. The same source in `documentation-crux/` builds the public docs and journal.

`npm run build:documentation` installs its locked build dependencies and prepares the
bundled reading copy. Normal build and verify commands include this step. Reading the
bundled guide needs neither AI nor network access. An editable site’s first dependency
installation and hosted publication do need a connection.

## Desktop command line

In **Settings → Agents**, install the CLI launcher and follow the displayed PATH
instructions, then enable the access you want. The companion uses Electron's
bundled runtime, so it needs neither Docker nor a separate Node installation.
The app must remain open; individual Crux tools also require that Crux to be open.

```sh
crux help
crux status
crux list
crux open <crux-id>
crux tools --json
crux --folder ./my-project call read_file '{"path":"index.html"}'
```

Use `crux call NAME - --json` to read a JSON object from stdin, particularly in
shells with different quoting rules. Tool discovery includes input schemas for
agents. JSON replies contain `ok` and either `result` or `error`; exit codes are
0 for success, 1 for connection/tool failure or refusal, and 2 for invalid usage.
The app's normal approvals still apply. `--timeout` limits waiting; a timed-out
write may still complete, so inspect before retrying. The installed launcher
selects its app profile; `--folder`, `--profile`, or `--config` can select another
existing Agent Host. Reinstall the launcher if you move the app.

The optional Docker Nursery is a separate developer CLI; use its `crux-nursery`
alias to avoid a PATH collision with this companion.

## What the app sends over the network

- **AI with your own key** goes straight from your machine to your chosen provider.
  **Included collaboration**, when configured, sends conversation and selected file context through
  the Crux Garden API to Anthropic for chat and to OpenAI for included image generation/editing.
  The accounting ledger retains model, token counts, cost and status,
  not prompt or response content. Tool execution and Project Folders stay local. Local models run
  on your machine. Included usage has rolling limits and no automatic paid overages.
- **Publishing and sync** send only what you ask to publish or back up, to crux.garden.
- **Update checks** ask GitHub Releases for the latest version. You can turn them off in Settings →
  Desktop.
- **Agents you connect** (Settings → Agents) use authenticated loopback MCP hosts, off
  by default. Choose access to one Crux or the whole Garden. Per-Crux connection
  tokens live in `.crux/mcp.json`; whole-Garden connection details live under the
  app profile. They are never published or versioned. Connected agents use the
  same tool and approval rules as the app; enabling whole-Garden access grants
  discovery and delegation across Cruxes. Keep connection tokens private.
- **Nothing else.** No analytics. No crash reporting unless you opt in. Logs stay on your disk
  (`~/Library/Logs/Crux Garden`).

## Project maturity

This is a v1 release candidate under active refinement. Automated checks cover local
storage, refusal/retry/restart, core desktop journeys and fixture-backed hosted flows.
They do not certify live provider quality, payments/email, production catalog delivery,
signed updates or every OS/hardware combination. See [test scope](CONTRIBUTING.md#test-scope-and-release-boundaries).

The default build bundles eight manifest Crux Tools; additional tool source folders
are not a promise of availability in the public catalog. Built-in editors and website
starters are separate. See [catalog scope](CONTRIBUTING.md#catalog-test-scope).

## Contributing

See `CONTRIBUTING.md`. Security reports: keeper@crux.garden (`SECURITY.md`).

## License

Crux Garden code is MIT — see `LICENSE`. Dependencies, fonts and bundled Crux Tools retain
their own licenses. The package includes renderer/worker notices, font notices and native media
licenses with corresponding sources. See `CONTRIBUTING.md` for the inventory and platform
acceptance limits; GSAP uses its own Standard No Charge license.

## Learn by playing

[Crux Garden: The Zen of Vibecoding](examples/zen-vibecoding/README.md) is an
interactive Crux that grows a small garden as you try real Tasks, different
collaborators, attention requests and handoffs through Notes, Media Tools and
Calendar. It includes copyable prompts, file checks and a private field journal
for recording what feels clear, confusing or fun.
