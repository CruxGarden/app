# 3D Workshop in Crux Garden

Add a box, sphere, cylinder or cone; select it, change its name, transform and color, toggle animation and switch between front/isometric views. Export scene JSON. This uses the actual PlayCanvas Engine; it is a small scene workshop, not the hosted PlayCanvas Editor. There are no model uploads, physics colliders, scripts UI or game packaging in this first slice.

Try asking the agent: “Inspect the scene, make the Sunstone orange and add a small blue cube beside it.” Available App Tools: `inspect_scene`, `upsert_scene_objects`. The app must be open in Workshop. Commands inspect/change the same project as the manual controls, and success means the save was acknowledged.

The editable document is `data/project.json`; app source and local runtime are separate Artifacts. Changes save automatically with Growth. Save now retries a failed save. Reload saved project loads external changes and asks before discarding a live draft. Conflicting saves preserve that draft. Export buttons save first.

Export Crux preserves the complete editable project and private Collaboration, Tasks and Growth. App-specific downloads are a separate result. Website sharing is not enabled for this local tool. Use Customize app to change source in a Task.

PlayCanvas Engine 2.22.1, MIT, in vendor/. Upstream skills at e58c29fbdab043863b17538f49a30bd9f391be22 are in skills/ with their MIT notice. Follow the direct Engine guidance when customizing source; preserve semantic object roots and apply visual scale once.

Garden adapter sources use `shared/LICENSE.md`. Runtime metadata includes package versions and reproduction details. The pinned build recipe and lockfile live in the Crux Garden app repository under `tool-cruxes/`.
