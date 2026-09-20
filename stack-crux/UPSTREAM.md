# Upstream

## Docker Compose

- **Project**: Docker Compose — https://docs.docker.com/compose/
- **Licence**: Apache 2.0. Compose is not bundled with Crux Garden; the app runs whatever the machine has.
- **How it is used**: unmodified, as its own program, inside this Crux's Project Folder. Crux Garden supplies the working directory, a fixed project name (`crux-<cruxId>`) and the list of verbs it may use.
- **Podman** (https://podman.io, Apache 2.0) speaks the same commands and is accepted in its place. Docker Desktop's own licence is not free for larger companies; Podman is there so that is not a wall.

## The seeded stack

`compose.yaml` starts as the **Crux Garden nursery** from this project's CLI (`cli/docker/docker-compose.nursery.yml`): PostgreSQL, Redis and the Crux Garden API in nursery mode, with sample data. It is a starting point, not the point — replace it with whatever you need.

Images it names:

| Image | Licence |
| --- | --- |
| `postgres:16-alpine` | PostgreSQL Licence |
| `redis:7-alpine` | RSALv2 / SSPLv1 (Redis 7 onward) |
| `ghcr.io/cruxgarden/api:latest` | Crux Garden's own |

## What is Crux Garden's

The page and the reader that builds it from the compose file, the checks that run before a start, and the seam that runs compose inside the Crux folder.
