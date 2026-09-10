/** Built-in apps with private data and an explicit public edition. */
export function isMoqira(crux: { meta?: Record<string, unknown> } | null | undefined) {
  return crux?.meta?.template === 'moqira';
}
export function isEmbeddedApp(
  crux: { kind?: string; meta?: Record<string, unknown> } | null | undefined,
) {
  return crux?.kind === 'notes' || isMoqira(crux);
}
export function moqiraPath(value: unknown): string {
  if (value !== 'project.json' && value !== 'publish.json')
    throw new Error('Moqira can access only its project and publication settings.');
  return 'mockups/' + value;
}
export function validateMoqiraFile(path: string, content: string) {
  const data = JSON.parse(content);
  if (path === 'mockups/publish.json') {
    if (
      !data ||
      typeof data.title !== 'string' ||
      !Array.isArray(data.wireframes) ||
      data.wireframes.some((id: unknown) => typeof id !== 'string')
    )
      throw new Error('Choose a title and wireframes to publish.');
  } else if (
    !data ||
    data.schemaVersion !== 1 ||
    typeof data.name !== 'string' ||
    !data.appearance ||
    !Array.isArray(data.wireframes) ||
    !data.wireframes.length ||
    data.wireframes.some(
      (frame: { id?: unknown; name?: unknown; nodes?: unknown }) =>
        !frame ||
        typeof frame.id !== 'string' ||
        typeof frame.name !== 'string' ||
        !Array.isArray(frame.nodes),
    )
  ) {
    throw new Error('Choose a valid Moqira project (schema version 1).');
  }
}
