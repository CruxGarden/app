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

Build a DMG without a certificate: `cd electron && npm run dist:mac:unsigned`.

## Verify

```bash
npm run verify                # typecheck + lint + unit tests + build
cd electron && npm run verify && npm run build:all && npm run test:e2e   # Playwright against the real app
```

## What the app sends over the network

- **AI with your own key** goes straight from your machine to your chosen provider.
  **Included collaboration**, when configured, sends conversation and selected file context through
  the Crux Garden API to Anthropic; the accounting ledger retains model, token counts, cost and status,
  not prompt or response content. Tool execution and Project Folders stay local. Local models run
  on your machine. Included usage has rolling limits and no automatic paid overages.
- **Publishing and sync** send only what you ask to publish or back up, to crux.garden.
- **Update checks** ask GitHub Releases for the latest version. You can turn them off in Settings →
  Desktop.
- **Agents you connect** (Settings → Agents) talk to a per-crux MCP server on `127.0.0.1` only, off
  by default. The token lives in the crux's `.crux/mcp.json`, never leaves your machine, and is never
  published or versioned. A connected agent sees that one crux — not your keys or your account — and
  everything it does is recorded in the Collaboration under its name.
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
