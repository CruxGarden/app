// @flow
import * as React from 'react';
import { t } from '@lingui/macro';
import { exportProject, importProject } from './ProjectArchive';
import { serializeToJSObject } from '../Utils/Serializer';
import { prepareGardenSceneCommand } from './SceneTools';
import { prepareGardenObjectCommand } from './ObjectTools';
import { inspectGame, readGameContent, gameCatalogue } from '../../../../garden/inspection.mjs';
import { validateNativeDocument } from '../../../../garden/model.mjs';
import { putFile, getBrowserSWPreviewBaseUrl, getBrowserSWPreviewRootUrl } from '../ExportAndShare/BrowserExporters/BrowserSWPreviewLauncher/BrowserSWPreviewIndexedDB';
import { browserHTML5ExportPipeline as exportPipeline } from '../ExportAndShare/BrowserExporters/BrowserHTML5Export';
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
      prepare: command => prepareGardenSceneCommand(() => currentProject, command) || prepareGardenObjectCommand(() => currentProject, command),
      saved: () => nativeChanges?.sealUnsavedChanges(),
      command: async command => {
        if (!currentProject) throw new Error('Open a game before using its tools.');
        if (command.op === 'inspect' || command.op === 'read-content') {
          const document = serializeToJSObject(currentProject, 'serializeTo', { canonicalEventSerialization: true });
          return command.op === 'inspect' ? inspectGame(document, command) : readGameContent(document, command);
        }
        if (command.op === 'catalogue') return gameCatalogue(gd, currentProject.getCurrentPlatform(), command);
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
        // Garden operations below use the same native gd APIs as the editors:
        // resources from files of this Crux, sprite objects, instances, standard events.
        if (command.op === 'add-resource') return addResource(command);
        if (command.op === 'add-sprite-object') return addSpriteObject(command);
        if (command.op === 'add-instance') return addInstance(command);
        if (command.op === 'add-event') return addEvent(command);
        if (command.op === 'export-web-game') return exportWebGame(command.name);
        throw new Error('Unsupported GDevelop command.');
      },
    });
  }, [project, changes]);
}
const text = (value, max = 200) => typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : null;
const validName = value => text(value, 100) && /^[A-Za-z_][A-Za-z0-9_]*$/.test(value.trim()) ? value.trim() : null;
const layoutOf = scene => {
  const name = text(scene);
  if (!name || !currentProject.hasLayoutNamed(name)) throw new Error('Choose an existing scene.');
  return currentProject.getLayout(name);
};
async function fileFromCrux(path, name) {
  if (!text(path, 240)) throw new Error('Choose a file path in this Crux.');
  const read = await context().garden.readFile(path);
  return new File([read.bytes], name, { type: read.mimeType });
}
/** Register a file of this Crux (image or audio) as a named native resource. */
async function addResource({ path, name, kind }) {
  const resourceName = validName(name);
  if (!resourceName || (kind !== 'image' && kind !== 'audio')) throw new Error('Choose a resource name (letters, digits, underscores) and a kind: image or audio.');
  const manager = currentProject.getResourcesManager();
  if (manager.hasResource(resourceName)) throw new Error('A resource with this name already exists.');
  const file = await fileFromCrux(path, path.split('/').pop());
  if (kind === 'image' ? !file.type.startsWith('image/') : !file.type.startsWith('audio/')) throw new Error(`The file at ${path} is not a ${kind}.`);
  const resource = kind === 'image' ? new gd.ImageResource() : new gd.AudioResource();
  resource.setName(resourceName);
  resource.setFile(await addMedia(file));
  manager.addResource(resource);
  resource.delete();
  nativeChanges.triggerUnsavedChanges();
  return { resource: resourceName, kind, size: file.size };
}
/** Slice a sheet into frames on a canvas; each frame becomes its own image resource. */
async function frameResources(baseName, file, frameWidth, frameHeight) {
  const bitmap = await createImageBitmap(file);
  const columns = Math.floor(bitmap.width / frameWidth), rows = Math.floor(bitmap.height / frameHeight);
  if (columns < 1 || rows < 1 || columns * rows > 64) throw new Error('Choose frame dimensions that divide the sheet into 1 to 64 frames.');
  const manager = currentProject.getResourcesManager();
  const names = [];
  for (let row = 0; row < rows; row++)
    for (let column = 0; column < columns; column++) {
      const canvas = document.createElement('canvas');
      canvas.width = frameWidth; canvas.height = frameHeight;
      canvas.getContext('2d').drawImage(bitmap, column * frameWidth, row * frameHeight, frameWidth, frameHeight, 0, 0, frameWidth, frameHeight);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      const resourceName = `${baseName}_${names.length + 1}`;
      if (manager.hasResource(resourceName)) throw new Error(`A resource named ${resourceName} already exists.`);
      const resource = new gd.ImageResource();
      resource.setName(resourceName);
      resource.setFile(await addMedia(new File([blob], resourceName + '.png', { type: 'image/png' })));
      manager.addResource(resource);
      resource.delete();
      names.push(resourceName);
    }
  return names;
}
/** A Sprite object with one looping animation built from a file of this Crux, optionally sliced into frames. */
async function addSpriteObject({ scene, name, path, frameWidth, frameHeight, fps, behaviors }) {
  const layout = layoutOf(scene);
  const objectName = validName(name);
  if (!objectName) throw new Error('Choose an object name (letters, digits, underscores).');
  if (layout.getObjects().hasObjectNamed(objectName) || currentProject.getObjects().hasObjectNamed(objectName)) throw new Error('An object with this name already exists.');
  const sliced = frameWidth !== undefined || frameHeight !== undefined;
  if (sliced && !(Number.isInteger(frameWidth) && Number.isInteger(frameHeight) && frameWidth > 0 && frameHeight > 0 && frameWidth <= 4096 && frameHeight <= 4096)) throw new Error('Choose integer frame dimensions.');
  const rate = fps === undefined ? 8 : fps;
  if (!Number.isInteger(rate) || rate < 1 || rate > 60) throw new Error('Choose 1 to 60 frames per second.');
  const list = Array.isArray(behaviors) ? behaviors : [];
  if (list.length > 8 || list.some(type => !text(type) || !gd.MetadataProvider.getBehaviorMetadata(currentProject.getCurrentPlatform(), type) || gd.MetadataProvider.isBadBehaviorMetadata(gd.MetadataProvider.getBehaviorMetadata(currentProject.getCurrentPlatform(), type)))) throw new Error('Choose up to 8 existing behavior types, for example TopDownMovementBehavior::TopDownMovementBehavior.');
  const file = await fileFromCrux(path, path.split('/').pop());
  if (!file.type.startsWith('image/')) throw new Error(`The file at ${path} is not an image.`);
  const frames = sliced ? await frameResources(objectName, file, frameWidth, frameHeight) : [];
  if (!sliced) {
    const resource = new gd.ImageResource();
    const resourceName = `${objectName}_1`;
    if (currentProject.getResourcesManager().hasResource(resourceName)) throw new Error(`A resource named ${resourceName} already exists.`);
    resource.setName(resourceName);
    resource.setFile(await addMedia(file));
    currentProject.getResourcesManager().addResource(resource);
    resource.delete();
    frames.push(resourceName);
  }
  const object = layout.getObjects().insertNewObject(currentProject, 'Sprite', objectName, layout.getObjects().getObjectsCount());
  const configuration = gd.asSpriteConfiguration(object.getConfiguration());
  const animation = new gd.Animation();
  animation.setName('Idle');
  animation.setDirectionsCount(1);
  const direction = animation.getDirection(0);
  direction.setTimeBetweenFrames(1 / rate);
  direction.setLoop(true);
  for (const resourceName of frames) {
    const sprite = new gd.Sprite();
    sprite.setImageName(resourceName);
    direction.addSprite(sprite);
    sprite.delete();
  }
  configuration.getAnimations().addAnimation(animation);
  animation.delete();
  for (const type of list) {
    const behaviorName = type.split('::').pop();
    if (!object.hasBehaviorNamed(behaviorName)) gd.WholeProjectRefactorer.addBehaviorAndRequiredBehaviors(currentProject, object, type, behaviorName);
  }
  nativeChanges.triggerUnsavedChanges();
  return { scene: layout.getName(), object: objectName, frames, behaviors: list };
}
function addInstance({ scene, object, x, y }) {
  const layout = layoutOf(scene);
  const objectName = validName(object);
  if (!objectName || !(layout.getObjects().hasObjectNamed(objectName) || currentProject.getObjects().hasObjectNamed(objectName))) throw new Error('Choose an existing object in this scene.');
  if (![x, y].every(v => Number.isFinite(v) && Math.abs(v) <= 100000)) throw new Error('Choose x and y positions.');
  const instance = layout.getInitialInstances().insertNewInitialInstance();
  instance.setObjectName(objectName);
  instance.setX(x); instance.setY(y);
  nativeChanges.triggerUnsavedChanges();
  return { scene: layout.getName(), object: objectName, x, y, instances: layout.getInitialInstances().getInstancesCount() };
}
function instruction(spec, isCondition) {
  if (!spec || !text(spec.type) || !Array.isArray(spec.parameters) || spec.parameters.length > 12 || spec.parameters.some(p => typeof p !== 'string' || p.length > 500)) throw new Error('Each condition or action needs a type and string parameters.');
  const platform = currentProject.getCurrentPlatform();
  const metadata = isCondition ? gd.MetadataProvider.getConditionMetadata(platform, spec.type) : gd.MetadataProvider.getActionMetadata(platform, spec.type);
  if (isCondition ? gd.MetadataProvider.isBadInstructionMetadata(metadata) : gd.MetadataProvider.isBadInstructionMetadata(metadata)) throw new Error(`Unknown ${isCondition ? 'condition' : 'action'} type: ${spec.type}`);
  const result = new gd.Instruction();
  result.setType(spec.type);
  result.setParametersCount(spec.parameters.length);
  spec.parameters.forEach((value, index) => result.setParameter(index, value));
  if (spec.inverted === true) result.setInverted(true);
  return result;
}
/** One standard event appended to a scene: conditions and actions by their native types. */
function addEvent({ scene, conditions, actions }) {
  const layout = layoutOf(scene);
  const c = Array.isArray(conditions) ? conditions : [], a = Array.isArray(actions) ? actions : [];
  if (c.length > 8 || a.length > 8 || (!c.length && !a.length)) throw new Error('Choose up to 8 conditions and 8 actions.');
  const built = [...c.map(spec => instruction(spec, true)), ...a.map(spec => instruction(spec, false))];
  const events = layout.getEvents();
  const event = gd.asStandardEvent(events.insertNewEvent(currentProject, 'BuiltinCommonInstructions::Standard', events.getEventsCount()));
  built.slice(0, c.length).forEach(i => event.getConditions().push_back(i));
  built.slice(c.length).forEach(i => event.getActions().push_back(i));
  built.forEach(i => i.delete());
  nativeChanges.triggerUnsavedChanges();
  return { scene: layout.getName(), events: events.getEventsCount() };
}
/** Build the playable web game with GDevelop's exporter and save the ZIP as a Cruxspace output. */
export async function exportWebGame(name) {
  const label = text(name, 120);
  if (!label) throw new Error('Name the exported game.');
  if (!currentProject) throw new Error('Open a game before exporting.');
  await context().garden.flush();
  const exportContext = { project: currentProject, updateStepProgress: () => {} };
  const prepared = await exportPipeline.prepareExporter(exportContext);
  const output = await exportPipeline.launchExport(exportContext, prepared, null);
  const resources = await exportPipeline.launchResourcesDownload(exportContext, output);
  const blob = await exportPipeline.launchCompression(exportContext, resources);
  const saved = await context().garden.saveOutput(label, await blob.arrayBuffer(), 'application/zip');
  return { output: saved.id, label, size: blob.size };
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
