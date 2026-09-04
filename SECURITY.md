# Security Policy

This file covers the Crux Garden **app**: the web app in `src/` and the Electron desktop shell in
`electron/`. The API server has its own policy in the `api` repository.

## Supported Versions

Security fixes go into the current release line only. Versions are `version` in `package.json`
(web app) and `electron/package.json` (desktop shell).

| Component            | Version | Supported          |
| -------------------- | ------- | ------------------ |
| App (`package.json`) | 3.x     | :white_check_mark: |
| Desktop shell        | 1.x     | :white_check_mark: |
| Anything older       | —       | :x:                |

## Reporting a Vulnerability

We take the security of Crux Garden seriously. If you believe you have found a security
vulnerability, please report it to us as described below.

### Please do NOT:

- Open a public GitHub issue for security vulnerabilities
- Publicly disclose the vulnerability before it has been addressed

### Please DO:

1. **Report privately** - Email security details to [keeper@crux.garden](mailto:keeper@crux.garden)
2. **Provide details** - Include steps to reproduce, potential impact, and any suggested fixes
3. **Allow time** - Give us reasonable time to address the issue before any public disclosure

### What to include in your report:

- Type of vulnerability (e.g. key disclosure, navigation/IPC escape, XSS in a published crux)
- Full paths of source file(s) related to the vulnerability
- Location of the affected source code (tag/branch/commit or direct URL)
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact of the vulnerability, including how an attacker might exploit it

### What to expect:

- **Acknowledgment** - We will acknowledge receipt of your vulnerability report within 48 hours
- **Assessment** - We will assess the vulnerability and determine its impact and severity
- **Updates** - We will send you regular updates about our progress
- **Resolution** - Once the vulnerability is fixed, we will notify you and may publicly disclose it (with your permission)
- **Credit** - We will credit you in the security advisory (unless you prefer to remain anonymous)

## What the app protects, and how

Crux Garden is local-first and BYOK: the user's data and the user's AI provider keys live on the
user's machine. The API is used for sign-in, sync, publishing and the crux store — never as a
proxy for AI calls. The surface worth attacking is therefore the user's own machine and browser
context, and the published sites on `*.publish.crux.garden`.

### AI provider keys (BYOK)

- Keys are stored through `src/services/secrets.ts`. In **Desktop Mode** they go to Electron
  `safeStorage` over IPC (`electron/src/secrets.ts`, Keychain-backed on macOS); the renderer never
  holds the encrypted blob and the key never enters the SQLite settings table. In **Web Mode**
  (browser dev environment) they are in `localStorage`, which is why Web Mode is not a production
  authoring surface.
- `src/ai/keys.ts` is the only reader/writer. Keys are sent to the chosen provider's API directly
  over HTTPS with the user's request, or to a local model on `localhost` (Ollama/LM Studio ports
  are the only origins the shell rewrites headers for, and only for the app's own top frame —
  `electron/src/main.ts`).
- A report that a key reaches crux.garden, a log file, a crash report, a published site, or a
  third-party origin is a vulnerability.

### Account tokens

- The crux.garden access/refresh JWTs are kept in `localStorage` (`src/api/client.ts`) and
  refreshed on 401. They authorize sync, publish and billing calls — not AI, not the user's files.

### The desktop shell

- Renderer runs with `contextIsolation: true` and `nodeIntegration: false`; the only bridge is
  the preload (`electron/src/bridge.ts`), which exposes a typed IPC surface (SQLite, Project
  Folders, secrets, builds) — not `require`.
- Nothing may navigate the shell: `will-navigate` and `will-redirect` are cancelled for anything
  that is not the app itself (`crux-app://` or the dev server), and `setWindowOpenHandler` denies
  popups, handing `http(s)` links to the system browser. This is what keeps the preload's powers
  away from arbitrary pages.
- macOS builds use the Hardened Runtime and are notarized when signed (`electron/package.json`
  `build.mac`, entitlements in `electron/build/`). The app does **not** opt into the App Sandbox:
  Project Folders are ordinary directories the user chooses, and `astro dev`/`pnpm` run as child
  processes. Filesystem IPC resolves paths against the Garden Root and the crux's Project Folder
  (`electron/src/paths.ts`, `isInside`); a renderer reaching outside them is a vulnerability.

### Published cruxes

- Published files are served from a per-crux origin (`{cruxId}.publish.crux.garden`), so one
  crux's scripts cannot read another's, or the app's, storage. The app talks to the preview iframe
  by `postMessage` and only trusts the exact publish origin (`src/lib/public-url.ts`).

### Building and configuring

- `VITE_*` variables are build-time public configuration inlined into the bundle
  (`.env.example` lists them). Never put a secret in one.
- Never commit a `.env` (`.gitignore` excludes it; `.env.example` shows the shape).
- Dependencies: keep `npm audit` clean where fixes exist; `npm run verify` runs typecheck, lint,
  tests and the production build.

## Security Updates

Security updates ship as regular desktop releases (the app checks GitHub Releases for the latest
version; the check can be turned off). Watch this repository or the releases feed to be notified.

## Additional Resources

- [Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)

## Contact

For security concerns, please contact us at [keeper@crux.garden](mailto:keeper@crux.garden).

Thank you for helping keep Crux Garden and our users safe!
