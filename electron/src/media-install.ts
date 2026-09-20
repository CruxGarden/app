/**
 * Installing a media tool for the person, when the app does not carry it.
 *
 * ffmpeg, ffprobe and pandoc ship with Crux Garden. ImageMagick does not: its
 * macOS build is not relocatable, so packaging it would mean rewriting the
 * upstream build at package time. Instead the app offers to fetch it, and each
 * platform gets the route its own project publishes:
 *
 *   Linux    the official AppImage — one file, chmod +x, done.
 *   Windows  the official portable build — a 7-Zip archive, unpacked with the
 *            `tar` that ships with Windows 10 and later.
 *   macOS    upstream publishes no binary at all, so the only honest route is
 *            Homebrew. When it is on the machine the app runs it and streams
 *            the output; when it is not, the app says what to install and
 *            never pretends to have done it.
 *
 * Everything lands in `<userData>/tools/<platform>-<arch>/`, which the
 * resolver checks before the machine's own directories. Nothing is written
 * anywhere else, nothing needs an administrator, and a failed install leaves
 * the machine as it was.
 */
import { execFile, spawn } from 'child_process';
import * as fs from 'fs';
import * as https from 'https';
import * as path from 'path';
import { clearMediaToolCache, type MediaTool } from './media-binaries';

export interface InstallProgress {
  tool: MediaTool;
  /** 0–1 while downloading, absent while a package manager works. */
  fraction?: number;
  /** A line worth showing the person. */
  line?: string;
}

export interface InstallResult {
  tool: MediaTool;
  ok: boolean;
  /** Where it landed, when the app installed it itself. */
  path?: string;
  /** What to tell the person: what happened, or what they should do. */
  message: string;
  /** A command the person can run themselves, when the app cannot. */
  command?: string;
}

/** What the app knows how to fetch, per platform. Only ImageMagick today. */
const UPSTREAM: Partial<
  Record<MediaTool, { linux?: string; win32?: Partial<Record<string, string>>; brew?: string }>
> = {
  magick: {
    linux:
      'https://github.com/ImageMagick/ImageMagick/releases/download/7.1.2-31/ImageMagick-7.1.2-31-gcc-x86_64.AppImage',
    win32: {
      x64: 'https://github.com/ImageMagick/ImageMagick/releases/download/7.1.2-31/ImageMagick-7.1.2-31-portable-Q16-HDRI-x64.7z',
      arm64:
        'https://github.com/ImageMagick/ImageMagick/releases/download/7.1.2-31/ImageMagick-7.1.2-31-portable-Q16-HDRI-arm64.7z',
    },
    brew: 'imagemagick',
  },
};

/** The one directory an install may write to. */
export function toolsDir(userDataPath: string): string {
  return path.join(userDataPath, 'tools', `${process.platform}-${process.arch}`);
}

/** Fetch a file, following redirects, reporting how far along it is. */
function download(url: string, to: string, onProgress: (fraction: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const get = (at: string, depth: number) => {
      if (depth > 5) return reject(new Error('too many redirects'));
      https
        .get(at, { headers: { 'User-Agent': 'CruxGarden' } }, (response) => {
          const location = response.headers.location;
          if (
            response.statusCode &&
            response.statusCode >= 300 &&
            response.statusCode < 400 &&
            location
          ) {
            response.resume();
            return get(new URL(location, at).toString(), depth + 1);
          }
          if (response.statusCode !== 200) {
            response.resume();
            return reject(new Error(`the download answered ${response.statusCode}`));
          }
          const total = Number(response.headers['content-length'] ?? 0);
          let seen = 0;
          const file = fs.createWriteStream(to);
          response.on('data', (chunk: Buffer) => {
            seen += chunk.length;
            if (total) onProgress(Math.min(seen / total, 1));
          });
          response.pipe(file);
          file.on('finish', () => file.close(() => resolve()));
          file.on('error', reject);
        })
        .on('error', reject);
    };
    get(url, 0);
  });
}

function run(
  command: string,
  args: string[],
  onLine: (line: string) => void,
): Promise<{ code: number }> {
  return new Promise((resolve) => {
    const proc = spawn(command, args, { env: { ...process.env, HOMEBREW_NO_AUTO_UPDATE: '1' } });
    const feed = (chunk: Buffer) => {
      for (const line of String(chunk).split('\n')) if (line.trim()) onLine(line.trim());
    };
    proc.stdout?.on('data', feed);
    proc.stderr?.on('data', feed);
    proc.on('close', (code) => resolve({ code: code ?? -1 }));
    proc.on('error', () => resolve({ code: -1 }));
  });
}

function onPath(command: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(process.platform === 'win32' ? 'where' : 'which', [command], (error, stdout) => {
      const first = String(stdout || '')
        .split('\n')[0]
        ?.trim();
      resolve(!error && first ? first : null);
    });
  });
}

/**
 * Install one tool for this person. Reports progress as it goes and answers
 * with what happened; it never throws, because "I could not do this, here is
 * what you can run" is a real answer.
 */
export async function installMediaTool(
  tool: MediaTool,
  userDataPath: string,
  onProgress: (progress: InstallProgress) => void,
): Promise<InstallResult> {
  const upstream = UPSTREAM[tool];
  if (!upstream)
    return {
      tool,
      ok: false,
      message: `${tool} ships with Crux Garden — there is nothing to install.`,
    };

  const dir = toolsDir(userDataPath);
  fs.mkdirSync(dir, { recursive: true });
  const say = (line: string) => onProgress({ tool, line });

  try {
    if (process.platform === 'linux' && upstream.linux) {
      const to = path.join(dir, 'magick');
      say('Fetching the ImageMagick AppImage…');
      await download(upstream.linux, to, (fraction) => onProgress({ tool, fraction }));
      fs.chmodSync(to, 0o755);
      clearMediaToolCache();
      return { tool, ok: true, path: to, message: 'ImageMagick is installed.' };
    }

    if (process.platform === 'win32') {
      const url = upstream.win32?.[process.arch];
      if (!url)
        return {
          tool,
          ok: false,
          message: `There is no ImageMagick build for ${process.arch} Windows.`,
        };
      const archive = path.join(dir, 'imagemagick.7z');
      say('Fetching the portable ImageMagick…');
      await download(url, archive, (fraction) => onProgress({ tool, fraction }));
      say('Unpacking…');
      // Windows 10 and later ship bsdtar, which reads 7-Zip archives.
      const { code } = await run('tar', ['-xf', archive, '-C', dir], say);
      fs.rmSync(archive, { force: true });
      if (code !== 0)
        return {
          tool,
          ok: false,
          message: 'The download arrived but could not be unpacked on this machine.',
        };
      clearMediaToolCache();
      return { tool, ok: true, message: 'ImageMagick is installed.' };
    }

    // macOS: upstream publishes no binary, so Homebrew is the only real route.
    const brew =
      (await onPath('brew')) ??
      ['/opt/homebrew/bin/brew', '/usr/local/bin/brew'].find((candidate) =>
        fs.existsSync(candidate),
      );
    const command = `brew install ${upstream.brew}`;
    if (!brew)
      return {
        tool,
        ok: false,
        command,
        message:
          'ImageMagick has no download for macOS, and Homebrew is not on this machine. Install Homebrew from brew.sh, then run this, or carry on — pictures convert through ffmpeg either way.',
      };
    say(`Installing with Homebrew. This takes a few minutes.`);
    const { code } = await run(brew, ['install', upstream.brew!], say);
    clearMediaToolCache();
    return code === 0
      ? { tool, ok: true, message: 'ImageMagick is installed.' }
      : {
          tool,
          ok: false,
          command,
          message: 'Homebrew did not finish. Its output is above; the command is yours to retry.',
        };
  } catch (error) {
    return {
      tool,
      ok: false,
      message: `The install did not finish — ${(error as Error)?.message ?? error}`,
    };
  }
}

/** Whether the app has a way to install this tool on this machine at all. */
export function canInstall(tool: MediaTool): boolean {
  return Boolean(UPSTREAM[tool]);
}
