# Runner

The board for a workspace. It reads the Cruxspace it lives in and lists everything that can run.

## What it shows

A row is a **service**, not a Crux. The Stack Crux beside it contributes one row per Compose service; a Project Crux contributes the service it **provides**, and its presence means that service runs **from source** rather than as a container. If no folder has been chosen for that Project on this machine, the row falls back to the Stack and says so.

Tasks are separate from services, because "is it up" and "did it pass" are different questions.

## Starting things

Press Start on a service and it brings up **what that service needs first** — computed from Compose's `depends_on` and whatever a Project declares it needs. Nothing unrelated is touched, started or stopped.

Quitting Crux Garden stops nothing. Containers keep running; services from source stop, because they are the app's own processes. Reopen and the board shows the truth, whatever started it.

## Who owns what

The Runner owns the **configuration** — ports, environment, secrets — so there is one place to look. The Cruxes own **what is running**, so a Crux started on its own is fine and a Runner that crashes leaves your services alone.

## Asking the collaborator

It has `workspace_status`, `workspace_start` and `workspace_stop`. Ask it to bring the workspace up, or what is running and where.
