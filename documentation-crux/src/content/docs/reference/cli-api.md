---
title: "CLI and API"
description: "Use the same Garden from tools and scripts."
sidebar:
  order: 7
---

## Start with help

Crux Garden includes a command-line interface for people and agents. Consult the CLI’s own help for the commands supported by your installed version:

```sh
crux --help
```

Do not assume a command from a newer online guide exists in an older packaged app. If `crux` is not on your shell’s path, use the app’s CLI setup instructions or the bundled executable rather than downloading an unrelated package.

## Local and hosted responsibilities

The local API runtime owns the desktop database and Project Folder integration. The hosted API provides account authentication, sync, publishing, and server-side Crux Store access. AI provider requests use the configured provider credentials; the hosted API is not an AI proxy.

Published Crux visitor sessions have a narrower role than account sessions. Do not put an account token, provider API key, or server secret in public files or browser code.

## Store, Functions, and schedules

Crux Functions operate with their allowed context and Store access. Where work executes and whether a schedule runs depends on the runtime and deployment. Verify the target environment before relying on an unattended schedule; a local process that is stopped cannot run work.

For exact endpoint and command contracts, use the versioned API schema and CLI help shipped with the source. Production hosting and domain configuration are operational requirements, not something a local preview proves.
