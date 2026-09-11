// @flow
import * as React from 'react';
import { t } from '@lingui/macro';
import { exportProject, importProject } from './ProjectArchive';
import { serializeToJSObject } from '../Utils/Serializer';
import { validateNativeDocument } from '../../../../garden/model.mjs';
import { putFile, getBrowserSWPreviewBaseUrl, getBrowserSWPreviewRootUrl } from '../ExportAndShare/BrowserExporters/BrowserSWPreviewLauncher/BrowserSWPreviewIndexedDB';
const gd = global.gd;
const media = new Map();
const urls = new Map();
let currentProject = null;
let nativeChanges = null;
let pointerDown = false;
let connected = false;
let nativeSaving = false;
let lastRecords = null;
let pendingImport = null;
const context = () => window.gardenGDevelop;
const metadata = () => ({ fileIdentifier: 'garden-project.json', name: currentProject?.getName() || 'My game' });
const base64 = bytes => {
  let text = '';
  for (let i = 0; i < bytes.length; i += 32768) text += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(text);
};
export async function addMedia(file) {
  if (file.size > 32 * 1024 * 1024) throw new Error('Import files up to 32 MiB each.');
  const bytes = await file.arrayBuffer();
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');
  const key = 'media-' + hash;
  const record = { type: file.type || 'application/octet-stream', bytes: base64(new Uint8Array(bytes)) };
  media.set(key, record);
  const name = encodeURIComponent(file.name || 'asset');
  const url = getBrowserSWPreviewBaseUrl() + '/assets/' + hash + '/' + name;
  await putFile(url.replace(getBrowserSWPreviewRootUrl(), ''), bytes, record.type);
  urls.set(url, { key, name });
  return url;
}
async function hydrate(document) {
  document = structuredClone(document);
  validateNativeDocument(document);
  for (const resource of document.resources?.resources || []) {
    if (!resource.file?.startsWith('garden:')) continue;
    const [key, ...parts] = resource.file.slice(7).split('/');
    const record = context().garden.initial?.[key];
    if (!record || typeof record.bytes !== 'string') throw new Error('Missing original media: ' + resource.name);
    const bytes = Uint8Array.from(atob(record.bytes), c => c.charCodeAt(0));
    resource.file = await addMedia(new File([bytes], decodeURIComponent(parts.join('/')), { type: record.type }));
  }
  return document;
}
function capture() {
  if (!currentProject) {
    if (lastRecords) return lastRecords;
    throw new Error('Open a game before saving.');
  }
  const document = serializeToJSObject(currentProject, 'serializeTo', { canonicalEventSerialization: true });
  validateNativeDocument(document);
  const records = { document, preferences: context().memory.snapshot() };
  for (const resource of document.resources?.resources || []) {
    if (!resource.file) continue;
    const stored = urls.get(resource.file);
    if (!stored) throw new Error('Import this resource from a local file before saving: ' + resource.name);
    resource.file = 'garden:' + stored.key + '/' + stored.name;
    records[stored.key] = media.get(stored.key);
  }
  lastRecords = records;
  return records;
}
function busy() {
  return pointerDown || (!nativeSaving && !!document.querySelector('[role="dialog"]')) || (!currentProject && !lastRecords);
}
export function useGardenProject(project, changes) {
  React.useEffect(() => {
    const replaced = currentProject !== project;
    currentProject = project;
    if (replaced && project && connected) context().garden.changed();
    nativeChanges = changes;
    if (!project || connected) return;
    connected = true;
    document.addEventListener('pointerdown', () => { pointerDown = true; });
    document.addEventListener('pointerup', () => { pointerDown = false; });
    document.addEventListener('pointercancel', () => { pointerDown = false; });
    window.addEventListener('blur', () => { pointerDown = false; });
    const exportButton = document.createElement('button');
    exportButton.textContent = 'Export editable project';
    document.getElementById('garden-project').append(exportButton);
    exportButton.onclick = async () => {
      try {
        await context().garden.flush();
        const blob = await exportProject(capture());
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a'); link.href = url; link.download = 'project.zip'; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } catch (error) { context().garden.failed(error); }
    };
    context().garden.connect({
      capture, busy,
      saved: () => nativeChanges?.sealUnsavedChanges(),
      command: async command => {
        if (!currentProject) throw new Error('Open a game before using its tools.');
        if (command.op === 'inspect') return {
          name: currentProject.getName(),
          scenes: Array.from({ length: Math.min(100, currentProject.getLayoutsCount()) }, (_, i) => {
            const scene = currentProject.getLayoutAt(i);
            return { name: scene.getName(), objects: scene.getObjectsCount(), events: scene.getEvents().getEventsCount() };
          }),
        };
        if (command.op === 'set-name' && typeof command.name === 'string' && command.name.trim() && command.name.length <= 200) {
          currentProject.setName(command.name.trim());
          nativeChanges.triggerUnsavedChanges();
          return { name: currentProject.getName() };
        }
        if (command.op === 'set-background' && typeof command.scene === 'string' && currentProject.hasLayoutNamed(command.scene) && Array.isArray(command.rgb) && command.rgb.length === 3 && command.rgb.every(value => Number.isInteger(value) && value >= 0 && value <= 255)) {
          currentProject.getLayout(command.scene).setBackgroundColor(...command.rgb);
          nativeChanges.triggerUnsavedChanges();
          return { scene: command.scene, rgb: command.rgb };
        }
        throw new Error('Unsupported GDevelop command.');
      },
    });
  }, [project, changes]);
}
const save = async project => {
  currentProject = project;
  context().garden.changed();
  nativeSaving = true;
  try { await context().garden.flush(); } finally { nativeSaving = false; }
  return { wasSaved: true, fileMetadata: metadata() };
};
export const GardenStorageProvider = {
  internalName: 'Garden', name: t`Crux Garden`,
  getFileMetadataFromAppArguments: () => metadata(),
  getProjectLocation: ({ projectName }) => ({ fileIdentifier: 'garden-project.json', name: projectName }),
  createOperations: () => ({
    onOpenWithPicker: () => new Promise((resolve, reject) => {
      const input = document.createElement('input'); input.type = 'file'; input.accept = '.json,.zip';
      input.oncancel = () => { input.remove(); resolve(null); };
      input.onchange = async () => {
        try {
          const file = input.files?.[0];
          if (!file) { resolve(null); return; }
          pendingImport = await importProject(file, addMedia);
          resolve(metadata());
        } catch (error) { context().garden.failed(error); reject(error); }
        finally { input.remove(); }
      };
      input.style.display = 'none'; document.body.append(input); input.click();
    }),
    onOpen: async () => {
      if (pendingImport) { const content = pendingImport; pendingImport = null; return { content }; }
      const initial = context().garden.initial?.document;
      if (initial) return { content: await hydrate(initial) };
      const project = gd.ProjectHelper.createNewGDJSProject();
      project.setName('My game');
      project.resetProjectUuid();
      if (!project.getLayoutsCount()) project.insertNewLayout('Scene', 0);
      project.setFirstLayout(project.getLayoutAt(0).getName());
      const content = serializeToJSObject(project);
      project.delete();
      return { content };
    },
    onSaveProject: save,
    onAutoSaveProject: async project => { await save(project); },
    onChooseSaveProjectAsLocation: async () => ({ saveAsLocation: metadata(), saveAsOptions: {} }),
    onSaveProjectAs: async (project, location, options) => { options.onStartSaving(); return save(project); },
    getOpenErrorMessage: error => t`The Garden game could not be opened. Check its saved project and media.`,
    getWriteErrorMessage: error => t`Garden did not confirm the save. Keep this editor open and check its save status.`,
  }),
};
export const GardenResourceFetcher = { fetchAllProjectResources: async () => ({ erroredResources: [] }) };
export const GardenResourceMover = { moveAllProjectResources: async () => ({ erroredResources: [] }) };
