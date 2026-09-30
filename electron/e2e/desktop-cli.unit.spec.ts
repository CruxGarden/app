import { test, expect } from '@playwright/test';
import { mkdtempSync, readFileSync, writeFileSync, unlinkSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { installDesktopCli } from '../src/desktop-cli-install';

test('launcher quotes paths, preserves other commands and can be updated', () => {
  test.skip(process.platform === 'win32', 'POSIX quoting; Windows launcher is checked separately');
  const home = mkdtempSync(join(tmpdir(), 'crux-cli-install-'));
  const script = join(home, "script's file.js");
  writeFileSync(script, 'console.log(JSON.stringify(process.argv.slice(2)))');
  const options = {
    home,
    executable: process.execPath,
    script,
    profile: join(home, "profile's $data"),
    platform: 'darwin',
  };
  const installed = installDesktopCli(options);
  expect(
    JSON.parse(
      execFileSync(installed.path, ['call', 'read_file', '{"path":"hello world"}'], {
        encoding: 'utf8',
      }),
    ),
  ).toEqual(['--profile', options.profile, 'call', 'read_file', '{"path":"hello world"}']);
  expect(installDesktopCli(options).path).toBe(installed.path);
  writeFileSync(installed.path, '#!/bin/sh\n# unrelated nursery command\n');
  expect(() => installDesktopCli(options)).toThrow('different command');
  expect(readFileSync(installed.path, 'utf8')).toContain('nursery');
  unlinkSync(installed.path);
  symlinkSync(join(home, 'missing-target'), installed.path);
  expect(() => installDesktopCli(options)).toThrow('different command');
});

test('Windows launcher disables delayed expansion and rejects expandable paths', () => {
  const home = mkdtempSync(join(tmpdir(), 'crux-cli-windows-'));
  const options = {
    home,
    executable: 'C:\\Crux Garden\\Crux.exe',
    script: 'C:\\Crux Garden\\desktop-cli.js',
    profile: 'C:\\Garden!',
    platform: 'win32',
  };
  const installed = installDesktopCli(options);
  expect(readFileSync(installed.path, 'utf8')).toContain('setlocal DisableDelayedExpansion');
  expect(() => installDesktopCli({ ...options, profile: 'C:\\%PATH%' })).toThrow('safely');
});
