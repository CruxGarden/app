import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getServices, initServices } from '@/services';
import { createCruxStore } from './cruxStore';
import { createUIStore } from './uiStore';
import { useToastStore } from './toastStore';

beforeEach(async () => {
  await initServices();
  useToastStore.setState({ toasts: [] });
});
afterEach(() => vi.restoreAllMocks());

async function workspace(title: string) {
  const crux = await getServices().crux.create({ title });
  const ui = createUIStore(crux.id);
  const data = createCruxStore(ui);
  await data.getState().loadCrux(crux.id);
  return { crux, ui, data };
}

it('keeps the pasted text and current typing when its save is refused', async () => {
  const { ui, data } = await workspace('Brief');
  let refuse!: (error: Error) => void;
  vi.spyOn(getServices().artifact, 'create').mockImplementationOnce(
    () =>
      new Promise((_, reject) => {
        refuse = reject;
      }),
  );
  ui.getState().setComposerDraft('Original');
  const operation = data.getState().pasteAsArtifact('Full pasted text');
  ui.getState().setComposerDraft('New typing');
  refuse(new Error('Disk refused'));
  await operation;
  expect(ui.getState().composerDraft).toBe('New typing\nFull pasted text');
  expect(useToastStore.getState().toasts.at(-1)?.message).toContain('text is kept in your draft');
  expect(data.getState().artifacts).toHaveLength(0);
});

it.each(['Typed while saving', ''])(
  'appends a reference to the current draft %j in its owning workspace',
  async (currentDraft) => {
    const a = await workspace('A');
    const b = await workspace('B');
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const original = getServices().artifact.create.bind(getServices().artifact);
    vi.spyOn(getServices().artifact, 'create').mockImplementationOnce(async (input) => {
      await gate;
      return original(input);
    });
    a.ui.getState().setComposerDraft('Before');
    b.ui.getState().setComposerDraft('Other workspace');
    const operation = a.data.getState().pasteAsArtifact('# A brief\nActual contents');
    a.ui.getState().setComposerDraft(currentDraft);
    release();
    await operation;
    const [file] = await getServices().artifact.findByResource('crux', a.crux.id);
    if (!file) throw new Error('The pasted Artifact was not saved');
    expect(file.meta?.path).toMatch(/^notes\/a-brief-/);
    expect(await getServices().artifact.readContent(file.id)).toBe('# A brief\nActual contents');
    expect(a.ui.getState().composerDraft).toBe(
      `${currentDraft ? `${currentDraft}\n` : ''}Read ${file.meta?.path} first (pasted, 25 characters).`,
    );
    expect(b.ui.getState().composerDraft).toBe('Other workspace');
    expect(await getServices().artifact.findByResource('crux', b.crux.id)).toHaveLength(0);
    expect(a.data.getState().artifacts.map((item) => item.id)).toContain(file.id);
  },
);

it('keeps repeated pastes with identical first lines as separate files and references', async () => {
  const { crux, ui, data } = await workspace('Repeated briefs');
  await data.getState().pasteAsArtifact('# Same title\nFirst');
  await data.getState().pasteAsArtifact('# Same title\nSecond');
  const files = await getServices().artifact.findByResource('crux', crux.id);
  expect(
    (await Promise.all(files.map((file) => getServices().artifact.readContent(file.id)))).sort(),
  ).toEqual(['# Same title\nFirst', '# Same title\nSecond']);
  expect(new Set(files.map((file) => file.meta?.path)).size).toBe(2);
  for (const file of files)
    expect(ui.getState().composerDraft).toContain(`Read ${file.meta?.path} first`);
});
