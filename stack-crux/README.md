# Stack

A set of services that run on your machine, described by one file you can edit, version and hand to someone else.

`compose.yaml` in this Crux **is** the stack. The bench is built from it: every service, what it is (the comment you write above it), the ports it publishes, what it waits for, whether it has a healthcheck. Change the file and the page changes with it. There is no second place to keep in step.

## Running it

For the bundled nursery, first add a random `JWT_SECRET` of at least 32 characters in this Crux’s secrets. Then press **Start**. The first run downloads the images, which takes a while, and the output appears as it goes. **Stop** leaves the containers in place; **Stop and remove** clears them. Each service has its own Start, Stop and Logs.

Crux Garden uses an installed Docker Compose CLI. A Podman Compose provider must support canonical JSON, configuration hashes and `!override`; incompatible providers report an error. It fixes the project name to this Crux, so stopping this stack can never touch another one — including a second Crux running the same file.

## Making it yours

The nursery uses development mode and publishes its demo services on loopback. It requires your own JWT secret. What you change for this machine stays separate from what everyone shares:

| You want                                         | Where it goes                                      | Who sees it                                                                |
| ------------------------------------------------ | -------------------------------------------------- | -------------------------------------------------------------------------- |
| a different port, a different image tag          | **Settings** on the bench, written to `.env`       | anyone you hand the Crux to, unless you leave it out                       |
| a password or a key                              | the Crux's **secrets**, handed to Compose at start | excluded from shared files; used in a private temporary execution snapshot |
| a new volume, another service, a changed command | **Add an override file** (`compose.override.yaml`) | anyone, but the shared stack is untouched                                  |
| an optional part of the stack                    | a **profile** switched on for this machine         | the profile is in the file; whether you run it is yours                    |

Settings can use `${NAME:-default}` or require a value with `${NAME:?message}`. `.env` and `.crux/local.env` hold literal values; put variable references in the Compose file. Crux Garden checks all selected files, lets Compose resolve them, then checks the result and executes that exact private snapshot. The snapshot is removed after the command.

The configuration panel resolves with the same private settings as Start, but displays secret values as `[secret]`. Change those values in the Crux’s secrets. A secret in public service metadata (such as an image name or port) is refused by the panel instead of being displayed or copied to an override. Connection addresses omit credential-bearing URLs when those credentials are private; supply them separately in your client. Commands and container logs can disclose any values that your service prints.

Saving a port or environment edit preserves previous managed edits and other service ports. Port edits bind to loopback. A manually authored override file is left for you to edit.

## Sharing it

Publish the Crux. Whoever installs it gets the same `compose.yaml`, the same bench and the same services. Because the file is an ordinary Artifact, Growth keeps every version of the stack, and export carries it to another machine.

Three habits make a stack worth handing over:

- **Pin your images** by tag, so it means the same thing next month.
- **Keep secrets out of the file.** Put them in the Crux's secrets and refer to them as `${NAME}`; the file stays safe to publish.
- **Document required secrets.** Give ordinary settings useful defaults; require private credentials instead of supplying a shared secret.

## What is refused

Crux Garden admits image-based services, project-owned named volumes and networks, and ordinary bind paths inside the Project Folder. It refuses privileged containers, shared host namespaces, devices, extra capabilities, sockets and outside mounts. It also refuses builds, providers, external volumes/networks, custom volume drivers, and file loaders such as `include`, `extends`, `env_file`, configs and secrets. These features need separate reviewed support. Symlinks and hard-linked configuration files are refused.

This policy is not an OS sandbox for container images. Use images and commands you trust. Container isolation is provided by your installed engine.

Status, logs, Stop and Stop and remove use the engine’s project identities, so they still work after the source file is damaged or deleted. Removing containers preserves named volumes. Starting or executing in existing containers checks their Compose configuration hash; use Start (Compose Up) to apply a changed file first. Time and output limits bound CLI work, but a failed CLI command may have already started containers; check status and Stop when needed.

## Asking the collaborator

It has the same view you do: `compose_ps` for what is running, `compose_up` and `compose_down` to start and stop, `compose_logs` to read a service's output, and `read_file` / `write_file` for the stack itself. Ask for what you want — _"add a MinIO service on 9000 and point the API at it"_ — and the file it edits is the one the bench reads.

## When Docker is missing

The bench says so and points at Docker Desktop or Podman. Nothing else in the Crux stops working, and the file still describes itself.
