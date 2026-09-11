export const PROJECT_KEYS = ["dataset", "appearance", "filters", "session", "preferences"];
export function validateProject(doc) {
  if (!doc || doc.version !== 1 || doc.app !== "gephi") throw new Error("Invalid Gephi project");
  if (doc.project === null) return;
  if (!doc.project || Object.keys(doc.project).length !== PROJECT_KEYS.length) throw new Error("Invalid graph state");
  for (const key of PROJECT_KEYS) {
    const ref = doc.project[key]?.__cruxBinary;
    if (
      !ref ||
      !/^assets\/[a-f0-9]{64}\.bin$/.test(ref.path) ||
      ref.kind !== "buffer" ||
      ref.type !== "application/json" ||
      !Number.isSafeInteger(ref.size) ||
      ref.size < 1 ||
      ref.size > 128 * 1024 * 1024
    )
      throw new Error("Invalid graph state Artifact");
  }
}
