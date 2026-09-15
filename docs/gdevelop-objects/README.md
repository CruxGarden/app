# GDevelop object/behavior property collaboration

2026-09-15. Verified native engine, host and isolated desktop integration checkpoint.

Three new App Tools (nineteen GDevelop tools total) inspect native property descriptors, behavior names and Sprite animation directions; revise typed native object/behavior properties; and change existing animation timing/looping. They reuse the current SceneEditor registration and native object Apply callback. All command logic stays in Garden modules; no new upstream component hook.

Native tests exercise movement speed and booleans, preservation of manual variables, rejection of whole invalid batches, Text object typography/color/existing font resources and global scope, and Sprite frame/other-direction preservation. Ordered property updates are validated on an owned native object clone before applying to the real object. Native GetDirection aliases direction zero when multiple directions are disabled; the tool rejects nonzero indexes in that mode.

The desktop journey inspects the movement behavior, changes acceleration through the native form, refuses a stale tool command without changing the project, then changes speed/diagonals and animation timing through Collaboration. It reopens the native form to check saved values remain manually editable and repeats in a fresh Garden after complete Crux import, verifying imported settings before making further edits. Original sprite/media bytes must remain unchanged. The surrounding scene-history, export, restart, independent playable game and 3D regression remains intact.

Full app verification passed all bundled gates/builds, fourteen native GDevelop tests and 1,106 host tests. After mock/test-harness corrections, final typecheck, lint, all 1,107 host tests across 190 files and the production build passed; Electron verification passed again. The complete desktop journey passed in 5.4 minutes. Both eight-call object sequences contain exactly one intentional stale-state refusal; the remaining calls succeed. Native-form screenshots were inspected: acceleration 555 in the first Garden and 666 after clean import, with speed 420 and diagonals disabled. The surrounding export/history/restart/3D checks pass with no captured page/debugger crashes. Three resource-load 404 console messages remain without identified URLs. Test cleanup removed two older temporary Gardens under the existing retention policy.

Evidence: [native form](native.png), [imported form](portable.png), [native calls](native-calls.json), [imported calls](portable-calls.json). Tool sequences use the deterministic mock model; real-model discovery and collaboration usefulness remain separate acceptance work. Native text/global property behavior is currently covered by engine tests, not the desktop journey.

Object dialogs offer Apply/Cancel. Object/behavior/animation settings do not enter the native scene-instance Undo stack; Garden Growth preserves committed versions. Specialized property types remain non-writable. Object/behavior structural changes, frame authoring, nested event/variable editing and atomic resource creation remain unfinished families.

Root status: [GDevelop assessment](../../../GDEVELOP-INTEGRATION-ASSESSMENT.md).
