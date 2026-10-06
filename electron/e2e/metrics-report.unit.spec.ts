import { test, expect } from '@playwright/test';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const { appendMetricsReport } =
  require('../dist/metrics-report') as typeof import('../src/metrics-report');
const entry = `${'='.repeat(72)}\n2026-10-03T00:00:00.000Z\n${'='.repeat(72)}\nAgent metrics since 2026-10-03\n1 turn\n\n`;

test('reports create nested destinations, append without replacing prior bytes and refuse unrelated content', () => {
  const root = fs.mkdtempSync(join(tmpdir(), 'crux-metrics-'));
  try {
    const file = appendMetricsReport(root, 'notes/metrics/report.md', entry, []);
    appendMetricsReport(root, 'notes/metrics/report.md', entry, []);
    expect(fs.readFileSync(file, 'utf8')).toBe(entry + entry);
    fs.writeFileSync(join(root, 'private.txt'), 'Keep private');
    expect(() => appendMetricsReport(root, 'private.txt', entry, [])).toThrow(
      /not a metrics report/,
    );
    expect(fs.readFileSync(join(root, 'private.txt'), 'utf8')).toBe('Keep private');
    fs.writeFileSync(file, entry + 'x'.repeat(1024 * 1024));
    expect(() => appendMetricsReport(root, 'notes/metrics/report.md', entry, [])).toThrow(/1 MiB/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('reports refuse traversal, hidden paths, Memory, Project Folders and hardlinks', () => {
  const root = fs.mkdtempSync(join(tmpdir(), 'crux-metrics-'));
  try {
    for (const relative of [
      '../outside.md',
      '.crux-recovery/report.md',
      'memory.md',
      'report.html',
      '/absolute.md',
    ])
      expect(() => appendMetricsReport(root, relative, entry, [])).toThrow();
    const project = join(root, 'project');
    fs.mkdirSync(project);
    expect(() => appendMetricsReport(root, 'project/report.md', entry, [project])).toThrow(
      /Project Folders/,
    );
    expect(fs.readdirSync(project)).toEqual([]);
    fs.writeFileSync(join(root, 'original.md'), entry);
    fs.linkSync(join(root, 'original.md'), join(root, 'alias.md'));
    expect(() => appendMetricsReport(root, 'alias.md', entry, [])).toThrow(/not a link/);
    expect(fs.readFileSync(join(root, 'original.md'), 'utf8')).toBe(entry);
    expect(() => appendMetricsReport(root, 'report.md', 'not a report', [])).toThrow(
      /valid metrics/,
    );
    expect(() => appendMetricsReport(root, 'report.md', entry + 'x'.repeat(65536), [])).toThrow(
      /64 KiB/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('reports refuse symlink files and symlink parent folders', () => {
  test.skip(
    process.platform === 'win32',
    'Windows symlink creation requires host privileges; hardlinks run everywhere.',
  );
  const root = fs.mkdtempSync(join(tmpdir(), 'crux-metrics-'));
  try {
    fs.mkdirSync(join(root, 'real'));
    fs.symlinkSync(join(root, 'real'), join(root, 'alias'));
    expect(() => appendMetricsReport(root, 'alias/report.md', entry, [])).toThrow(/not links/);
    expect(fs.readdirSync(join(root, 'real'))).toEqual([]);
    fs.writeFileSync(join(root, 'real', 'original.md'), entry);
    fs.symlinkSync(join(root, 'real', 'original.md'), join(root, 'report.md'));
    expect(() => appendMetricsReport(root, 'report.md', entry, [])).toThrow(/not a link/);
    expect(fs.readFileSync(join(root, 'real', 'original.md'), 'utf8')).toBe(entry);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
