# Stack

A set of services that run on your machine, described by one file you can edit, version and hand to someone else.

`compose.yaml` in this Crux **is** the stack. The bench is built from it: every service, what it is (the comment you write above it), the ports it publishes, what it waits for, whether it has a healthcheck. Change the file and the page changes with it. There is no second place to keep in step.

## Running it

Press **Start**. The first run downloads the images, which takes a while, and the output appears as it goes. **Stop** leaves the containers in place; **Stop and remove** clears them. Each service has its own Start, Stop and Logs.

Crux Garden runs `docker compose`, or `podman compose` if that is what answered. It fixes the project name to this Crux, so stopping this stack can never touch another one — including a second Crux running the same file.

## Sharing it

Publish the Crux. Whoever installs it gets the same `compose.yaml`, the same bench and the same services. Because the file is an ordinary Artifact, Growth keeps every version of the stack, and export carries it to another machine.

Two habits make a stack worth handing over:

- **Pin your images** by tag, so it means the same thing next month.
- **Keep secrets out of the file.** Put them in the Crux's secrets and refer to them as `${NAME}`; the file stays safe to publish.

## What is refused

The app reads the file before every start and will not run a stack that reaches past this Crux:

| Refused | Why |
| --- | --- |
| `privileged: true` | that is the whole machine |
| `network_mode: host`, `pid: host` | the same |
| a mount of `docker.sock` | the socket is root |
| a bind mount outside the Crux folder | a stack should carry its own data |

Named volumes are fine, and so is anything inside the folder. If a stack is refused, the reason is named so you can change the file.

## Asking the collaborator

It has the same view you do: `compose_ps` for what is running, `compose_up` and `compose_down` to start and stop, `compose_logs` to read a service's output, and `read_file` / `write_file` for the stack itself. Ask for what you want — *"add a MinIO service on 9000 and point the API at it"* — and the file it edits is the one the bench reads.

## When Docker is missing

The bench says so and points at Docker Desktop or Podman. Nothing else in the Crux stops working, and the file still describes itself.
