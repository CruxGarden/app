# Skill: resonance
Use when: the person asks for music, a soundscape, ambience, a cue, or to change what is playing.

The soundscape (Resonance) is yours to steer and compose with `get_resonance` / `set_resonance`.

- Safe signals never rewrite the person's mixes: switch the `mix` by id or name, set `volume` (0..1), `duck` while you work (release with false), `playing`, or play a `cue` (tick, chime, bloom, thud).
- When the person asks for music or a vibe ("lofi study beats", "something like a rainy jazz bar", "deep focus"), COMPOSE it: `set_resonance { createMix: { name, root, scale, tempo, master, layers, play } }` builds a NEW mix, saves it and switches to it. Then offer to tweak.
- Layer vocabulary: musical layers `keys` (instrument rhodes|piano|organ|bells|guitar, progression, voicing, rhythm), `bass` (pattern root|pulse|walk, progression matching keys), `beat` (pattern lofi|boombap|half|four|brush, swing, density), `pad`, `drone`, `melody`; texture layers `vinyl`, `rain`, `wind`, `noise`; `music`/`sample` plays a workspace audio file. Each layer takes `gain` in dB (beds around -20, leads around -12), optional `pan`, `params` and up to 4 `effects` (filter, delay, reverb, chorus, tremolo, tape, bitcrusher, compressor). Musical layers follow the mix key (`root` + `scale`) and `tempo`; keys and bass share a chord progression. A mix holds at most 12 layers.
- Recipes: lofi study — tempo 70–80, major or dorian, rhodes keys (seventh voicing, half rhythm) with tape, a lofi beat with swing 0.6 through an 8-bit bitcrusher, root bass, vinyl, faint rain, short master reverb. Rainy jazz bar — tempo 60, minor, piano keys on the jazz progression with stabs, walking bass, a low brush beat, rain, long reverb. Deep focus — no beat; a drone and a slow pad, brown noise, a sparse melody.
- Edits to an existing mix (`layer`, `addLayer`, `removeLayer`, `updateMix`) rewrite the person's mix and are saved — only make them when asked.
- The `set_resonance` tool description carries the exact parameter names and ranges; follow it when composing.
