/**
 * Tigrana's NotebookStorage over the Crux Garden bridge. Tigrana's Rust side
 * keeps a notebook as a folder of Markdown files with sidecars under .tigrana
 * and images under .assets; inside a Crux that folder is the Crux's own
 * notebook/ (the same layout, so the desktop Tigrana opens it too), reached
 * through the scoped crux:notebook protocol: list, read, write and delete,
 * every write guarded by the file's fingerprint and recorded in Growth.
 */
import type {
  FolderEntry,
  LinkIndex,
  NotebookSnapshot,
  NoteEntry,
  WorkspaceMetadata,
  WorkspaceMetadataWriteResult,
} from '../types';
import type { NotebookStorage, NoteVersionEntry, TrashEntry } from '../lib/notebookStorage';
import {
  decodeTitleFromFilename,
  encodeTitleForFilename,
  validateNoteTitle,
} from '../lib/notebookNames';
import { garden } from './bridge';

const METADATA_PATH = '.tigrana/metadata.json';
const WELCOME_NOTE_PATH = 'Welcome.md';
const WELCOME_NOTE_CONTENT =
  'tih-GRAH-nuh or tee-GRAH-nah\n\n' +
  '**Tigrana** is named after an ancient archaeological site where a seal bearing early script was found - a reminder that humans have always needed simple ways to preserve their thoughts.\n\n' +
  'It may or may not also stand for that Time I Got Reincarnated As a Notes App.\n\n' +
  'Use the + icon to add a note.\n';

type Times = { createdAt: number; updatedAt: number };
const defaultMetadata = (): WorkspaceMetadata => ({
  revision: 0,
  folderOrder: {},
  noteOrder: {},
  pinnedNotes: {},
  folderIcons: {},
  folderColors: {},
  noteIcons: {},
  notePositions: {},
  bookmarks: [],
  bookmarksExpanded: true,
  expandedFolders: {},
  welcomeNoteAdded: false,
});
const isNotePath = (path: string) =>
  /\.md$/i.test(path) && !path.split('/').some((part) => part.startsWith('.'));
const sidecarFolder = (path: string) => {
  const match = /^(.*)\/\.tigrana\/folder\.json$/.exec(path);
  return match ? match[1] : null;
};
const parentOf = (path: string) => path.split('/').slice(0, -1).join('/');
const stemOf = (path: string) => (path.split('/').at(-1) ?? path).replace(/\.md$/, '');
const replacePrefix = (path: string, oldPrefix: string, newPrefix: string) =>
  path === oldPrefix
    ? newPrefix
    : path.startsWith(`${oldPrefix}/`)
      ? `${newPrefix}${path.slice(oldPrefix.length)}`
      : path;
const now = () => Date.now() / 1000;

export function createGardenNotebookStorage(): NotebookStorage {
  const files = new Map<string, string>(); // notebook path → fingerprint, as last listed
  const known = new Map<string, string>(); // notebook path → fingerprint the app last read or wrote
  const contents = new Map<string, string>();
  const times = new Map<string, Times>();
  let metadata: { value: WorkspaceMetadata; fingerprint: string | null } | null = null;
  let listed: Promise<void> | null = null;

  async function refresh() {
    const entries = (await garden.call({ op: 'list' })) as { path: string; fingerprint: string }[];
    const seen = new Set<string>();
    for (const entry of entries) {
      seen.add(entry.path);
      if (files.get(entry.path) !== entry.fingerprint) contents.delete(entry.path);
      files.set(entry.path, entry.fingerprint);
      if (!times.has(entry.path)) times.set(entry.path, { createdAt: now(), updatedAt: now() });
    }
    for (const path of [...files.keys()])
      if (!seen.has(path)) {
        files.delete(path);
        known.delete(path);
        contents.delete(path);
        times.delete(path);
      }
    garden.imagesChanged();
  }
  const ensureListed = () => (listed ??= refresh());

  async function read(path: string): Promise<string> {
    const cached = contents.get(path);
    if (cached !== undefined) return cached;
    const result = (await garden.call({ op: 'read', path })) as {
      content: string;
      fingerprint: string;
    };
    files.set(path, result.fingerprint);
    known.set(path, result.fingerprint);
    contents.set(path, result.content);
    return result.content;
  }
  async function write(path: string, content: string): Promise<void> {
    garden.mutating(1);
    try {
      // Guarded by what the app last saw, not the latest listing: a file another editor changed
      // since it was read is refused, and the draft stays open.
      const result = (await garden.call({
        op: 'write',
        path,
        expected: known.get(path) ?? (files.has(path) ? files.get(path) : null),
        content,
      })) as { fingerprint: string };
      files.set(path, result.fingerprint);
      known.set(path, result.fingerprint);
      contents.set(path, content);
      const t = times.get(path);
      times.set(path, { createdAt: t?.createdAt ?? now(), updatedAt: now() });
    } catch (error) {
      garden.failed((error as Error).message);
      throw error;
    } finally {
      garden.mutating(-1);
    }
  }
  async function remove(path: string): Promise<void> {
    garden.mutating(1);
    try {
      await garden.call({ op: 'delete', path, expected: known.get(path) ?? files.get(path) ?? null });
      files.delete(path);
      known.delete(path);
      contents.delete(path);
      times.delete(path);
    } catch (error) {
      garden.failed((error as Error).message);
      throw error;
    } finally {
      garden.mutating(-1);
    }
  }
  async function moveFile(from: string, to: string) {
    const content = await read(from);
    const t = times.get(from);
    await write(to, content);
    if (t) times.set(to, t);
    if (from !== to) await remove(from);
  }

  const notePaths = () => [...files.keys()].filter(isNotePath);
  const noteEntry = (path: string): NoteEntry => ({
    path,
    title: decodeTitleFromFilename(stemOf(path)),
    parent_path: parentOf(path),
    created_at: times.get(path)?.createdAt ?? null,
    updated_at: times.get(path)?.updatedAt ?? null,
  });
  const folderEntries = (workspace: string): FolderEntry[] => {
    const set = new Set<string>(['']);
    for (const path of files.keys()) {
      const folder = sidecarFolder(path);
      if (folder) set.add(folder);
    }
    for (const path of notePaths()) {
      let current = '';
      for (const part of path.split('/').slice(0, -1)) {
        current = current ? `${current}/${part}` : part;
        set.add(current);
      }
    }
    for (const folder of [...set]) {
      let current = '';
      for (const part of folder.split('/')) {
        if (!part) continue;
        current = current ? `${current}/${part}` : part;
        set.add(current);
      }
    }
    return [...set].map((path) => ({
      path,
      name: path
        ? decodeTitleFromFilename(path.split('/').at(-1) ?? 'Untitled')
        : workspace.split('/').at(-1) || 'Notebook',
      parent_path: parentOf(path),
    }));
  };
  const uniqueNotePath = (parentPath: string, stem: string) => {
    for (let suffix = 0; ; suffix += 1) {
      const candidate = `${parentPath ? `${parentPath}/` : ''}${suffix ? `${stem} ${suffix}` : stem}.md`;
      if (!files.has(candidate)) return candidate;
    }
  };
  async function readMetadata(): Promise<WorkspaceMetadata> {
    if (metadata) return metadata.value;
    try {
      const result = (await garden.call({ op: 'read', path: METADATA_PATH })) as {
        content: string;
        fingerprint: string;
      };
      metadata = {
        value: {
          ...defaultMetadata(),
          ...(JSON.parse(result.content) as Partial<WorkspaceMetadata>),
        },
        fingerprint: result.fingerprint,
      };
    } catch {
      metadata = { value: defaultMetadata(), fingerprint: null };
    }
    return metadata.value;
  }

  const storage: NotebookStorage = {
    capabilities: {
      atomicPathMutations: false,
      durableLinkIndex: false,
      noteHistory: false, // Growth is the notebook's history in a Crux
      recentlyDeleted: false, // the Garden's Trash keeps deleted notes
      workspaceWatching: false,
    },
    async ensureWorkspace() {
      await ensureListed();
    },
    async readLinkIndex(): Promise<LinkIndex | null> {
      return null;
    },
    async rebuildLinkIndex(): Promise<LinkIndex | null> {
      return null;
    },
    async watchWorkspace() {},
    async readNotebookSnapshot(workspace): Promise<NotebookSnapshot> {
      await refresh();
      const paths = notePaths();
      const queue = [...paths];
      await Promise.all(
        Array.from({ length: 6 }, async () => {
          while (queue.length) await read(queue.shift()!);
        }),
      );
      return {
        folders: folderEntries(workspace),
        notes: paths.map(noteEntry),
        contents: Object.fromEntries(paths.map((path) => [path, contents.get(path) ?? ''])),
        linkIndex: null,
      };
    },
    async listNotes() {
      await refresh();
      return notePaths().map(noteEntry);
    },
    async listFolders(workspace) {
      await refresh();
      return folderEntries(workspace);
    },
    async readNote(_workspace, path) {
      await ensureListed();
      return read(path);
    },
    async acquireNoteEditLock() {
      return { acquired: true };
    },
    async releaseNoteEditLock() {},
    async saveNote(_workspace, path, content) {
      await ensureListed();
      if (!files.has(path)) throw new Error('The Note no longer exists at that path.');
      await write(path, content);
      return content;
    },
    async createNote(_workspace, parentPath, title, initialContent = '') {
      validateNoteTitle(title);
      await ensureListed();
      const encoded = encodeTitleForFilename(title.trim());
      const path = `${parentPath ? `${parentPath}/` : ''}${encoded || 'Untitled'}.md`;
      if (files.has(path)) throw new Error('A note with that title already exists in this folder.');
      await write(path, initialContent);
      return {
        path,
        title: title.trim() || 'Untitled',
        parent_path: parentPath,
        created_at: now(),
        updated_at: now(),
      };
    },
    async duplicateNote(_workspace, path) {
      const content = await read(path);
      const next = uniqueNotePath(parentOf(path), `Copy of ${stemOf(path)}`);
      await write(next, content);
      return noteEntry(next);
    },
    async createFolder(_workspace, parentPath, name) {
      validateNoteTitle(name);
      await ensureListed();
      const encoded = encodeTitleForFilename(name.trim());
      const path = parentPath ? `${parentPath}/${encoded}` : encoded;
      if (folderEntries('').some((folder) => folder.path === path))
        throw new Error('A folder with that name already exists here.');
      await write(
        `${path}/.tigrana/folder.json`,
        JSON.stringify({ id: crypto.randomUUID(), name: name.trim() }, null, 2),
      );
      return { path, name: name.trim(), parent_path: parentPath };
    },
    async renameFolder(workspace, path, name) {
      validateNoteTitle(name);
      const next = `${parentOf(path) ? `${parentOf(path)}/` : ''}${encodeTitleForFilename(name.trim())}`;
      await moveTree(path, next);
      return { path: next, name: name.trim(), parent_path: parentOf(path) };
    },
    async renameNote(_workspace, path, title) {
      validateNoteTitle(title);
      const next = `${parentOf(path) ? `${parentOf(path)}/` : ''}${encodeTitleForFilename(title.trim())}.md`;
      if (path !== next && files.has(next))
        throw new Error('A note with that title already exists in this folder.');
      await moveFile(path, next);
      return { ...noteEntry(next), title: title.trim() };
    },
    async moveNote(_workspace, path, targetParentPath) {
      const fileName = path.split('/').at(-1) ?? path;
      const requested = targetParentPath ? `${targetParentPath}/${fileName}` : fileName;
      const next =
        path === requested || !files.has(requested)
          ? requested
          : uniqueNotePath(targetParentPath, stemOf(path));
      await moveFile(path, next);
      return noteEntry(next);
    },
    async moveFolder(_workspace, path, targetParentPath) {
      if (!path) throw new Error('The notebook root cannot be moved.');
      if (targetParentPath === path || targetParentPath.startsWith(`${path}/`))
        throw new Error('A folder cannot be moved inside itself.');
      const name = path.split('/').at(-1) ?? path;
      const next = targetParentPath ? `${targetParentPath}/${name}` : name;
      if (path !== next && folderEntries('').some((folder) => folder.path === next))
        throw new Error('A folder with that name already exists in the target folder.');
      await moveTree(path, next);
      return { path: next, name: decodeTitleFromFilename(name), parent_path: targetParentPath };
    },
    async deleteNote(_workspace, path) {
      await ensureListed();
      if (files.has(path)) await remove(path);
    },
    async deleteFolder(_workspace, path) {
      await ensureListed();
      for (const file of [...files.keys()]) if (file.startsWith(`${path}/`)) await remove(file);
    },
    async trashNote(workspace, path): Promise<TrashEntry | null> {
      await storage.deleteNote(workspace, path);
      return null;
    },
    async trashFolder(workspace, path): Promise<TrashEntry | null> {
      await storage.deleteFolder(workspace, path);
      return null;
    },
    async listTrash() {
      return [];
    },
    async restoreTrash() {
      return null;
    },
    async purgeTrash() {},
    async purgeTrashAll() {},
    async cleanupTrash() {
      return 0;
    },
    async listNoteVersions(): Promise<NoteVersionEntry[]> {
      return [];
    },
    async readNoteVersion() {
      return '';
    },
    async restoreNoteVersion() {
      return '';
    },
    async saveAsset(_workspace, file) {
      return saveImage(file, file.name);
    },
    async saveClipboardImageAsset() {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find((t) => /^image\/(png|jpeg|gif|webp)$/.test(t));
        if (type)
          return saveImage(
            await item.getType(type),
            `pasted.${type.split('/')[1] === 'jpeg' ? 'jpg' : type.split('/')[1]}`,
          );
      }
      throw new Error('The clipboard holds no image.');
    },
    async readAssetDataUrl(_workspace, path) {
      return read(path.replace(/^\.\//, ''));
    },
    async revealPath() {},
    async readWorkspaceMetadata() {
      return readMetadata();
    },
    async writeWorkspaceMetadata(_workspace, next): Promise<WorkspaceMetadataWriteResult> {
      const current = await readMetadata();
      if (next.revision !== current.revision) return { applied: false, metadata: current };
      // Note positions (last opened, scroll) change on every open. Written to disk they would
      // give a Crux a checkpoint per visit and every Task a metadata conflict with Main, so they
      // stay in memory until something structural (order, pins, icons, bookmarks) is written.
      const structural = ({ notePositions: _positions, revision: _revision, ...rest }: WorkspaceMetadata) =>
        JSON.stringify(rest);
      if (structural(next) === structural(current)) {
        const value = { ...next, revision: current.revision };
        metadata = { value, fingerprint: metadata?.fingerprint ?? null };
        return { applied: true, metadata: value };
      }
      const value = { ...next, revision: current.revision + 1 };
      garden.mutating(1);
      try {
        const result = (await garden.call({
          op: 'write',
          path: METADATA_PATH,
          expected: metadata?.fingerprint ?? null,
          content: JSON.stringify(value, null, 2),
        })) as { fingerprint: string };
        metadata = { value, fingerprint: result.fingerprint };
        files.set(METADATA_PATH, result.fingerprint);
      } catch (error) {
        garden.failed((error as Error).message);
        throw error;
      } finally {
        garden.mutating(-1);
      }
      return { applied: true, metadata: value };
    },
    async ensureWelcomeNote(workspace, current) {
      if (current.welcomeNoteAdded) return { metadata: current, created: false };
      await ensureListed();
      let created = false;
      if (!files.has(WELCOME_NOTE_PATH)) {
        await storage.createNote(workspace, '', 'Welcome', WELCOME_NOTE_CONTENT);
        created = true;
      }
      let result = await storage.writeWorkspaceMetadata(workspace, {
        ...current,
        welcomeNoteAdded: true,
      });
      if (!result.applied && !result.metadata.welcomeNoteAdded)
        result = await storage.writeWorkspaceMetadata(workspace, {
          ...result.metadata,
          welcomeNoteAdded: true,
        });
      return { metadata: result.metadata, created };
    },
  };

  async function moveTree(path: string, next: string) {
    await ensureListed();
    if (path === next) return;
    const inside = [...files.keys()].filter((file) => file === path || file.startsWith(`${path}/`));
    if (!inside.some((file) => sidecarFolder(file) === path))
      await write(
        `${next}/.tigrana/folder.json`,
        JSON.stringify({ id: crypto.randomUUID() }, null, 2),
      );
    for (const file of inside) await moveFile(file, replacePrefix(file, path, next));
  }
  async function saveImage(blob: Blob, name: string): Promise<string> {
    const type = /^image\/(png|jpeg|gif|webp)$/.test(blob.type) ? blob.type : 'image/png';
    const extension = type === 'image/jpeg' ? 'jpg' : type.slice(6);
    const base = (name.replace(/\.[^.]+$/, '') || 'image')
      .replace(/[\\:%?#\x00-\x1f/]/g, '-')
      .slice(0, 80);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000)
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    const dataUrl = `data:${type};base64,${btoa(binary)}`;
    await ensureListed();
    let path = `.assets/${base}.${extension}`;
    for (let suffix = 2; files.has(path); suffix += 1)
      path = `.assets/${base} ${suffix}.${extension}`;
    await write(path, dataUrl);
    return path;
  }
  garden.notesProvider(async () => (await storage.listNotes("")).map((note) => ({ path: note.path, title: note.title })));
  // A note's image path is notebook-relative in Tigrana; a folder imported whole keeps its own
  // .assets beside its notes, so the same path is found deeper when the root has no such file.
  garden.imageResolver((src) => {
    if (files.has(src)) return src;
    const deeper = [...files.keys()].filter((path) => path.endsWith(`/${src}`)).sort();
    return deeper[0] ?? null;
  });
  return storage;
}
