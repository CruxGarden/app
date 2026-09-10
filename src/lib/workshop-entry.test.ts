import { describe, expect, it } from 'vitest';
import type { Artifact, Crux } from '@/api/types';
import { workshopEntry, entryCandidates } from './workshop-entry';

const files = (...paths: string[]) =>
  paths.map((path, i) => ({ id: String(i), meta: { path } }) as Artifact);
const crux = (entryFile?: string) => ({ meta: { settings: { entryFile } } }) as Crux;

describe('Workshop entry', () => {
  it('opens the saved path after Artifact IDs change and reports a missing choice without substituting another page', () => {
    const artifacts = files('index.html', 'pages/start.html');
    expect(workshopEntry(crux('pages/start.html'), artifacts).artifact).toBe(artifacts[1]);
    const moved = workshopEntry(
      crux('pages/start.html'),
      files('index.html', 'pages/renamed.html'),
    );
    expect(moved.artifact).toBeNull();
    expect(moved.missing).toBe('pages/start.html');
  });
  it('uses conventional entry files automatically and waits when several alternatives are ambiguous', () => {
    expect(workshopEntry(crux(), files('about.html', 'index.html')).artifact?.meta?.path).toBe(
      'index.html',
    );
    expect(workshopEntry(crux(), files('a.html', 'b.html')).artifact).toBeNull();
    expect(workshopEntry(crux(), files('notes.md')).artifact?.meta?.path).toBe('notes.md');
    expect(workshopEntry(crux(), []).artifact).toBeNull();
  });
  it('selects a Site Crux page, excluding dynamic routes and components', () => {
    const artifacts = files(
      'astro.config.mjs',
      'src/pages/index.astro',
      'src/pages/[slug].astro',
      'src/components/Header.astro',
    );
    expect(workshopEntry(crux(), artifacts).artifact?.meta?.path).toBe('src/pages/index.astro');
    expect(entryCandidates(artifacts)).toHaveLength(1);
  });
  it('never chooses the generated agent guide or thumbnail as the creation', () => {
    expect(entryCandidates(files('AGENTS.md', 'preview.jpg', 'package.json'))).toEqual([]);
  });
});
