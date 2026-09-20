import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanFolder } from '../../electron/src/folder-scan';

/**
 * Looking at a folder before taking it in (the Project Crux import).
 *
 * A checkout is mostly things that are not its source, so what matters is
 * what gets left out, in what order, and that the answer is honest about how
 * much it left.
 */
let root: string;
const put = (rel: string, text = 'x') => {
  const at = join(root, rel);
  mkdirSync(join(at, '..'), { recursive: true });
  writeFileSync(at, text);
};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'crux-scan-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('scanning a folder before importing it', () => {
  it('takes the source and leaves what a project never keeps', () => {
    put('src/index.ts');
    put('package.json');
    put('node_modules/left-pad/index.js', 'x'.repeat(1000));
    put('node_modules/left-pad/package.json');
    put('dist/bundle.js');
    put('.git/HEAD');
    put('.DS_Store');

    const scan = scanFolder(root);
    expect(scan.files).toEqual(['package.json', 'src/index.ts']);
    // It says how much it left rather than leaving it silently.
    expect(scan.ignored).toBeGreaterThanOrEqual(5);
    expect(scan.ignoredBytes).toBeGreaterThan(1000);
    expect(scan.truncated).toBe(false);
  });

  it("honours the repository's own .gitignore", () => {
    put('.gitignore', 'secrets.txt\nbuild/\n*.log\n');
    put('app.js');
    put('secrets.txt');
    put('build/out.js');
    put('debug.log');

    const scan = scanFolder(root);
    expect(scan.files).toEqual(['.gitignore', 'app.js']);
    expect(scan.gitignores).toEqual(['.gitignore']);
  });

  it('applies a nested .gitignore to its own directory and below, as git does', () => {
    put('.gitignore', 'root-only.txt\n');
    put('root-only.txt');
    put('keep.txt');
    put('packages/api/.gitignore', 'generated/\n');
    put('packages/api/main.ts');
    put('packages/api/generated/schema.ts');
    // The nested rule must not reach a sibling package.
    put('packages/web/generated/page.ts');

    const scan = scanFolder(root);
    expect(scan.files).toContain('packages/api/main.ts');
    expect(scan.files).not.toContain('packages/api/generated/schema.ts');
    expect(scan.files).toContain('packages/web/generated/page.ts');
    expect(scan.files).not.toContain('root-only.txt');
    expect(scan.gitignores.sort()).toEqual(['.gitignore', 'packages/api/.gitignore']);
  });

  it('keeps the defaults whatever a .gitignore says about them', () => {
    // A repository that un-ignores node_modules is doing something strange,
    // and a Crux is not the place to find out what.
    put('.gitignore', '!node_modules/\n');
    put('node_modules/thing/index.js');
    put('src/main.ts');

    const scan = scanFolder(root);
    expect(scan.files).toEqual(['.gitignore', 'src/main.ts']);
  });

  it("reads the Crux's own .cruxignore last, so it can leave more out", () => {
    put('.cruxignore', 'notes/\n');
    put('notes/private.md');
    put('README.md');

    const scan = scanFolder(root);
    expect(scan.cruxignore).toBe(true);
    expect(scan.files).toEqual(['.cruxignore', 'README.md']);
  });

  it('names the big files instead of importing them quietly', () => {
    put('small.txt');
    put('video.mp4', 'x'.repeat(11 * 1024 * 1024));

    const scan = scanFolder(root);
    expect(scan.large.map((f) => f.path)).toEqual(['video.mp4']);
    expect(scan.bytes).toBeGreaterThan(11 * 1024 * 1024);
  });

  it('never follows a symlink out of the folder', () => {
    put('real.txt');
    symlinkSync('/etc', join(root, 'escape'));

    const scan = scanFolder(root);
    expect(scan.files).toEqual(['real.txt']);
    expect(scan.files.some((f) => f.startsWith('escape'))).toBe(false);
  });

  it('stops early on a folder that is far too big, and says so', () => {
    for (let i = 0; i < 60; i++) put(`many/file-${i}.txt`);
    const scan = scanFolder(root, { maxFiles: 20 });
    expect(scan.truncated).toBe(true);
    expect(scan.files.length).toBeLessThanOrEqual(21);
  });

  it('answers for a folder that is not there rather than throwing', () => {
    const scan = scanFolder(join(root, 'nowhere'));
    expect(scan.files).toEqual([]);
    expect(scan.truncated).toBe(false);
  });
});
