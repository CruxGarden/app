# Upstream

## pnpm

- **Project**: pnpm — https://pnpm.io
- **Licence**: MIT. It is bundled with Crux Garden (ADR 0004).
- **How it is used**: `pnpm run <script>` executes what your `package.json` says, run on Electron's own Node. That is why this works on a machine with neither Node nor a package manager on its PATH, and why it does not matter whether npm, yarn or bun installed the dependencies — running a script is the same job for all of them.

## Your project

Nothing. Your code stays in its own repository and nothing is copied into the Crux. The Crux holds one small file, `link.json`, recording which folder, which script, which port and where the settings came from.

## What is Crux Garden's

The page, the record of how the project runs here, and the rule that makes it safe: **a folder becomes runnable only by being chosen in the OS dialog**. A Crux that arrives from someone else, naming a path in a document, starts nothing until the person points at a folder themselves. Approvals are kept in the app's own data, never in the Crux, so they do not travel with it. This is also why the tool is not shared.
