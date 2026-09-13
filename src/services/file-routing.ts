/**
 * File-drop routing (V1-GAPS-PLAN.md §2.3): a file or folder dropped on Home
 * or chosen in Add Crux picks the Crux Tool, makes the Crux with the file
 * inside it, and asks the app to open it where the app has a tool for that.
 * A person never has to know which tile to choose first.
 */
import type { ChatMessage, CruxKind } from '@/api/types';
import { getServices } from './index';
import { applyTemplateToCrux } from './crux-create';
import { setSetting } from './settings';
import { createCruxStore } from '@/stores/cruxStore';
import { useUIStore } from '@/stores/uiStore';

export interface DroppedFile {
  /** Path relative to the drop (a folder keeps its structure); a single file is its name. */
  path: string;
  file: File;
}
export interface FileRoute {
  templateId: string;
  kind: CruxKind;
  /** The tool's name for the notice. */
  tool: string;
  /** Where the file lands in the Crux (folder). */
  folder: string;
  /** An App Tool that opens the placed file once the app is up. */
  open?: { tool: string; input: (path: string) => Record<string, unknown> };
}

const IMAGE = /\.(png|jpe?g|gif|webp|bmp|psd)$/i;
const ROUTES: { test: RegExp; route: FileRoute }[] = [
  {
    test: /\.docx$/i,
    route: {
      templateId: 'notes',
      kind: 'notes',
      tool: 'Tigrana Notes',
      folder: 'inbox',
      open: { tool: 'import_document', input: (path) => ({ path }) },
    },
  },
  { test: /\.(md|markdown|txt)$/i, route: { templateId: 'notes', kind: 'notes', tool: 'Tigrana Notes', folder: 'notebook/Imported' } },
  { test: /\.(xlsx|xls|csv|tsv)$/i, route: { templateId: 'tool-univer', kind: 'webapp', tool: 'Univer Sheets', folder: 'inbox' } },
  { test: IMAGE, route: { templateId: 'minipaint-app', kind: 'webapp', tool: 'miniPaint', folder: 'images' } },
  { test: /\.svg$/i, route: { templateId: 'svgedit-app', kind: 'webapp', tool: 'SVG-Edit', folder: 'images' } },
  { test: /\.(mp4|webm|mov|mkv|m4v)$/i, route: { templateId: 'opencut-app', kind: 'webapp', tool: 'OpenCut', folder: 'media' } },
  { test: /\.(wav|mp3|ogg|flac|m4a|aiff?)$/i, route: { templateId: 'audiomass-app', kind: 'webapp', tool: 'AudioMass', folder: 'audio' } },
  { test: /\.pdf$/i, route: { templateId: 'bentopdf-app', kind: 'webapp', tool: 'BentoPDF', folder: 'documents' } },
  { test: /\.ipynb$/i, route: { templateId: 'jupyterlite-app', kind: 'webapp', tool: 'JupyterLite', folder: 'inbox' } },
  { test: /\.moq$/i, route: { templateId: 'moqira', kind: 'webapp', tool: 'Moqira', folder: 'inbox' } },
  { test: /\.piskel$/i, route: { templateId: 'piskel-app', kind: 'webapp', tool: 'Piskel', folder: 'inbox' } },
  { test: /\.wick$/i, route: { templateId: 'wick-editor-app', kind: 'webapp', tool: 'Wick Editor', folder: 'inbox' } },
  { test: /\.(twee|tw)$/i, route: { templateId: 'twine-app', kind: 'webapp', tool: 'Twine', folder: 'inbox' } },
  { test: /\.bbmodel$/i, route: { templateId: 'blockbench-app', kind: 'webapp', tool: 'Blockbench', folder: 'inbox' } },
  { test: /\.(mmd|mermaid)$/i, route: { templateId: 'mermaid-app', kind: 'webapp', tool: 'Mermaid', folder: 'inbox' } },
  { test: /\.(ket|mol|sdf|rxn)$/i, route: { templateId: 'ketcher-app', kind: 'webapp', tool: 'Ketcher', folder: 'inbox' } },
  { test: /\.(gexf|graphml)$/i, route: { templateId: 'gephi-app', kind: 'webapp', tool: 'Gephi Lite', folder: 'inbox' } },
  { test: /\.pptx$/i, route: { templateId: 'pptist-app', kind: 'webapp', tool: 'PPTist', folder: 'inbox' } },
  { test: /\.ics$/i, route: { templateId: 'eventcalendar-app', kind: 'webapp', tool: 'Calendar', folder: 'inbox' } },
  { test: /\.html?$/i, route: { templateId: 'blank', kind: 'webapp', tool: 'a Blank Crux', folder: '' } },
];

export const stem = (name: string) =>
  (name.replace(/^.*\//, '').replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'File').slice(0, 80);

/** The route for a dropped file, or null when no tool takes it. */
export function routeFile(name: string): FileRoute | null {
  return ROUTES.find((r) => r.test.test(name))?.route ?? null;
}
/** A dropped folder: a notebook when it holds Markdown, a Blank Crux with the files otherwise. */
export function routeFolder(files: DroppedFile[]): FileRoute | null {
  if (!files.length) return null;
  if (files.some((f) => /\.(md|markdown)$/i.test(f.path)))
    return { templateId: 'notes', kind: 'notes', tool: 'Tigrana Notes', folder: 'notebook/Imported' };
  return { templateId: 'blank', kind: 'webapp', tool: 'a Blank Crux', folder: '' };
}
export const isArchive = (name: string) => /\.(crux|cruxspace)$/i.test(name);

const safeSegment = (s: string) =>
  s.replace(/[\\:*?"<>|]+/g, '-').split('/').filter((p) => p && p !== '.' && p !== '..' && !p.startsWith('.')).join('/');

/** Files from a drop, walking folders (webkitGetAsEntry) so a notebook keeps its structure. */
export async function filesFromDataTransfer(dt: DataTransfer): Promise<{ files: DroppedFile[]; folder: string | null }> {
  const items = Array.from(dt.items ?? []);
  const entries = items.map((item) => (typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null));
  if (!entries.some(Boolean))
    return { files: Array.from(dt.files).map((file) => ({ path: file.name, file })), folder: null };
  const out: DroppedFile[] = [];
  let folder: string | null = null;
  const walk = async (entry: FileSystemEntry, prefix: string): Promise<void> => {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
      out.push({ path: prefix + entry.name, file });
      return;
    }
    if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      const children: FileSystemEntry[] = [];
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
        if (!batch.length) break;
        children.push(...batch);
      }
      for (const child of children) await walk(child, prefix + entry.name + '/');
    }
  };
  for (const entry of entries) {
    if (!entry) continue;
    if (entry.isDirectory && entries.filter(Boolean).length === 1) {
      folder = entry.name;
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
        if (!batch.length) break;
        for (const child of batch) await walk(child, '');
      }
    } else await walk(entry, '');
  }
  return { files: out, folder };
}

export interface StartFromFilesResult {
  cruxId: string;
  route: FileRoute;
  placed: string[];
}

/**
 * Make the Crux for these files, put the files in it, note where they went, and
 * remember an App Tool to run once the app is up. The caller navigates.
 */
export async function startFromFiles(
  files: DroppedFile[],
  folderName: string | null = null,
): Promise<StartFromFilesResult> {
  if (!files.length) throw new Error('Drop a file or a folder.');
  const route = folderName ? routeFolder(files) : routeFile(files[0]!.path);
  if (!route) throw new Error(`No Crux Tool opens ${files[0]!.path.split('/').pop()}. Try a document, image, sound, video, PDF, notebook or project file.`);
  const others = folderName ? [] : files.filter((f) => !routeFile(f.path) || routeFile(f.path)!.templateId !== route.templateId);
  if (others.length) throw new Error('Drop files for one tool at a time.');
  const title = folderName ? stem(folderName) : files.length === 1 ? stem(files[0]!.path) : `${stem(files[0]!.path)} and ${files.length - 1} more`;
  const store = createCruxStore();
  const crux = await store.getState().createCrux(title);
  let latest = crux;
  let messages = (crux.meta?.messages as ChatMessage[] | undefined) ?? [];
  if (route.templateId !== 'blank') {
    const applied = await applyTemplateToCrux(crux, route.templateId, route.kind);
    latest = applied.crux;
    if (applied.messages) messages = applied.messages;
  }
  useUIStore.getState().seedCruxLayout(
    crux.id,
    route.templateId === 'notes' ? 27 : route.templateId === 'moqira' || route.templateId.startsWith('tool-') ? 22 : undefined,
  );
  const { artifact } = getServices();
  const placed: string[] = [];
  const base = route.folder === 'notebook/Imported' ? `notebook/Imported/${safeSegment(folderName ?? stem(files[0]!.path))}` : route.folder;
  for (const dropped of files) {
    let rel = safeSegment(folderName ? dropped.path : dropped.path.split('/').pop()!);
    if (!rel) continue;
    if (route.templateId === 'notes' && /\.txt$/i.test(rel)) rel = rel.replace(/\.txt$/i, '.md');
    const path = base ? `${base}/${rel}` : rel;
    const text = /\.(md|markdown|txt|csv|tsv|html?|svg|json|twee|tw|mmd|mermaid|ics|ket|mol|sdf|rxn|gexf|graphml)$/i.test(rel);
    if (text)
      await artifact.create({ resourceId: crux.id, content: await dropped.file.text(), meta: { path } });
    else
      await artifact.upload({
        resourceId: crux.id,
        blob: dropped.file,
        mimeType: dropped.file.type || undefined,
        meta: { path },
      });
    placed.push(path);
  }
  if (route.open && placed.length === 1)
    setSetting(`cruxgarden:pending-open:${crux.id}`, JSON.stringify({ tool: route.open.tool, input: route.open.input(placed[0]!) }));
  const where = placed.length === 1 ? placed[0] : `${base || 'the Crux'} (${placed.length} files)`;
  // The notice is part of the Crux's Collaboration, so it is there when the Crux opens.
  const notice: ChatMessage = {
    role: 'assistant',
    content:
      route.open && placed.length === 1
        ? `Started from ${placed[0]!.split('/').pop()}: it is in this Crux at ${where}, and ${route.tool} is bringing it in.`
        : `Started from ${folderName ? `the folder ${folderName}` : placed[0]!.split('/').pop()}: ${placed.length === 1 ? 'it is' : 'the files are'} in this Crux at ${where}. Open ${placed.length === 1 ? 'it' : 'them'} from ${route.tool}.`,
    timestamp: new Date().toISOString(),
  };
  await getServices().crux.update(crux.id, {
    meta: { ...(latest.meta ?? {}), messages: [...messages, notice] },
  });
  return { cruxId: crux.id, route, placed };
}
