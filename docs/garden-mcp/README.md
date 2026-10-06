# Shared garden operating tools — 2026-09-21

Settings → Agents now offers **Whole garden** alongside per-Crux connections. The separate loopback MCP token lives under the desktop profile (`garden-agent-host/.crux/mcp.json`, mode 0600), outside Project Folders. It resumes after restart, rotates independently, and is removed when disabled.

An outside client uses the Keeper's existing operating registry, plus `list_crux_tools` / `call_crux_tool` to work in a named Crux through the existing executor. Built-in collaborators and the Keeper discover the same actions through `list_garden_tools` / `call_garden_tool`. Theme tools are available without creating a Crux. This exposes supported product operations, not arbitrary UI scripting or provider credentials.

Crux-local actions retain Collaboration attribution, read-before-edit and Growth. Garden calls appear in a named conversation in the Keeper. Publishing/deletion keep the existing human approvals; the garden interface cannot answer its own approvals. Scoped subagents and narrow per-Crux tokens cannot call garden tools, even by guessing their names.

The desktop journey uses a real MCP SDK client in a separate process: creates two Cruxes and a Cruxspace, edits/reads files across them, takes a snapshot, shows a Crux, runs a built-in Collaboration through shared discovery, refuses narrow-token escalation, restarts, reconnects, rotates a token (old token gets 401), then revokes access. Built-in model behavior is scripted; this proves the product route, not unscripted model quality. Existing per-Crux publish/delete approval and protocol checks pass too. `garden-mcp-workflow.png` shows the result without credentials.

App verify: 1,322 main tests plus bundled tool gates. Electron verify: passed. Combined desktop group: 10 passed in 1.1 minutes (`flow`, `mood-title-font`, `garden-mcp`, `mcp`, `mcp.unit`). Startup calls now fail clearly until the renderer listener is ready; shutdown/revocation closes owned HTTP connections. Restart the desktop shell before trying the new connection.
