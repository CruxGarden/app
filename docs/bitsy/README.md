# Bitsy Workshop evidence

`electron/e2e/bitsy-app.spec.ts` uses the real isolated desktop app. It edits a native title and room canvas, asks the agent to change the title, enters/exits play, exports an HTML game and opens it independently, exercises an external-file conflict, explicitly reloads and fully restarts. It also runs the packaged resource generator in a Crux made by the app and compares its output with the bundled native export resources.

Service tests verify native game data and custom-font settings survive Growth restore and complete Crux archive import.

Screenshots show the actual Bitsy editor after an external saved version is reloaded and after restart. See `bitsy-crux/UPSTREAM.md` for source revision and adaptation details.
