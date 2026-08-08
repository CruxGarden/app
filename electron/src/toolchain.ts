const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { pnpmEntry, pnpmEnv } = require('./pnpm');

/**
 * Toolchain (ADR 0004) — bundled pnpm, run with Electron's own Node runtime.
 *
 * No system Node required: `process.execPath` (the app binary) is launched
 * with ELECTRON_RUN_AS_NODE=1 to execute pnpm's CJS entry point. Installs are
 * per-project (real node_modules in the Project Folder); pnpm's shared store
 * makes repeat installs fast and disk-cheap. Builds run the project's own
 * `build` script — tool-agnostic (Astro today, anything tomorrow).
 */

export interface ToolchainResult {
  code: number;
  log: string;
}

export class Toolchain {
  constructor(
    private resolveKnownFolder: (folder: string) => string,
    private onOutput?: (folder: string, line: string) => void,
  ) {}

  /** Spawn pnpm inside a Project Folder using Electron-as-Node. */
  run(folder: string, args: string[], timeoutMs = 10 * 60 * 1000): Promise<ToolchainResult> {
    const cwd = this.resolveKnownFolder(folder);
    return new Promise((resolve, reject) => {
      let log = '';
      const proc = spawn(process.execPath, [pnpmEntry(), ...args], {
        cwd,
        env: pnpmEnv(),
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      const timer = setTimeout(() => {
        proc.kill('SIGKILL');
        reject(new Error(`pnpm ${args[0]} timed out after ${timeoutMs / 1000}s`));
      }, timeoutMs);

      const capture = (chunk: Buffer) => {
        const text = chunk.toString();
        log += text;
        if (log.length > 512 * 1024) log = log.slice(-256 * 1024); // cap memory
        for (const line of text.split('\n')) {
          if (line.trim()) this.onOutput?.(cwd, line.trimEnd());
        }
      };
      proc.stdout.on('data', capture);
      proc.stderr.on('data', capture);

      proc.on('error', (err: Error) => {
        clearTimeout(timer);
        reject(err);
      });
      proc.on('close', (code: number) => {
        clearTimeout(timer);
        resolve({ code: code ?? -1, log });
      });
    });
  }

  isInstalled(folder: string): boolean {
    const cwd = this.resolveKnownFolder(folder);
    return fs.existsSync(path.join(cwd, 'node_modules'));
  }

  hasPackageJson(folder: string): boolean {
    const cwd = this.resolveKnownFolder(folder);
    return fs.existsSync(path.join(cwd, 'package.json'));
  }

  install(folder: string): Promise<ToolchainResult> {
    return this.run(folder, ['install', '--prefer-offline']);
  }

  /** Run the project's own `build` script; returns the built file list. */
  async build(folder: string): Promise<ToolchainResult & { distFiles: string[] }> {
    const result = await this.run(folder, ['run', 'build']);
    return { ...result, distFiles: result.code === 0 ? this.listDist(folder) : [] };
  }

  /** All files under dist/ (relative to the Project Folder, POSIX paths). */
  listDist(folder: string): string[] {
    const cwd = this.resolveKnownFolder(folder);
    const dist = path.join(cwd, 'dist');
    const out: string[] = [];
    const walk = (dir: string) => {
      let entries: any[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const abs = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(abs);
        else if (entry.isFile()) {
          out.push(path.relative(cwd, abs).split(path.sep).join('/'));
        }
      }
    };
    walk(dist);
    return out.sort();
  }
}
