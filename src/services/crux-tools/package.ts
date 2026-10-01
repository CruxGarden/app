import JSZip from 'jszip';
import { parseManifest, type CruxToolManifest } from './manifest';
import { hashContent } from '../sqlite/helpers';

export const TOOL_PACKAGE_PATH = '_crux/tool-package.zip';
export const TOOL_PACKAGE_LIMIT = 500 * 1024 * 1024;
const HEADER = 'tool-package.json';
const MAX_FILES = 10000;
export interface PackageFile {
  path: string;
  mimeType: string;
  size: number;
}
interface PackageHeader {
  format: 'crux-tool';
  version: 1;
  tool: CruxToolManifest;
  files: PackageFile[];
}
export interface ToolPackageReference {
  version: 1;
  artifactId: string;
  fingerprint: string;
  size: number;
  fileCount: number;
  unpackedBytes: number;
}
export function packagePath(path: string): boolean {
  return (
    !!path &&
    path.length <= 1000 &&
    !path.includes('\\') &&
    !Array.from(path).some((char) => char.charCodeAt(0) < 32) &&
    !path.startsWith('/') &&
    !/^[A-Za-z]:/.test(path) &&
    path.split('/').every((part) => !!part && part !== '.' && part !== '..')
  );
}
async function declaredSize(file: JSZip.JSZipObject): Promise<number> {
  // JSZip 3.10.1 keeps compressed files as directory records, but turns a
  // zero-byte entry into Promise<''>. Neither branch expands file contents.
  const data = await (file as unknown as { _data: { uncompressedSize: number } | Promise<string> })
    ._data;
  return data === '' ? 0 : typeof data === 'object' ? data.uncompressedSize : NaN;
}
export async function packTool(
  tool: CruxToolManifest,
  files: { path: string; blob: Blob; mimeType: string }[],
): Promise<Blob> {
  tool = parseManifest(tool);
  // Publish the declared starter document, never the creator's test-session edits.
  files = files.map((file) =>
    file.path === tool.document?.path
      ? {
          ...file,
          blob: new Blob([JSON.stringify(tool.document.seed)], { type: 'application/json' }),
          mimeType: 'application/json',
        }
      : file,
  );
  const zip = new JSZip();
  const entries: PackageFile[] = [];
  const date = new Date('1980-01-01T00:00:00Z');
  const seen = new Set<string>();
  let total = 0;
  for (const file of [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    if (!packagePath(file.path) || seen.has(file.path))
      throw new Error('Invalid or duplicate tool package path.');
    seen.add(file.path);
    total += file.blob.size;
    if (total > TOOL_PACKAGE_LIMIT || seen.size > MAX_FILES)
      throw new Error('The tool package is too large.');
    entries.push({ path: file.path, mimeType: file.mimeType, size: file.blob.size });
    zip.file('files/' + file.path, await file.blob.arrayBuffer(), { date, createFolders: false });
  }
  if (!seen.has(tool.entryFile)) throw new Error('The tool package is missing its entry file.');
  const header: PackageHeader = { format: 'crux-tool', version: 1, tool, files: entries };
  zip.file(HEADER, JSON.stringify(header), { date, createFolders: false });
  const bytes = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 1 },
  });
  if (bytes.byteLength > TOOL_PACKAGE_LIMIT) throw new Error('The tool package is too large.');
  return new Blob([new Uint8Array(bytes)], { type: 'application/zip' });
}
export async function openToolPackage(blob: Blob, expectedId?: string, fingerprint?: string) {
  if (!blob.size || blob.size > TOOL_PACKAGE_LIMIT)
    throw new Error('The tool package is too large or empty.');
  if (fingerprint && (await hashContent(blob)) !== fingerprint)
    throw new Error('The downloaded tool package fingerprint does not match.');
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const headerFile = zip.file(HEADER);
  if (
    !headerFile ||
    headerFile.unsafeOriginalName !== HEADER ||
    (await declaredSize(headerFile)) > 4 * 1024 * 1024
  )
    throw new Error('Invalid tool package manifest.');
  const header = JSON.parse(await headerFile.async('text')) as PackageHeader;
  if (
    header.format !== 'crux-tool' ||
    header.version !== 1 ||
    !Array.isArray(header.files) ||
    !header.files.length ||
    header.files.length > MAX_FILES
  )
    throw new Error('Unsupported tool package.');
  const manifest = parseManifest(header.tool);
  if (expectedId && manifest.id !== expectedId)
    throw new Error('The tool package belongs to a different tool.');
  const seen = new Set<string>();
  let total = 0;
  const files = await Promise.all(
    header.files.map(async (file) => {
      if (
        !packagePath(file.path) ||
        seen.has(file.path) ||
        !Number.isSafeInteger(file.size) ||
        file.size < 0 ||
        typeof file.mimeType !== 'string'
      )
        throw new Error('Invalid tool package file.');
      seen.add(file.path);
      total += file.size;
      const item = zip.file('files/' + file.path);
      if (
        !item ||
        item.unsafeOriginalName !== 'files/' + file.path ||
        (await declaredSize(item)) !== file.size
      )
        throw new Error('The tool package is incomplete or has invalid paths.');
      return {
        ...file,
        read: async () => {
          const bytes = await item.async('uint8array');
          if (bytes.byteLength !== file.size)
            throw new Error('The tool package file size does not match.');
          return bytes;
        },
      };
    }),
  );
  if (
    total > TOOL_PACKAGE_LIMIT ||
    !seen.has(manifest.entryFile) ||
    Object.values(zip.files).filter((f) => !f.dir).length !== files.length + 1
  )
    throw new Error('The tool package has unexpected or missing files.');
  return { manifest, files, unpackedBytes: total };
}
