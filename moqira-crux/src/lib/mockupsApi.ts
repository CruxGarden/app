import { request, type Document } from '../bridge';
import type { MockupProject } from '../types';
import { validateProject } from './validation';
let fingerprint: string | null = null;
let loaded = false;
let tail: Promise<unknown> = Promise.resolve();
export function isTauri() {
  return false;
}
export async function openProjectFile(_path: string): Promise<MockupProject> {
  await tail;
  const file = await request<Document>('read', { path: 'project.json' });
  const project = validateProject(JSON.parse(file.content));
  fingerprint = file.fingerprint;
  loaded = true;
  return project;
}
export function saveProjectFile(_path: string, project: MockupProject): Promise<void> {
  const content = JSON.stringify(project, null, 2) + '\n';
  const save = tail.then(async () => {
    if (!loaded) throw new Error('Wait for the project to open before saving.');
    const result = await request<{ fingerprint: string }>('write', {
      path: 'project.json',
      content,
      expected: fingerprint,
    });
    fingerprint = result.fingerprint;
  });
  tail = save.catch(() => {});
  return save;
}
export async function readLastProjectPath() {
  return 'project.json';
}
export async function writeLastProjectPath(_path: string | null) {}
export async function syncRecentProjects(_projects: unknown) {}
export async function syncEditMenuState(_state: unknown) {}
export async function revealProject(_path: string) {}
