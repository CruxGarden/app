# EventCalendar in Crux Garden

Upstream: https://github.com/vkurko/calendar (EventCalendar), the standalone bundle `@event-calendar/build` 5.12.3 under `vendor/` (`event-calendar.min.js`, `event-calendar.min.css`, the upstream README as the option reference), master at `b4221385c7f58ce86070ed16dd6446ff839dddd9` (2026-09-09). License: MIT (vendor/LICENSE). This independent adaptation is not an official EventCalendar product or endorsement.

EventCalendar is a component, not an application: it renders the calendar (month, week, day, list and resource views), moves and resizes events by drag, and selects ranges, but it has no event form and no storage. Crux Garden adds the smallest organizer around it, which is the justification for a Garden-authored shell here (there is no upstream app to embed):

- `index.html`, `style.css`: the calendar filling the page, and one event form (`<dialog>`: title, all day, start, end, colour, notes; Save, Delete, Cancel).
- `organizer.js`: creates the component with its own header toolbar (Month, Week, Day, List; Today, previous, next), `editable` and `selectable`; a selection opens the form for a new event, a click opens it for an existing one, a drag or resize is kept as the component reports it. The calendar is plain data: events with local wall-clock times (`2026-09-15T10:00:00`, no zone, so a shared calendar reads the same on any machine), the view and the date in view. Standalone, the browser keeps it.
- `garden/bridge.js`: inside a Crux the saved calendar loads before the component shows; every change the organizer records marks the project dirty and a confirmed save writes data/project.json. A bottom bar shows the save state.
- `garden/document.js`: validation of that record.
- App Tools: inspect (name, view, date, events), name the calendar, add an event (title, start, end, all day, notes), remove an event by id.

Nothing to build; the upstream bundle is used as published.
