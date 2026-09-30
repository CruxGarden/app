# Crux Garden

**Talk to an AI. Make something. Publish it at your own address.** Every version is kept, and
visitors can open "How was this made?" to read the conversation.

Crux Garden is a local-first creative workspace for the Mac (Windows and Linux builds are in
progress). Your work lives in ordinary folders on your disk; AI uses your own key, an included subscription allowance, or a
local model. Publishing, sync and included collaboration use our servers as described below.

- Website and downloads: https://crux.garden
- Explore what people made: https://crux.garden/explore
- This repo: the desktop app (`electron/`) and the web app it wraps (`src/`)

## Run it from source

```bash
nvm use                       # Node 22
npm ci
npm --prefix electron ci
npm run dev:site              # the web app in the browser, http://localhost:8080
npm run dev:app               # the desktop app on that dev server (HMR); starts it if needed
npm run dev:app --live        # the same, against the production API — publishes are real
```

`dev:app` is `scripts/desktop.sh --dev`; the script also builds and launches the
bundled app (`npm run desktop`, `desktop:live`, `desktop:rebuild`, `desktop:selftest`).

The shell helpers above are for macOS/Linux. On Windows, use two terminals:
`npm run dev:site` and `npm --prefix electron run dev`. For a bundled build on
any platform, use the Node version in `electron/.nvmrc`, then
`npm --prefix electron run build:all` and `npm --prefix electron start`.

Package on the target OS with `electron` scripts `dist:win`, `dist:linux`, or
`dist:mac:unsigned` (ad-hoc Mac testing). `npm run test:packaged` in `electron/`
checks the unpacked package in `release/` using a fresh, isolated garden.
Native Windows/Linux CI must pass before those builds are considered verified.

## Verify

```bash
npm run verify                # typecheck + lint + unit tests + build
cd electron && npm run verify && npm run build:all && npm run test:e2e   # Playwright against the real app
```

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
  the Crux Garden API to Anthropic; the accounting ledger retains model, token counts, cost and status,
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
