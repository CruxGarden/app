# Moqira

**A focused desktop app for quickly turning ideas into wireframes.**

Moqira is a local-first wireframing app for sketching interfaces without putting a design tool between you and the idea. Build projects from a large catalogue of familiar controls, arrange them across multiple wireframes, and keep the result as a portable JSON file on your computer.

> [!NOTE]
> Moqira is early-stage software. macOS is the primary development platform; Windows builds are configured but have not been tested yet.

## Why Moqira?

- **Quick to start** — drag controls onto a canvas and shape a wireframe in minutes.
- **Local first** — projects live on your computer, not behind a cloud account.
- **Multi-wireframe projects** — keep related flows and interface states together.
- **Portable files** — projects use a readable JSON-based format.
- **Focused by design** — the tools you need for wireframing, without a full design suite.

## Features

- A searchable control catalogue covering forms, navigation, data, charts, markup, media, and iOS patterns
- Drag, resize, multi-select, duplicate, lock, align, and reorder canvas nodes
- Editable text, colors, typography, borders, opacity, and control-specific properties
- Links between wireframes, external URLs, and back actions
- Undo and redo support
- Light and dark themes with customizable accent color and typography
- Multiple wireframes in each project
- Recent-project shortcuts and native open, save, and reveal actions
- `.dsmockup` and `.json` project files

## Built With

- [Tauri 2](https://tauri.app/) and [Rust](https://www.rust-lang.org/) for the native desktop application and filesystem layer
- [React](https://react.dev/) and [TypeScript](https://www.typescriptlang.org/) for the interface
- [Vite](https://vite.dev/) for frontend tooling
- [Vitest](https://vitest.dev/) for testing

## Install from Source

Moqira does not currently publish signed release binaries, so the app is built from source.

### macOS

Prerequisites:

- [Node.js](https://nodejs.org/) and npm
- [Rust](https://www.rust-lang.org/tools/install)
- Xcode Command Line Tools (`xcode-select --install`)

Clone the repository, install dependencies, then build and install Moqira:

```bash
git clone https://github.com/downcastsystems/moqira.git
cd moqira
npm install
npm run install:app
```

This creates a release build and installs `Moqira.app` in `/Applications`.

Because the app is not currently signed or notarized, macOS may require you to approve it in **System Settings → Privacy & Security** the first time it opens.

### Windows (experimental and untested)

> [!WARNING]
> Moqira has not been tested on Windows. The project includes Windows packaging configuration, but installation and runtime behavior may have platform-specific issues. Bug reports and contributions are welcome.

Prerequisites:

- [Node.js](https://nodejs.org/) and npm
- [Rust](https://www.rust-lang.org/tools/install) using the MSVC toolchain
- Microsoft C++ Build Tools and WebView2, as described in the [Tauri Windows prerequisites](https://v2.tauri.app/start/prerequisites/#windows)

In PowerShell:

```powershell
git clone https://github.com/downcastsystems/moqira.git
cd moqira
npm install
npm run tauri -- build
```

When the build completes, run either the generated `.msi` installer from:

```text
src-tauri\target\release\bundle\msi\
```

or the generated NSIS `.exe` installer from:

```text
src-tauri\target\release\bundle\nsis\
```

## Development

Install dependencies and start the native desktop app:

```bash
npm install
npm run tauri -- dev
```

To run only the browser-based development version:

```bash
npm run dev
```

Vite prints the local URL when the development server starts. Browser mode uses local storage in place of the native filesystem APIs.

## Quality Checks

```bash
npm run lint
npm test
npm run build
```

## Project Files

A Moqira project is a JSON document containing the project settings, active wireframe, and ordered canvas nodes for every wireframe:

```json
{
  "schemaVersion": 1,
  "name": "New Project",
  "activeWireframeId": "wireframe-id",
  "appearance": {},
  "wireframes": [
    {
      "id": "wireframe-id",
      "name": "Wireframe 1",
      "nodes": []
    }
  ]
}
```

Canvas node order is the layer order, so later nodes render above earlier nodes.

## Contributing

Moqira is young, and contributions are welcome—especially testing and fixes for Windows. If you find a bug or have an idea that fits the project's focused, local-first direction, open an issue or pull request.
