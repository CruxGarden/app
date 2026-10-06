# Project

Run the code you are working on, from a Crux.

A **Stack Crux** runs the services around your code — the database, the cache, the API you are not editing. This runs the code itself. Between them you have a development environment you can start in two presses, and stop when you are done.

## Setting it up

**Choose folder** opens the OS picker. Point it at your checkout. The page reads its `package.json`, lists its scripts, and notices which package manager installed it and whether dependencies are there yet.

Pick a script, give it a port if it wants one, and press **Start**. Output appears as it arrives. **Open** takes you to it once it is listening.

Your choices are kept in `link.json` in this Crux, so tomorrow is one press.

## Wiring it to a Stack

A Stack Crux writes a `connections.env` — `DATABASE_URL`, `REDIS_URL`, a port and base URL per service, from the ports Compose actually resolved. Copy that file into this Crux and name it under **Settings from**, and every run gets those values. Change a port in the Stack and the next run follows it.

## What it does not do

Your code is never copied. The Crux records how it runs, nothing more, which is why this tool is **not shared**: the record names a folder on this machine, and would mean nothing on another.

`PORT` is offered as an environment variable. Most servers read it; some want a flag instead, which is what **Arguments** is for.

## Asking the collaborator

It has `link_status`, `link_start`, `link_stop` and `link_logs`. Ask it to start the thing, or to read what crashed — it will read the log rather than guess. It cannot choose a folder for you: only you can, in the picker, which is what keeps a Crux from pointing the app at somewhere you never agreed to.
