# Upstream

## Docker Compose

- **Project**: Docker Compose — https://docs.docker.com/compose/
- **Licence**: Apache 2.0. Compose is not bundled with Crux Garden; the app runs whatever the machine has.
- **How it is used**: as a separate program receiving a prepared private Compose snapshot. Crux Garden parses the source, scopes interpolation values, resolves and validates the canonical model, and supplies a stable per-Crux project identity and bounded command arguments. Existing-resource controls use engine-owned project identities without rereading the source.
- **Podman** (https://podman.io, Apache 2.0) can supply a Compose provider. Provider compatibility is not yet verified; canonical reload, configuration hashes and replacement overrides are required and checked at runtime.

## The seeded stack

`compose.yaml` starts as the **Crux Garden nursery** from this project's CLI (`cli/docker/docker-compose.nursery.yml`): PostgreSQL, Redis and the Crux Garden API in nursery mode, with sample data. It is a starting point, not the point — replace it with whatever you need.

Images it names:

| Image                           | Licence                          |
| ------------------------------- | -------------------------------- |
| `postgres:16-alpine`            | PostgreSQL Licence               |
| `redis:7-alpine`                | RSALv2 / SSPLv1 (Redis 7 onward) |
| `ghcr.io/cruxgarden/api:latest` | Crux Garden's own                |

## What is Crux Garden's

The page and the reader that builds it from the compose file, the checks that run before a start, and the prepared-project and existing-container controls. The YAML parser is the separately licensed `yaml` npm dependency.
