# form-js (bpmn.io) in Crux Garden

Upstream: https://github.com/bpmn-io/form-js — `@bpmn-io/form-js` 1.26.0 as published on npm (vendor/), copyright Camunda Services GmbH, MIT with the bpmn.io watermark clause (vendor/LICENSE): the small "powered by" mark the editor and viewer render stays visible. Nothing in vendor/ is modified. This independent adaptation is not a Camunda or bpmn.io product.

form-js is a form builder and viewer: a JSON schema of fields (text, number, choices, dates, groups, layout) edited visually and rendered for filling in. It ships no page and no storage, so this Crux adds the smallest shell (the EventCalendar rule): `index.html` with a name field and Edit/Preview tabs, `builder.js` holding the name and the schema as plain data, and the Garden bridge.

- `data/project.json` is the document: `{ name, schema, saved }`. Every change in the builder marks the project dirty; a confirmed save writes it. `garden/document.js` validates it; the host runs the same check.
- App Tools: `inspect_form` (name, fields, field types), `set_form_name`, `add_form_field` (type, label, key, options, required), `remove_form_field` (key).
- Public edition (`npm run build` → `dist/`, published through Share selected content): the viewer with the saved schema. Each submission becomes one Crux Store entry `response:<time>-<id>` in the store's protected mode, private to the visitor and the author; the author reads answers in the Crux's Store pane. A write needs the visitor's sign-in, as every Crux Store write does today; anonymous answers wait on a Store "inbox" mode (V1-GAPS-PLAN.md, Daniel's decision).
- The Workshop's Preview tab renders the form with the viewer and shows what a submission would carry; nothing is stored from a preview.

Tests: `npm run test:garden` (document validation, edition build).
