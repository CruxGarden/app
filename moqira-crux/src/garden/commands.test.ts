import { expect, it, vi } from 'vitest';
import { createMoqiraCommands, type NativeMoqira } from './commands';
import { createCommandSession } from './shared/command-session.js';
import {
  createDefaultProject,
  createProjectHistory,
  commitProjectHistoryChange,
  undoProjectHistory,
  redoProjectHistory,
} from '../lib/projectModel';
import { createCanvasNode } from '../lib/canvasNodeSemantics';
import type { CanvasNode } from '../types';

function fixture() {
  const initial = createDefaultProject(() => 'home');
  initial.name = 'project';
  initial.wireframes[0].nodes = [
    { ...createCanvasNode('button', 10, 20, 'manual'), text: 'Person wrote this', fill: '#123456' },
  ];
  let history = createProjectHistory(initial),
    version = 1;
  const save = vi.fn(async () => {
    native.dirty = false;
    return true;
  });
  const native: NativeMoqira = {
    get project() {
      return history.present;
    },
    selectedIds: [],
    interactive: false,
    dirty: false,
    busy: false,
    get canUndo() {
      return history.past.length > 0;
    },
    get canRedo() {
      return history.future.length > 0;
    },
    commit(updater) {
      history = commitProjectHistoryChange(history, updater, {}, null).history;
      version++;
      native.dirty = true;
    },
    selectWireframe(id) {
      history = { ...history, present: { ...history.present, activeWireframeId: id } };
      version++;
    },
    selectNodes(ids) {
      native.selectedIds = ids;
    },
    setInteractive(value) {
      native.interactive = value;
      version++;
    },
    undo() {
      history = undoProjectHistory(history);
      version++;
      native.dirty = true;
    },
    redo() {
      history = redoProjectHistory(history);
      version++;
      native.dirty = true;
    },
    save,
  };
  const loadImage = vi.fn(
    async (): Promise<Partial<CanvasNode>> => ({
      imageDataUrl: 'data:image/png;base64,AAAA',
      imageNaturalWidth: 20,
      imageNaturalHeight: 10,
      imageMimeType: 'image/png',
    }),
  );
  const saveOutput = vi.fn(async (label: string, bytes: ArrayBuffer) => ({
    label,
    content: new TextDecoder().decode(bytes),
  }));
  const commands = createMoqiraCommands({
    read: () => native,
    stateToken: () => String(version),
    act: async (action) => action(),
    loadImage,
    saveOutput,
  });
  const session = createCommandSession({
    settle: async () => {},
    prepare: commands.prepare,
    save: async () => {
      await save();
    },
  });
  return {
    native,
    save,
    loadImage,
    saveOutput,
    history: () => history,
    run: (op: string, input: Record<string, unknown> = {}) =>
      session.execute({ op, ...input }) as Promise<any>,
    edit: (op: string, input: Record<string, unknown> = {}) =>
      session.execute({ op, expectedState: String(version), ...input }) as Promise<any>,
  };
}
it('creates native controls in one Undo transaction and preserves the person’s properties through scoped updates', async () => {
  const f = fixture();
  const added = await f.edit('add-components', {
    wireframeId: 'home',
    components: [
      { kind: 'textTitle', properties: { text: 'Welcome', x: 80 } },
      { kind: 'checkbox' },
    ],
  });
  expect(added.createdIds).toHaveLength(2);
  expect(f.history().past).toHaveLength(1);
  await f.edit('update-components', {
    wireframeId: 'home',
    patches: [{ id: 'manual', properties: { width: 220 } }],
  });
  expect(f.native.project.wireframes[0].nodes[0]).toMatchObject({
    text: 'Person wrote this',
    fill: '#123456',
    width: 220,
  });
  await f.edit('history', { direction: 'undo' });
  expect(f.native.project.wireframes[0].nodes[0].width).not.toBe(220);
  await f.edit('history', { direction: 'undo' });
  expect(f.native.project.wireframes[0].nodes).toHaveLength(1);
  await f.edit('history', { direction: 'redo' });
  expect(f.native.project.wireframes[0].nodes).toHaveLength(3);
});
it('rejects stale state, missing IDs and invalid later batch entries without partial edits', async () => {
  const f = fixture(),
    initial = JSON.stringify(f.native.project);
  await expect(
    f.edit('update-wireframe', { wireframeId: 'home', name: 'Stale', expectedState: 'old' }),
  ).rejects.toThrow('changed since');
  await expect(
    f.edit('update-components', {
      wireframeId: 'home',
      patches: [
        { id: 'manual', properties: { text: 'wrong' } },
        { id: 'missing', properties: { text: 'wrong' } },
      ],
    }),
  ).rejects.toThrow('no longer exists');
  await expect(
    f.edit('add-components', {
      wireframeId: 'home',
      components: [{ kind: 'button' }, { kind: 'button', properties: { arrowHeadEnd: true } }],
    }),
  ).rejects.toThrow('only to arrows');
  expect(JSON.stringify(f.native.project)).toBe(initial);
  expect(f.history().past).toHaveLength(0);
  await f.edit('update-wireframe', { wireframeId: 'home', name: 'Recovered' });
  expect(f.native.project.wireframes[0].name).toBe('Recovered');
});
it('locks, drafts and interactive mode protect manual work while allowing explicit unlock and edit mode', async () => {
  const f = fixture();
  await f.edit('update-components', {
    wireframeId: 'home',
    patches: [{ id: 'manual', properties: { locked: true } }],
  });
  await expect(
    f.edit('delete-components', { wireframeId: 'home', ids: ['manual'] }),
  ).rejects.toThrow('Unlock');
  await f.edit('update-components', {
    wireframeId: 'home',
    patches: [{ id: 'manual', properties: { locked: false } }],
  });
  f.native.busy = true;
  await expect(f.edit('create-wireframe', { name: 'No' })).rejects.toThrow('Finish or cancel');
  f.native.busy = false;
  await f.edit('set-view', { interactive: true });
  await expect(
    f.edit('delete-components', { wireframeId: 'home', ids: ['manual'] }),
  ).rejects.toThrow('edit mode');
  await f.edit('set-view', { interactive: false });
  await f.edit('delete-components', { wireframeId: 'home', ids: ['manual'] });
  expect(f.native.project.wireframes[0].nodes).toHaveLength(0);
});
it('creates links and native screen copies, and requires inbound links to be cleared before deletion', async () => {
  const f = fixture();
  const screen = await f.edit('create-wireframe', { name: 'Checkout' });
  await f.edit('set-link', {
    wireframeId: 'home',
    id: 'manual',
    key: 'whole',
    link: { kind: 'wireframe', wireframeId: screen.createdId },
  });
  const copy = await f.edit('duplicate-wireframe', { wireframeId: 'home' });
  const copied = f.native.project.wireframes.find((frame) => frame.id === copy.createdId)!;
  expect(copied.nodes[0].id).not.toBe('manual');
  expect(copied.nodes[0].links?.whole).toEqual({
    kind: 'wireframe',
    wireframeId: screen.createdId,
  });
  await expect(f.edit('delete-wireframe', { wireframeId: screen.createdId })).rejects.toThrow(
    'Remove links',
  );
  await expect(f.edit('delete-wireframe', { wireframeId: copy.createdId })).rejects.toThrow(
    'allowNonEmpty',
  );
  await f.edit('delete-wireframe', { wireframeId: copy.createdId, allowNonEmpty: true });
  await f.edit('set-link', {
    wireframeId: 'home',
    id: 'manual',
    key: 'whole',
    link: { kind: 'none' },
  });
  await f.edit('delete-wireframe', { wireframeId: screen.createdId });
  await expect(
    f.edit('delete-wireframe', { wireframeId: 'home', allowNonEmpty: true }),
  ).rejects.toThrow('at least one');
});
it('uses native stacking and duplication offsets without replacing unrelated components', async () => {
  const f = fixture();
  const { createdIds } = await f.edit('duplicate-components', {
    wireframeId: 'home',
    ids: ['manual'],
  });
  const copy = f.native.project.wireframes[0].nodes[1];
  expect(copy).toMatchObject({ x: 34, y: 44, text: 'Person wrote this' });
  await f.edit('reorder-components', { wireframeId: 'home', ids: createdIds, action: 'back' });
  expect(f.native.project.wireframes[0].nodes.map((node) => node.id)).toEqual([
    ...createdIds,
    'manual',
  ]);
});
it('embeds original image bytes, refuses edits during asynchronous loading and rejects oversize projects atomically', async () => {
  const f = fixture();
  await f.edit('add-image', { wireframeId: 'home', path: 'brand.png', x: 40, y: 50 });
  expect(f.native.project.wireframes[0].nodes[1]).toMatchObject({
    width: 20,
    height: 10,
    imageDataUrl: 'data:image/png;base64,AAAA',
  });
  f.loadImage.mockImplementationOnce(async () => {
    f.native.commit((project) => ({ ...project, name: 'New manual draft' }));
    return {
      imageDataUrl: 'data:image/png;base64,AAAA',
      imageNaturalWidth: 20,
      imageNaturalHeight: 10,
    };
  });
  await expect(
    f.edit('add-image', { wireframeId: 'home', path: 'brand.png', x: 0, y: 0 }),
  ).rejects.toThrow('changed since');
  f.loadImage.mockResolvedValueOnce({
    imageDataUrl: 'x'.repeat(8_000_001),
    imageNaturalWidth: 1,
    imageNaturalHeight: 1,
  });
  await expect(
    f.edit('add-image', { wireframeId: 'home', path: 'huge.png', x: 0, y: 0 }),
  ).rejects.toThrow('exceeds');
  expect(f.native.project.wireframes[0].nodes).toHaveLength(2);
});
it('bounds inspection, exposes native catalogue capabilities, and exports full editable content without truncating it', async () => {
  const f = fixture();
  f.native.commit((project) => ({
    ...project,
    wireframes: project.wireframes.map((frame) => ({
      ...frame,
      nodes: frame.nodes.map((node) => ({
        ...node,
        text: 'x'.repeat(9000),
        imageDataUrl: 'private-image',
      })),
    })),
  }));
  const inspected = await f.run('read-wireframe', { wireframeId: 'home', limit: 1 });
  expect(inspected.components[0].text).toHaveLength(200);
  expect(inspected.components[0].imageDataUrl).toBeUndefined();
  const part = await f.run('read-component', {
    wireframeId: 'home',
    id: 'manual',
    field: 'text',
    offset: 8000,
  });
  expect(part.value).toHaveLength(1000);
  const catalogue = await f.run('catalogue', { query: 'button', limit: 2 });
  expect(catalogue.components).toHaveLength(2);
  expect(catalogue.components[0].capabilities).toBeDefined();
  const exported = await f.run('save-project', { label: 'Editable design' });
  expect(JSON.parse(exported.content).wireframes[0].nodes[0].text).toHaveLength(9000);
  expect(JSON.parse(exported.content).wireframes[0].nodes[0].imageDataUrl).toBe('private-image');
});
