import { mkdirSync, readFileSync, writeFileSync, chmodSync, lstatSync } from 'node:fs';
import { join, dirname } from 'node:path';

const MARKER = 'Crux Garden managed CLI launcher';
const quote = (value: string) => `'${value.replace(/'/g, `'"'"'`)}'`;

/** Opt-in, user-owned launcher; never overwrites another CLI (including Nursery). */
export function installDesktopCli(options: {
  home: string;
  executable: string;
  script: string;
  profile: string;
  platform?: string;
}): { path: string; instructions: string } {
  const windows = (options.platform ?? process.platform) === 'win32';
  const directory = join(options.home, '.local', 'bin');
  const destination = join(directory, windows ? 'crux.cmd' : 'crux');
  const existing = lstatSync(destination, { throwIfNoEntry: false });
  if (existing) {
    if (!existing.isFile() || !readFileSync(destination, 'utf8').includes(MARKER))
      throw new Error(
        `A different command already exists at ${destination}. Move it yourself or use the bundled CLI directly.`,
      );
  }
  let body: string;
  if (windows) {
    // cmd expands these even inside quotes. Refuse ambiguous paths rather than
    // emitting a launcher that runs a different command or targets another profile.
    for (const value of [options.executable, options.script, options.profile])
      if (/["%\r\n]/.test(value))
        throw new Error('This path cannot be represented safely in a Windows launcher.');
    body = `@echo off\r\nrem ${MARKER}\r\nsetlocal DisableDelayedExpansion\r\nset "ELECTRON_RUN_AS_NODE=1"\r\n"${options.executable}" "${options.script}" --profile "${options.profile}" %*\r\n`;
  } else {
    body = `#!/bin/sh\n# ${MARKER}\nELECTRON_RUN_AS_NODE=1 exec ${quote(options.executable)} ${quote(options.script)} --profile ${quote(options.profile)} "$@"\n`;
  }
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, body, { mode: 0o755 });
  if (!windows) chmodSync(destination, 0o755);
  return {
    path: destination,
    instructions: `Add ${directory} to the front of PATH, then run crux help. Enable Agent access below. Reinstall this launcher if you move the app.`,
  };
}
