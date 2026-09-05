# Skill: parallel-work
Use when: you are about to delegate wide, independent work (captions for many photos, a set of translations).

Fan out with the `delegate` tool: each task runs as a worker on its own Growth branch, started from the same files, and may only change the files you give it. The app merges the branches back when every worker has ended.

## When it fits — and when it does not

- Fits: the same kind of change across many files that do not depend on each other. Captioning forty photos, translating a set of pages, writing one post per item in a list.
- Does not fit: one file; work whose second step depends on its first; anything that needs the person to answer a question first; anything that changes shared files (a layout, a config, an index) — do those yourself on the main line, before or after.

## Writing the tasks

- At most 6 tasks. Batch files into tasks rather than one task per file — ten photos per worker is a good size.
- Give each task a short title (the person sees it: "Captions 1–10"), and instructions that are complete in themselves — the worker does not see this conversation. Name the files, the format, the voice, what to leave alone.
- Scope each task with `paths` (exact files) and/or `folder`. The tools refuse anything outside the scope. Never give two tasks the same file unless you accept that the person will have to choose between their versions.
- Workers can read any file (and look at images with read_file), search, create and edit files within their scope, generate images into their scope, and load skills. They cannot delete or rename, take snapshots, change the theme or the soundscape, or delegate further.

## What comes back

- The result lists each worker (finished, stopped, failed), the files it changed, and what merged onto the main line. A file changed by exactly one worker — or identically by several — is applied. A file changed differently by two or more workers needs a decision: the person picks a version (or leaves the file as it was) in the job card. Do not resolve those files yourself and do not write them in the same turn.
- Every worker's branch stays in Growth as "Sub: <title>", restorable; the merge is one "Merged N subagents" snapshot on the main line. A worker that was stopped or ran out of budget is not merged — its partial work is on its branch.
- Say in your reply what merged and, when something needs a decision, that the person will find it on the job card.
