# Piskel in the Workshop

The actual Piskel editor preserves native pixel drawing, layers, animation frames, preview and PNG/GIF/.piskel exports. Garden stores native sprite-sheet PNGs as fingerprinted Artifacts and the native document structure in data/project.json. The agent can inspect the sprite and adjust playback speed through the native controller.

The desktop test draws in two frames, changes speed through the real agent integration, exports PNG/GIF/native .piskel, reimports with native confirmation, handles an external conflict and reopens the same pixels and animation settings after a full restart. It checks that the native toolbar loads its local icons. The save footer defers closing/reloading to Garden's confirmed persistence.

- `piskel-workshop.png`: editor after reloading an externally renamed sprite.
- `piskel-reopened.png`: the same animation reopened from its Project Folder.

Source, lockfile and rebuild scripts accompany each Crux. See `piskel-crux/UPSTREAM.md` for the pinned upstream and portable-project boundaries.
