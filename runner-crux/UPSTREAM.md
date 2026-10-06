# Upstream

## Docker Compose, and your projects' own tools

- **Compose** — https://docs.docker.com/compose/, Apache 2.0. Not bundled; the app runs whatever the machine has, or Podman in its place.
- **Your projects** run with the pnpm Crux Garden bundles (MIT), on Electron's own Node. See the Project Crux for that story.

The Runner adds no runtime of its own. It starts and stops what the Stack Cruxes and Project Cruxes beside it already know how to run.

## What is Crux Garden's

The board, and the parts that make a workspace out of separate Cruxes: discovery across the Cruxspace, the computed closure, port assignment, the per-consumer addresses, and the rule that the Runner may only act on Cruxes in its own Cruxspace — checked by the app, not by the page.
