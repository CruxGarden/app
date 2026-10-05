/**
 * Files arriving in the composer by paste or drop (EF06). Both end at the
 * same place as the "Add a file" button; this module only decides WHICH files
 * a gesture carries and what a pasted image is called.
 */

const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/avif': 'avif',
  'image/bmp': 'bmp',
  'image/tiff': 'tiff',
  'image/heic': 'heic',
};

function imageExtension(file: File): string {
  const known = IMAGE_EXTENSIONS[file.type];
  if (known) return known;
  const fromName = /\.([a-z0-9]{1,5})$/i.exec(file.name)?.[1]?.toLowerCase();
  return fromName ?? (file.type.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'png');
}

/** 2026-10-04T09:15:30.123Z → 20261004-091530 */
function stamp(now: Date): string {
  const iso = now.toISOString();
  return `${iso.slice(0, 10).replace(/-/g, '')}-${iso.slice(11, 19).replace(/:/g, '')}`;
}

/**
 * A clipboard image has no name of its own (every one is "image.png"), so it
 * gets `pasted-image-<timestamp>.<ext>`, counted up past any path already in
 * Artifacts or earlier in the same paste — a paste never asks to replace a file.
 */
export function namePastedImages(
  images: File[],
  existingPaths: Iterable<string>,
  now: Date = new Date(),
): File[] {
  const taken = new Set([...existingPaths].map((path) => path.toLowerCase()));
  const base = `pasted-image-${stamp(now)}`;
  return images.map((image) => {
    const ext = imageExtension(image);
    let name = `${base}.${ext}`;
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base}-${n}.${ext}`;
    taken.add(name.toLowerCase());
    return new File([image], name, { type: image.type, lastModified: now.getTime() });
  });
}

type ClipboardLike = Pick<DataTransfer, 'getData'> & {
  files?: ArrayLike<File> | null;
  items?: ArrayLike<Pick<DataTransferItem, 'kind' | 'type' | 'getAsFile'>> | null;
};

/**
 * The images a paste carries — none when it also carries text: copying from a
 * document or a spreadsheet puts a picture of the selection beside its words,
 * and the words are what the person meant to paste.
 */
export function pastedImages(clipboard: ClipboardLike | null | undefined): File[] {
  if (!clipboard) return [];
  if (clipboard.getData('text/plain')) return [];
  const fromFiles = Array.from(clipboard.files ?? []).filter((file) =>
    file.type.startsWith('image/'),
  );
  if (fromFiles.length > 0) return fromFiles;
  const images: File[] = [];
  for (const item of Array.from(clipboard.items ?? [])) {
    if (item.kind !== 'file' || !item.type.startsWith('image/')) continue;
    const file = item.getAsFile();
    if (file) images.push(file);
  }
  return images;
}

type DropLike = {
  types?: readonly string[] | ArrayLike<string> | null;
  files?: ArrayLike<File> | null;
  items?: ArrayLike<{
    kind: string;
    webkitGetAsEntry?: () => { isDirectory: boolean } | null;
  }> | null;
};

/** Is this drag carrying files from the OS (rather than text or a pane being moved)? */
export function carriesFiles(transfer: DropLike | null | undefined): boolean {
  return Array.from(transfer?.types ?? []).includes('Files');
}

/**
 * The files a drop carries, in order. Folders are left out and counted: the
 * composer adds files the way its button does; a folder goes in through Artifacts.
 */
export function droppedFiles(transfer: DropLike | null | undefined): {
  files: File[];
  folders: number;
} {
  const files = Array.from(transfer?.files ?? []);
  const fileItems = Array.from(transfer?.items ?? []).filter((item) => item.kind === 'file');
  // Items and files list the same entries in the same order; only then can a
  // folder be told from a file.
  if (fileItems.length !== files.length) return { files, folders: 0 };
  const kept: File[] = [];
  let folders = 0;
  fileItems.forEach((item, index) => {
    if (item.webkitGetAsEntry?.()?.isDirectory) folders++;
    else kept.push(files[index]!);
  });
  return { files: kept, folders };
}
