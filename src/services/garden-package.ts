import { getServices } from './index';
/** A `.cruxspace` package grows as a new Garden inside this one. */
export async function importGardenPackage(file: Blob, gardenId: string): Promise<string> {
  const [{ importCruxspace }, { isEmbeddedApp }, { useUIStore }] = await Promise.all([
    import('@/services/cruxspace-package'),
    import('@/services/embedded-app'),
    import('@/stores/uiStore'),
  ]);
  let result: Awaited<ReturnType<typeof importCruxspace>>;
  try {
    result = await importCruxspace({ data: file, gardenId });
  } catch (error) {
    // Refused cleanup can leave a new partial Garden. Refresh the normal Home
    // inventory before reporting it so the person can find and review it.
    await (
      await import('@/stores/gardenStore')
    ).useGardenStore
      .getState()
      .refresh()
      .catch(() => undefined);
    throw error;
  }
  // Imported apps open on their Workshop, as they would when created here.
  for (const member of result.members)
    if (isEmbeddedApp(await getServices().crux.findById(member.id)))
      useUIStore.getState().seedCruxLayout(member.id, 27);
  return result.space.id;
}
