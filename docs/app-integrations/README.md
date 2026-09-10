# Notes Mood support and Moqira

Both integrations are editable Site Cruxes that run inside the Workshop. Start with **Add Crux → Notes** or **Add Crux → Mockups** in Desktop Mode. The Mockups choice uses the actual Moqira canvas and project model.

Choose **Appearance → Garden Mood** to follow the Garden's current colors and fonts live, or **App appearance** to keep the app's own look. The choice survives a restart. It is a private Garden preference and does not set the appearance of a published edition. Moqira's canvas styling remains part of the design.

Moqira saves its multiple wireframes to `mockups/project.json`, with automatic Growth checkpoints. Import/download `.moq` for file exchange with the standalone app. Check **Include in public edition** for each wireframe to publish. The production viewer supports links and interactions without saving back to the private project. Unselected wireframes, Collaboration and automatic preview screenshots are excluded.

- `moqira-demo.crux`: a fictional project exported through the desktop UI, including editable sources, wireframes and Growth. Import it through Add Crux to try the integration.
- `moqira-editor.png` / `moqira-public.png`: actual desktop screenshots of the editor and its locally built public viewer.
- `notes-8-bit.png`, `notes-siberian-blizzard.png`, `notes-silent-hill.png`: the same live notebook across dark and light Moods.
- `../notes-crux/field-notes.crux`: the complete Notes example, now including the appearance control.

New built-in Cruxes and these demos contain the updated sources. Existing customized copies are not overwritten. Tigrana and Moqira do not automatically synchronize with these integrations. Moqira retains its portable JSON format, including embedded images; each changed JSON revision is stored separately, with an 8,000,000-character save limit. Unchanged source blobs are deduplicated.

Validation: the app gate runs 852 service/unit tests, five Notes publication tests, and 21 Moqira tests plus both standalone builds. Real isolated desktop journeys cover Mood changes without draft reload, preference restart, saving on view changes, Moqira file import, disk conflict recovery, Growth, archive export, selected public output, and public wireframe navigation. Nothing was deployed publicly.
