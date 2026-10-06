# Mood-owned color transparency — October 1

First-party fractional color utilities now consume twelve editable Mood percentage tokens instead of fixed opacity fractions. They preserve pane-scoped base colors and existing defaults. The Full Theme Builder exposes the scale under Transparency; existing RGBA values retain their own alpha. The Garden search and clear action have accessible names.

Verification:

- Full app gate: 1,686 tests / 267 files, 18 skipped, typecheck/lint/tool checks/build pass (`/tmp/tint-app-verify.log`).
- Eight desktop accessibility journeys pass, including 18 axe states with zero violations, modal focus, keyboard selection, error recovery, reduced motion/200% zoom and persistent Undo.
- Glass light/dark/persistence and guided Customizer pass in the same batch (`/tmp/tint-desktop.log`, ten passed; new transparency test initially had an ambiguous Surface selector).
- Corrected transparency journey passes 1/10s (`/tmp/tint-desktop-final.log`): actual rendered alpha 128 → 0 → 255, accessible search reset and saved percentage after restart. It uses the existing opaque base color rather than selecting unrelated repeated Surface fields.

This is first-party color control acceptance, not a claim that all third-party editor styling or every animation is Mood-driven. Native packaged acceptance is recorded in the living handoff.
