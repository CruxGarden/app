# Crux Garden

**Talk to an AI. Make something. Publish it at your own address.** Every version is kept, and
visitors can open "How was this made?" to read the conversation.

Crux Garden is a local-first creative workspace for the Mac (Windows and Linux builds are in
progress). Your work lives in ordinary folders on your disk; the AI runs on your own key or a
local model; publishing is the only part that touches our servers.

- Website and downloads: https://crux.garden
- Explore what people made: https://crux.garden/explore
- This repo: the desktop app (`electron/`) and the web app it wraps (`src/`)

## Run it from source

```bash
nvm use                                   # Node 22
npm install && npm run dev                # web app on http://localhost:8080
cd electron && npm install && npm run dev # desktop shell against the dev server
```

Build a DMG without a certificate: `cd electron && npm run dist:mac:unsigned`.

## Verify

```bash
npm run verify                # typecheck + lint + unit tests + build
cd electron && npm run verify && npm run build:all && npm run test:e2e   # Playwright against the real app
```

## What the app sends over the network

- **AI requests** go straight from your machine to the provider you chose, with your key — or to a
  local model, sending nothing.
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

MIT — see `LICENSE`. Bundled Astro templates are original; adapted open-source themes carry their
own attribution inside the template.
