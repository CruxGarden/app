# EventCalendar in Crux Garden

Upstream: https://github.com/vkurko/calendar (EventCalendar), the standalone bundle `@event-calendar/build` 5.12.3 under `vendor/` (`event-calendar.min.js`, `event-calendar.min.css`, the upstream README as the option reference), master at `b4221385c7f58ce86070ed16dd6446ff839dddd9` (2026-09-09). License: MIT (vendor/LICENSE). This independent adaptation is not an official EventCalendar product or endorsement.

EventCalendar is a component, not an application: it renders the calendar (month, week, day, list and resource views), moves and resizes events by drag, and selects ranges, but it has no event form and no storage. Crux Garden adds the smallest organizer around it, which is the justification for a Garden-authored shell here (there is no upstream app to embed):

- `index.html`, `style.css`: the calendar filling the page, and one event form (`<dialog>`: title, all day, start, end, colour, notes; Save, Delete, Cancel).
- `organizer.js`: creates the component with its own header toolbar (Month, Week, Day, List; Today, previous, next), `editable` and `selectable`; a selection opens the form for a new event, a click opens it for an existing one, a drag or resize is kept as the component reports it. The calendar is plain data: events with local wall-clock times (`2026-09-15T10:00:00`, no zone, so a shared calendar reads the same on any machine), the view and the date in view. Standalone, the browser keeps it.
- `garden/bridge.js`: inside a Crux the saved calendar loads before the component shows; every change the organizer records marks the project dirty and a confirmed save writes data/project.json. A bottom bar shows the save state.
- `garden/document.js`: validation of that record.
- App Tools: nine operations cover bounded date-range inspection, full event reading, naming, adding/editing/duplicating/removing events, view/date navigation and CSV output.

Nothing to build; the upstream bundle is used as published.

## Tool-depth pass (2026-09-14)

`garden/commands.js` validates the same command inputs in the host and embed, then calls the organizer's existing EventCalendar operations (`addEvent`, `updateEvent`, `removeEventById`, `setOption`, `gotoDate`). `garden/document.js` is the shared record validator, including real calendar dates, interval order and duplicate IDs. The bridge adopts the canonical shared command lifecycle and uses a session/revision token for the new targeted writes. Copies of the shared modules travel with the Crux.

The organizer now exposes targeted updates and view/date operations. It preserves seconds, including through the native event form, and uses floating-time arithmetic for default durations and copied intervals. An omitted end is one hour or one day; all-day tool boundaries must be midnight. Existing event notes/color remain unchanged unless supplied. Open event forms mark the project dirty; saving, flushing and agent commands reject until the form is saved or cancelled. An invalid manual end remains in the form. The upstream vendor bundle is unchanged.

CSV output is a Garden data-table export through the standard output protocol; it includes full event notes and optional overlapping-date-range filtering. This adds no timezone, recurrence, resource scheduling or iCalendar subscription model. Those remain distinct future capabilities. Calendar has no native Undo; Garden Growth preserves saved versions. Existing Project Folders are not auto-upgraded. The native command/date tests and `electron/e2e/eventcalendar-depth.spec.ts` (in the parent app) record coverage; current verification status is in root TOOL-DEPTH-PLAN.md.
