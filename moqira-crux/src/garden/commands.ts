import type { CanvasLink, CanvasNode, MockupProject, Wireframe } from '../types';
import {
  controlCatalogue,
  componentCategoryNames,
  createCanvasNode,
  linkableElementsForNode,
  nodePropertyCapabilities,
} from '../lib/canvasNodeSemantics';
import {
  createEmptyWireframe,
  duplicateWireframe,
  wireframeBackground,
  wireframeShowGrid,
} from '../lib/projectModel';
import { duplicateNodesInStack, moveNodeLayer, patchNodes } from '../lib/canvasNodeStack';
import { validateMoqiraCommand, type MoqiraCommand } from './commands-schema';

export type NativeMoqira = {
  project: MockupProject;
  selectedIds: string[];
  interactive: boolean;
  dirty: boolean;
  busy: boolean;
  canUndo: boolean;
  canRedo: boolean;
  commit: (updater: (project: MockupProject) => MockupProject) => void;
  selectWireframe: (id: string) => void;
  selectNodes: (ids: string[]) => void;
  setInteractive: (value: boolean) => void;
  undo: () => void;
  redo: () => void;
  save: () => Promise<boolean>;
};
const createId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;
function frameOf(project: MockupProject, id: string) {
  const frame = project.wireframes.find((frame) => frame.id === id);
  if (!frame) throw Error('That screen no longer exists. Inspect the project again.');
  return frame;
}
function nodeOf(frame: Wireframe, id: string) {
  const node = frame.nodes.find((node) => node.id === id);
  if (!node) throw Error('That component no longer exists in this screen. Read the screen again.');
  return node;
}
function uniqueName(project: MockupProject, name: string, except?: string) {
  const clean = name.trim();
  if (
    project.wireframes.some(
      (frame) => frame.id !== except && frame.name.trim().toLowerCase() === clean.toLowerCase(),
    )
  )
    throw Error('Choose a screen name that is not already in use.');
  return clean;
}
function assertWritable(nodes: CanvasNode[], unlocking = false) {
  if (!unlocking && nodes.some((node) => node.locked))
    throw Error('Unlock the selected components before editing them.');
}
function validateProperties(node: CanvasNode, patch: Partial<CanvasNode>) {
  if (Object.keys(patch).some((key) => key.startsWith('arrow')) && node.kind !== 'arrow')
    throw Error('Arrow properties apply only to arrows.');
  const merged = { ...node, ...patch };
  if (
    ('activeIndex' in patch || 'options' in patch) &&
    merged.options &&
    (merged.activeIndex ?? -1) >= merged.options.length
  )
    throw Error('Choose an active index within the component options, or -1 for none.');
}
function safeNode(node: CanvasNode, full = false) {
  const { imageDataUrl, ...properties } = node;
  const truncatedFields: string[] = [];
  const result: Record<string, unknown> = { ...properties };
  for (const [key, value] of Object.entries(result)) {
    if (typeof value === 'string' && value.length > (full ? 8000 : 200)) {
      result[key] = value.slice(0, full ? 8000 : 200);
      truncatedFields.push(key);
    } else if (Array.isArray(value)) {
      const limit = full ? 100 : 5;
      result[key] = value
        .slice(0, limit)
        .map((item) => (typeof item === 'string' ? item.slice(0, full ? 2000 : 200) : item));
      if (
        value.length > limit ||
        value.some((item) => typeof item === 'string' && item.length > (full ? 2000 : 200))
      )
        truncatedFields.push(key);
    }
  }
  if (JSON.stringify(result.links ?? {}).length > 16000) {
    result.links = { omitted: true, total: Object.keys(node.links ?? {}).length };
    truncatedFields.push('links');
  }
  return { ...result, hasImage: !!imageDataUrl, truncatedFields };
}
function inspect(
  native: NativeMoqira,
  token: string,
  args: { offset?: number; limit?: number } = {},
) {
  const offset = args.offset ?? 0,
    limit = args.limit ?? 50;
  const frames = native.project.wireframes;
  return {
    name: native.project.name,
    activeWireframeId: native.project.activeWireframeId,
    selectedIds: native.selectedIds.slice(0, 100),
    interactive: native.interactive,
    dirty: native.dirty,
    canUndo: native.canUndo,
    canRedo: native.canRedo,
    stateToken: token,
    total: frames.length,
    offset,
    nextOffset: offset + limit < frames.length ? offset + limit : null,
    wireframes: frames
      .slice(offset, offset + limit)
      .map((frame) => ({
        id: frame.id,
        name: frame.name,
        components: frame.nodes.length,
        background: wireframeBackground(frame),
        showGrid: wireframeShowGrid(frame),
      })),
  };
}
export function createMoqiraCommands(options: {
  read: () => NativeMoqira;
  stateToken: () => string;
  act: (action: () => void) => Promise<void>;
  loadImage: (
    path: string,
  ) => Promise<
    Pick<CanvasNode, 'imageDataUrl' | 'imageMimeType' | 'imageNaturalWidth' | 'imageNaturalHeight'>
  >;
  saveOutput: (label: string, bytes: ArrayBuffer) => Promise<unknown>;
}) {
  const { read, stateToken, act } = options;
  const guard = (args: MoqiraCommand) => {
    if (args.expectedState && args.expectedState !== stateToken())
      throw Error('Moqira changed since inspection. Inspect again before editing.');
    if (read().busy)
      throw Error('Finish or cancel the current Moqira edit before using App Tools.');
  };
  const commit = async (
    args: MoqiraCommand,
    updater: (project: MockupProject) => MockupProject,
    selection?: string[],
  ) => {
    guard(args);
    if (read().interactive) throw Error('Switch Moqira to edit mode before changing the design.');
    // Size-check the native projection before entering its existing history transaction.
    const next = updater(read().project);
    if (JSON.stringify(next, null, 2).length > 8_000_000)
      throw Error('The editable project exceeds 8 MB. Use a smaller image or fewer components.');
    await act(() => {
      read().commit(updater);
      if (selection) read().selectNodes(selection);
    });
  };
  return {
    prepare(value: unknown) {
      const args = validateMoqiraCommand(value);
      const mutates = !['inspect', 'catalogue', 'read-wireframe', 'read-component'].includes(
        args.op,
      );
      return {
        mutates,
        ...(mutates && args.op !== 'save-project'
          ? {
              result: (value: unknown) => ({
                ...inspect(read(), stateToken()),
                ...(value as object),
              }),
            }
          : {}),
        async apply(): Promise<unknown> {
          guard(args);
          const native = read(),
            project = native.project;
          if (args.op === 'inspect') return inspect(native, stateToken(), args);
          if (args.op === 'catalogue') {
            const query = args.query?.trim().toLowerCase() ?? '';
            const entries = controlCatalogue.filter((item) =>
              `${item.kind} ${item.label} ${componentCategoryNames(item).join(' ')}`
                .toLowerCase()
                .includes(query),
            );
            const offset = args.offset ?? 0,
              limit = args.limit ?? 20;
            return {
              total: entries.length,
              offset,
              nextOffset: offset + limit < entries.length ? offset + limit : null,
              components: entries
                .slice(offset, offset + limit)
                .map((item) => ({
                  ...item,
                  defaults: safeNode(createCanvasNode(item.kind, 0, 0, 'example')),
                  capabilities: nodePropertyCapabilities(
                    createCanvasNode(item.kind, 0, 0, 'example'),
                  ),
                })),
            };
          }
          if (args.op === 'save-project')
            return options.saveOutput(
              args.label!,
              new TextEncoder().encode(JSON.stringify(project, null, 2)).buffer as ArrayBuffer,
            );
          if (args.op === 'history') {
            if (native.interactive)
              throw Error('Switch Moqira to edit mode before using Undo or Redo.');
            if (args.direction === 'undo' ? !native.canUndo : !native.canRedo)
              throw Error(`There is no native ${args.direction} step available.`);
            await act(() => (args.direction === 'undo' ? native.undo() : native.redo()));
            return { direction: args.direction };
          }
          if (args.op === 'create-wireframe') {
            if (project.wireframes.length >= 500) throw Error('Use at most 500 wireframes.');
            const frame = createEmptyWireframe(
              createId('wireframe'),
              uniqueName(project, args.name!),
            );
            await commit(
              args,
              (current) => ({
                ...current,
                activeWireframeId: frame.id,
                wireframes: [...current.wireframes, frame],
              }),
              [],
            );
            return { createdId: frame.id };
          }
          if (args.op === 'set-view') {
            const frame = frameOf(project, args.wireframeId ?? project.activeWireframeId);
            for (const id of args.selectedIds ?? []) nodeOf(frame, id);
            await act(() => {
              if (args.wireframeId) native.selectWireframe(args.wireframeId);
              if (args.selectedIds) native.selectNodes(args.selectedIds);
              if (args.interactive !== undefined) native.setInteractive(args.interactive);
            });
            return {};
          }
          const frame = frameOf(project, args.wireframeId!);
          const updateFrame =
            (updater: (frame: Wireframe) => Wireframe) =>
            (current: MockupProject): MockupProject => ({
              ...current,
              wireframes: current.wireframes.map((item) =>
                item.id === frame.id ? updater(item) : item,
              ),
            });
          if (args.op === 'read-wireframe') {
            const offset = args.offset ?? 0,
              limit = args.limit ?? 50;
            return {
              id: frame.id,
              name: frame.name,
              background: wireframeBackground(frame),
              showGrid: wireframeShowGrid(frame),
              total: frame.nodes.length,
              offset,
              nextOffset: offset + limit < frame.nodes.length ? offset + limit : null,
              components: frame.nodes.slice(offset, offset + limit).map((node) => safeNode(node)),
              stateToken: stateToken(),
            };
          }
          if (args.op === 'read-component') {
            const node = nodeOf(frame, args.id!);
            if (args.field) {
              const field = node[args.field] ?? (args.field === 'text' ? '' : []);
              const offset = args.offset ?? 0,
                limit = Math.min(
                  args.limit ?? (typeof field === 'string' ? 8000 : 100),
                  typeof field === 'string' ? 8000 : 100,
                );
              return {
                id: node.id,
                field: args.field,
                value: field.slice(offset, offset + limit),
                total: field.length,
                offset,
                nextOffset: offset + limit < field.length ? offset + limit : null,
                stateToken: stateToken(),
              };
            }
            return {
              component: safeNode(node, true),
              capabilities: nodePropertyCapabilities(node),
              linkTargets: linkableElementsForNode(node).slice(0, 100),
              stateToken: stateToken(),
            };
          }
          if (args.op === 'update-wireframe') {
            const patch = {
              ...(args.name !== undefined
                ? { name: uniqueName(project, args.name, frame.id) }
                : {}),
              ...(args.background !== undefined ? { background: args.background } : {}),
              ...(args.showGrid !== undefined ? { showGrid: args.showGrid } : {}),
            };
            await commit(
              args,
              updateFrame((current) => ({ ...current, ...patch })),
            );
            return { changedId: frame.id };
          }
          if (args.op === 'duplicate-wireframe') {
            if (project.wireframes.length >= 500) throw Error('Use at most 500 wireframes.');
            const copy = duplicateWireframe(frame, project.wireframes, createId);
            await commit(
              args,
              (current) => ({
                ...current,
                activeWireframeId: copy.id,
                wireframes: [...current.wireframes, copy],
              }),
              [],
            );
            return { createdId: copy.id };
          }
          if (args.op === 'delete-wireframe') {
            if (project.wireframes.length <= 1) throw Error('Keep at least one wireframe.');
            if (frame.nodes.length && !args.allowNonEmpty)
              throw Error('Set allowNonEmpty to remove a screen with components.');
            if (
              project.wireframes.some(
                (other) =>
                  other.id !== frame.id &&
                  other.nodes.some((node) =>
                    Object.values(node.links ?? {}).some(
                      (link) => link?.kind === 'wireframe' && link.wireframeId === frame.id,
                    ),
                  ),
              )
            )
              throw Error('Remove links to this screen before deleting it.');
            await commit(
              args,
              (current) => {
                const wireframes = current.wireframes.filter((item) => item.id !== frame.id);
                return {
                  ...current,
                  wireframes,
                  activeWireframeId:
                    current.activeWireframeId === frame.id
                      ? wireframes[0].id
                      : current.activeWireframeId,
                };
              },
              [],
            );
            return { deletedId: frame.id };
          }
          if (args.op === 'add-components' || args.op === 'add-image') {
            const nodes =
              args.op === 'add-components'
                ? args.components!.map((item) => {
                    const node = createCanvasNode(item.kind, 0, 0, createId('node'));
                    validateProperties(node, item.properties ?? {});
                    return { ...node, ...item.properties };
                  })
                : [
                    await (async () => {
                      const image = await options.loadImage(args.path!);
                      const naturalWidth = image.imageNaturalWidth!,
                        naturalHeight = image.imageNaturalHeight!;
                      const width = args.width ?? Math.min(naturalWidth, 640);
                      const height =
                        args.height ??
                        Math.max(1, Math.round((width * naturalHeight) / naturalWidth));
                      if (height > 20000) throw Error('Choose a smaller image height.');
                      return {
                        ...createCanvasNode('image', args.x!, args.y!, createId('node')),
                        ...image,
                        width,
                        height,
                      };
                    })(),
                  ];
            if (frame.nodes.length + nodes.length > 10000)
              throw Error('Use at most 10000 components per screen.');
            await commit(
              args,
              updateFrame((current) => ({ ...current, nodes: [...current.nodes, ...nodes] })),
              project.activeWireframeId === frame.id ? nodes.map((node) => node.id) : undefined,
            );
            return { createdIds: nodes.map((node) => node.id) };
          }
          if (args.op === 'update-components') {
            for (const patch of args.patches!) {
              const node = nodeOf(frame, patch.id);
              const unlocking =
                Object.keys(patch.properties).length === 1 && patch.properties.locked === false;
              assertWritable([node], unlocking);
              validateProperties(node, patch.properties);
            }
            const patches = Object.fromEntries(
              args.patches!.map((patch) => [patch.id, patch.properties]),
            );
            await commit(
              args,
              updateFrame((current) => ({ ...current, nodes: patchNodes(current.nodes, patches) })),
            );
            return { changedIds: args.patches!.map((patch) => patch.id) };
          }
          if (args.op === 'set-link') {
            const node = nodeOf(frame, args.id!);
            assertWritable([node]);
            if (
              !linkableElementsForNode(node).some((target) => target.key === args.key) &&
              !(
                args.link!.kind === 'none' &&
                Object.prototype.hasOwnProperty.call(node.links ?? {}, args.key!)
              )
            )
              throw Error('Choose a link target returned by reading this component.');
            if (args.link!.kind === 'wireframe')
              frameOf(project, (args.link as { wireframeId: string }).wireframeId);
            const links = { ...node.links };
            if (args.link!.kind === 'none') delete links[args.key!];
            else links[args.key!] = args.link as CanvasLink;
            await commit(
              args,
              updateFrame((current) => ({
                ...current,
                nodes: patchNodes(current.nodes, { [node.id]: { links } }),
              })),
            );
            return { changedId: node.id };
          }
          const nodes = args.ids!.map((id) => nodeOf(frame, id));
          if (args.op === 'duplicate-components') {
            if (frame.nodes.length + nodes.length > 10000)
              throw Error('Use at most 10000 components per screen.');
            const duplicated = duplicateNodesInStack(frame.nodes, args.ids!, createId);
            await commit(
              args,
              updateFrame((current) => ({ ...current, nodes: duplicated.nodes })),
              project.activeWireframeId === frame.id
                ? duplicated.duplicates.map((node) => node.id)
                : undefined,
            );
            return { createdIds: duplicated.duplicates.map((node) => node.id) };
          }
          assertWritable(nodes);
          if (args.op === 'delete-components') {
            const deleted = new Set(args.ids!);
            await commit(
              args,
              updateFrame((current) => ({
                ...current,
                nodes: current.nodes.filter((node) => !deleted.has(node.id)),
              })),
              project.activeWireframeId === frame.id
                ? native.selectedIds.filter((id) => !deleted.has(id))
                : undefined,
            );
            return { deletedIds: args.ids };
          }
          if (args.op === 'reorder-components') {
            await commit(
              args,
              updateFrame((current) => ({
                ...current,
                nodes: moveNodeLayer(current.nodes, args.ids!, args.action!),
              })),
            );
            return { changedIds: args.ids };
          }
          throw Error('Unsupported Moqira command.');
        },
      };
    },
  };
}
