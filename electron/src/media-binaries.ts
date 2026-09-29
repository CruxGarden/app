/** Native tool resolution: packaged resources, development builds, requested
 * installs, then the person's system tools. FFmpeg/ffprobe share one source build;
 * their provenance and corresponding sources are enforced before packaging. */
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export type MediaTool = 'ffmpeg' | 'ffprobe' | 'magick' | 'pandoc' | 'typst';
export const MEDIA_TOOLS: MediaTool[] = ['ffmpeg', 'ffprobe', 'magick', 'pandoc', 'typst'];

export interface ToolInfo {
  tool: MediaTool;
  /** The absolute path, or null when the tool is not on this machine. */
  path: string | null;
  /** Where it came from, for the interface to say so honestly. */
  source: 'bundled' | 'resources' | 'installed' | 'system' | 'missing';
  /** First line of `--version`, when it answered. */
  version: string | null;
}

const isWindows = process.platform === 'win32';
const exe = (name: string) => (isWindows ? `${name}.exe` : name);

/** The names a tool may have on this platform, best first. */
function candidateNames(tool: MediaTool): string[] {
  if (tool !== 'magick') return [exe(tool)];
  // ImageMagick 7 is `magick`; 6 installs `convert` (and on Windows that name
  // collides with the built-in filesystem converter, so it is never used there).
  return isWindows ? ['magick.exe'] : ['magick', 'convert'];
}

/** Directories worth looking in before falling back to PATH, per platform. */
function searchDirs(): string[] {
  const dirs: string[] = [];
  if (process.platform === 'darwin') {
    dirs.push('/opt/homebrew/bin', '/usr/local/bin', '/opt/local/bin', '/usr/bin');
  } else if (process.platform === 'win32') {
    const programFiles = [process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(
      Boolean,
    ) as string[];
    for (const base of programFiles) {
      dirs.push(base);
      try {
        for (const entry of fs.readdirSync(base)) {
          if (
            /^ImageMagick/i.test(entry) ||
            /^ffmpeg/i.test(entry) ||
            /^Pandoc/i.test(entry) ||
            /^Typst/i.test(entry)
          ) {
            dirs.push(path.join(base, entry));
            dirs.push(path.join(base, entry, 'bin'));
          }
        }
      } catch {
        /* an unreadable Program Files is not an error */
      }
    }
    if (process.env.LOCALAPPDATA)
      dirs.push(path.join(process.env.LOCALAPPDATA, 'Microsoft', 'WindowsApps'));
  } else {
    dirs.push('/usr/bin', '/usr/local/bin', '/bin', '/snap/bin', '/var/lib/flatpak/exports/bin');
    dirs.push(path.join(os.homedir(), '.local', 'bin'));
  }
  for (const part of (process.env.PATH ?? '').split(path.delimiter)) if (part) dirs.push(part);
  return [...new Set(dirs)];
}

function usable(candidate: string): boolean {
  try {
    const stat = fs.statSync(candidate);
    if (!stat.isFile()) return false;
    if (!isWindows) fs.accessSync(candidate, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** A binary packaging dropped beside the app: `resources/bin/<name>`. */
function fromResources(tool: MediaTool, resourcesPath: string | null): string | null {
  if (!resourcesPath) return null;
  const dir = path.join(resourcesPath, 'bin');
  for (const name of candidateNames(tool)) {
    const candidate = path.join(dir, name);
    if (usable(candidate)) return candidate;
  }
  return null;
}

/** A binary the app installed for this person, at their request. */
function fromInstalled(tool: MediaTool, userDataPath: string | null): string | null {
  if (!userDataPath) return null;
  const dir = path.join(userDataPath, 'tools', `${process.platform}-${process.arch}`);
  for (const name of candidateNames(tool)) {
    const candidate = path.join(dir, name);
    if (usable(candidate)) return candidate;
  }
  return null;
}

/** Development uses the same binaries that the packaging gate admits. */
function fromDevelopmentBuild(tool: MediaTool): string | null {
  if (tool !== 'ffmpeg' && tool !== 'ffprobe') return null;
  const candidate = path.join(
    __dirname,
    '..',
    '.native-tools',
    `${process.platform}-${process.arch}`,
    exe(tool),
  );
  return usable(candidate) ? candidate : null;
}

function fromSystem(tool: MediaTool): string | null {
  for (const dir of searchDirs())
    for (const name of candidateNames(tool)) {
      const candidate = path.join(dir, name);
      if (usable(candidate)) return candidate;
    }
  return null;
}

function versionOf(binary: string, tool: MediaTool): Promise<string | null> {
  return new Promise((resolve) => {
    // pandoc and typst want --version; the ffmpeg family wants -version.
    const flag = tool === 'pandoc' || tool === 'typst' ? '--version' : '-version';
    execFile(binary, [flag], { timeout: 5000 }, (error, stdout, stderr) => {
      if (error && !stdout && !stderr) return resolve(null);
      const first = String(stdout || stderr)
        .split('\n')[0]
        ?.trim();
      resolve(first || null);
    });
  });
}

let cache: Map<MediaTool, ToolInfo> | null = null;
/** Remembered so a later lookup finds what an install just put there. */
let lastUserData: string | null = null;

/** Resolve every media tool once; `refresh` re-runs the search (after an install). */
export async function mediaTools(
  resourcesPath: string | null,
  refresh = false,
  userDataPath: string | null = null,
): Promise<ToolInfo[]> {
  if (userDataPath) lastUserData = userDataPath;
  if (cache && !refresh) return [...cache.values()];
  const found = new Map<MediaTool, ToolInfo>();
  for (const tool of MEDIA_TOOLS) {
    let binary = resourcesPath ? null : fromDevelopmentBuild(tool);
    let source: ToolInfo['source'] = binary ? 'bundled' : 'missing';
    if (!binary) {
      binary = fromResources(tool, resourcesPath);
      if (binary) source = 'resources';
    }
    if (!binary) {
      binary = fromInstalled(tool, userDataPath ?? lastUserData);
      if (binary) source = 'installed';
    }
    if (!binary) {
      binary = fromSystem(tool);
      if (binary) source = 'system';
    }
    found.set(tool, {
      tool,
      path: binary,
      source: binary ? source : 'missing',
      version: binary ? await versionOf(binary, tool) : null,
    });
  }
  cache = found;
  return [...found.values()];
}

/** The resolved path for one tool, or null. Cheap after the first call. */
export async function mediaToolPath(
  tool: MediaTool,
  resourcesPath: string | null,
  userDataPath: string | null = null,
): Promise<string | null> {
  const all = await mediaTools(resourcesPath, false, userDataPath);
  return all.find((t) => t.tool === tool)?.path ?? null;
}

export function clearMediaToolCache(): void {
  cache = null;
}
