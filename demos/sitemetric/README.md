# The Sitemetric development workspace

`sitemetric-workspace.cruxspace` is a **workspace**: a Cruxspace holding a Stack
Crux for the infrastructure, a Link Crux for each service you run from your own
checkout, and a Runner that conducts them (ADR 0053).

Import it from **Home → Cruxspaces → Import Cruxspace**.

## What is in it

| Member | Kind | What it is |
| --- | --- | --- |
| Sitemetric services | Stack | `compose.yaml` with Postgres and Redis |
| Shell app | Link | the shell app run from source (`provides: shell-app`) |
| API | Link | the API run from source (`provides: api`) |
| Sitemetric workspace | Runner | the board: what can run, its ports, its log |

## Using it

1. Open **Sitemetric workspace** and choose a folder for each Link Crux — your
   own checkout. Folders never travel inside a package, so everyone points the
   same Link at their own machine.
2. Press **Start**. The Runner starts what each service needs first, assigns
   free ports (remembered after the first time) and hands every service the
   addresses of the others.
3. Ports, environment and secrets are edited in one place — the Runner. What is
   true only on your machine lands in `.crux/local.env` and
   `.crux/local.compose.yaml`, which are never ingested and never shared.

The Stack needs Docker Desktop or Podman running. Services run from source do
not.

## Assumptions this package makes

The stack is Postgres and Redis — what the platform's services need underneath.
The platform's own services are **not** in it: their Compose file lives in the
Sitemetric repository and belongs there. Add a service there and give its Link
Crux the same `provides` name, and the from-source toggle works with no further
change.

Rebuild it with `CRUX_BUILD_WORKSPACE=1 npx playwright test
e2e/jobs/sitemetric-workspace.spec.ts` in `app/electron`.
