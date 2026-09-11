# Mermaid Live Editor in Crux Garden

Actual Mermaid Live Editor 2.0.67, pinned to f351b22513bd8b0c3dd9d06f81e1670eb506395a from https://github.com/mermaid-js/mermaid-live-editor (reviewed 2026-09-11).

The original Svelte editor, diagram renderer, presets, configuration, history and native SVG/PNG exports remain. The fork builds a static application under runtime/. Source, lockfile and runtime accompany each Crux. Rebuild with Node >=22.22.0 and pnpm install / pnpm build.

Before native state initializes, Garden hydrates its persistence driver from data/project.json. This carries Mermaid source/configuration and native saved histories through Growth and a complete Crux archive. Native persistence uses the existing owner-bound document bridge with confirmed saves and explicit conflict reload. Embedded service-worker registration is disabled so rebuilt sources do not serve stale runtime assets. Reload discards the current URL hash and uses the saved Garden document.

Cloud Mermaid Chart links, analytics and server renderer endpoints are disabled by default upstream configuration. Native diagram exports are supported. A link to this local preview is not a publicly hosted diagram. Whole-editor Garden publication is unavailable. The initial agent operation changes Mermaid source through the native state update function; invalid Mermaid remains an editable saved draft and its renderer displays the error.

Keep the upstream LICENSE and source notices. No backend replica is introduced.

The upstream Node requirement was relaxed for this fork after its typecheck, all 104 native tests and static build passed on Garden’s Node 22.22.3. pnpm 10.34.4 is pinned. The build writes dependency license texts into runtime/THIRD_PARTY_NOTICES.txt.
