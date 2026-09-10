# Slow Sky — a Cardinal instrument

A prepared modular drone: two oscillators, a slow modulation source, a mixer, a resonant filter and Valley Plateau reverb. Cardinal does the synthesis. Start sound, shape it with the six controls, or open the rack to change modules and cables. Returning to the instrument keeps the rack edits. A control reports when its mapped module was removed.

The current patch, control mappings and presets are saved together in `music/instrument.json`, an ordinary Artifact. `music/starter.vcv` is an independent starting patch for recovery. This first build uses a curated selection without sample players; it does not support arbitrary installed VCV modules. Standard patch state is preserved, not the exact running phase of oscillators or reverb tails.

Edits save automatically through Garden's owning Working Copy and create Growth. If an agent or external editor changes the same document, a stale save is rejected and the in-memory draft remains. Reload saved instrument to load the agent's changes. Sound starts explicitly and stops on focus loss or leaving the instrument.

Agent edits use ordinary file tools against `music/instrument.json`: retain schemaVersion, stable module and cable IDs, macros and presets; change only the requested patch parameters or connections. Validate the result in the running instrument. The open instrument exposes three example agent tools: `inspect_instrument`, `set_instrument_controls`, and `select_instrument_preset`. Inspection returns stable control/preset IDs and actual live values. Mutations preserve pending manual edits, update the same Cardinal engine, and return success after the scoped save is confirmed. They never start sound automatically. Try “Make the drone darker and more spacious” or “Choose Low Orbit, then reduce the motion.” Tools require the current instrument open in Workshop. On an error, inspect before retrying; a live draft may remain.

This is currently a local instrument. Website/Explore distribution is not enabled for this integration yet. Complete Crux archives contain private Collaboration, Tasks and Growth as well as the instrument. Keep the included licenses and runtime provenance with any transferred copy.

Cardinal and this integration use GPL-3.0-or-later, with third-party components retaining their own notices. The exact runtime's artwork and distribution permissions are still under review. See `engine/` for modifications and provenance. This local development build is not advertised as a cleared public distribution.
