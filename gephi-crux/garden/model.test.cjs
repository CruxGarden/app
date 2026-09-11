const { test } = require("node:test");
const assert = require("node:assert/strict");
test("graph state requires exactly the five portable native components", async () => {
  const { validateProject, PROJECT_KEYS } = await import("./model.js");
  const asset = {
    __cruxBinary: { path: "assets/" + "a".repeat(64) + ".bin", kind: "buffer", type: "application/json", size: 12 },
  };
  const doc = { version: 1, app: "gephi", project: Object.fromEntries(PROJECT_KEYS.map((k) => [k, asset])) };
  validateProject(doc);
  assert.throws(() => validateProject({ ...doc, project: { dataset: asset } }));
  assert.throws(() =>
    validateProject({
      ...doc,
      project: { ...doc.project, dataset: { __cruxBinary: { ...asset.__cruxBinary, path: "../data.json" } } },
    }),
  );
});
