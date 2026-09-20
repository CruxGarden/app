# Stack

A set of services that run on your machine, described by one file you can edit, version and hand to someone else.

`compose.yaml` in this Crux **is** the stack. The bench is built from it: every service, what it is (the comment you write above it), the ports it publishes, what it waits for, whether it has a healthcheck. Change the file and the page changes with it. There is no second place to keep in step.

## Running it

Press **Start**. The first run downloads the images, which takes a while, and the output appears as it goes. **Stop** leaves the containers in place; **Stop and remove** clears them. Each service has its own Start, Stop and Logs.

Crux Garden runs `docker compose`, or `podman compose` if that is what answered. It fixes the project name to this Crux, so stopping this stack can never touch another one — including a second Crux running the same file.

## Making it yours

The stack ships with sensible defaults, so it runs unchanged. What you change for this machine stays separate from what everyone shares:

| You want                                         | Where it goes                                      | Who sees it                                             |
| ------------------------------------------------ | -------------------------------------------------- | ------------------------------------------------------- |
| a different port, a different image tag          | **Settings** on the bench, written to `.env`       | anyone you hand the Crux to, unless you leave it out    |
| a password or a key                              | the Crux's **secrets**, handed to Compose at start | nobody — it is never written to a file                  |
| a new volume, another service, a changed command | **Add an override file** (`compose.override.yaml`) | anyone, but the shared stack is untouched               |
| an optional part of the stack                    | a **profile** switched on for this machine         | the profile is in the file; whether you run it is yours |

Every setting in the file is written `${NAME:-default}`, so the default is the file and the override is yours. Compose merges `compose.override.yaml` over `compose.yaml` by itself, and Crux Garden checks **both** before it starts anything.

## Sharing it

Publish the Crux. Whoever installs it gets the same `compose.yaml`, the same bench and the same services. Because the file is an ordinary Artifact, Growth keeps every version of the stack, and export carries it to another machine.

Three habits make a stack worth handing over:

- **Pin your images** by tag, so it means the same thing next month.
- **Keep secrets out of the file.** Put them in the Crux's secrets and refer to them as `${NAME}`; the file stays safe to publish.
- **Give every setting a default**, written `${NAME:-default}`, so the stack runs on someone else's machine before they have changed anything.

## What is refused

The app reads the file before every start and will not run a stack that reaches past this Crux:

| Refused                              | Why                               |
| ------------------------------------ | --------------------------------- |
| `privileged: true`                   | that is the whole machine         |
| `network_mode: host`, `pid: host`    | the same                          |
| a mount of `docker.sock`             | the socket is root                |
| a bind mount outside the Crux folder | a stack should carry its own data |

Named volumes are fine, and so is anything inside the folder. If a stack is refused, the reason is named so you can change the file.

## Asking the collaborator

It has the same view you do: `compose_ps` for what is running, `compose_up` and `compose_down` to start and stop, `compose_logs` to read a service's output, and `read_file` / `write_file` for the stack itself. Ask for what you want — _"add a MinIO service on 9000 and point the API at it"_ — and the file it edits is the one the bench reads.

## When Docker is missing

The bench says so and points at Docker Desktop or Podman. Nothing else in the Crux stops working, and the file still describes itself.
