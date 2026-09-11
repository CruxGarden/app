// @flow
import { archiveFiles, listArchiveFiles, getFileBlob } from '../Utils/BrowserArchiver';
import { validateNativeDocument } from '../../../../garden/model.mjs';
const types = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml', webp: 'image/webp', gif: 'image/gif', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', glb: 'model/gltf-binary', json: 'application/json', ttf: 'font/ttf', woff2: 'font/woff2' };
const extension = name => /\.([a-z0-9]{1,10})$/i.exec(name)?.[1].toLowerCase() || 'bin';
const progress = () => {};
export async function exportProject(records) {
  const document = structuredClone(records.document);
  const blobFiles = [];
  const added = new Set();
  for (const resource of document.resources?.resources || []) {
    if (!resource.file) continue;
    const [key, ...name] = resource.file.slice(7).split('/');
    const record = records[key];
    if (!record) throw new Error('Missing original media: ' + resource.name);
    const target = 'assets/' + key.slice(6) + '.' + extension(decodeURIComponent(name.join('/')));
    resource.file = target;
    if (!added.has(target)) {
      added.add(target);
      blobFiles.push({ filePath: '/project/' + target, blob: new Blob([Uint8Array.from(atob(record.bytes), c => c.charCodeAt(0))], { type: record.type }) });
    }
  }
  return archiveFiles({ textFiles: [{ filePath: '/project/game.json', text: JSON.stringify(document, null, 2) }], blobFiles, basePath: '/project/', onProgress: progress });
}
export async function importProject(file, addMedia) {
  if (file.size > 128 * 1024 * 1024) throw new Error('Choose a project archive up to 128 MiB.');
  const zip = file.name.toLowerCase().endsWith('.zip');
  let entries = [];
  let projectPath = '';
  let document;
  const read = async (filePath, contentType) => {
    const blob = await getFileBlob({ archiveBlob: file, filePath, contentType, onProgress: progress, sizeLimit: 32 * 1024 * 1024 });
    if (blob.size > 32 * 1024 * 1024) throw new Error('An archive member exceeds 32 MiB.');
    return blob;
  };
  if (zip) {
    entries = await listArchiveFiles({ archiveBlob: file, onProgress: progress });
    if (entries.length > 4000 || entries.some(name => /(^|\/)\.\.(\/|$)|^\/|\\|\0/.test(name))) throw new Error('Invalid project archive paths.');
    projectPath = entries.find(name => name === 'game.json' || name === 'project.json') || '';
    if (!projectPath) throw new Error('The archive needs game.json or project.json at its root.');
    document = JSON.parse(await (await read(projectPath, 'application/json')).text());
  } else {
    if (file.size > 32 * 1024 * 1024) throw new Error('Choose a project JSON up to 32 MiB.');
    document = JSON.parse(await file.text());
  }
  validateNativeDocument(document);
  let total = 0;
  for (const resource of document.resources?.resources || []) {
    if (!resource.file) continue;
    if (!zip || !entries.includes(resource.file)) throw new Error('Import a ZIP containing the native project and this original resource: ' + resource.file);
    const mimeType = types[extension(resource.file)] || 'application/octet-stream';
    const blob = await read(resource.file, mimeType);
    total += blob.size;
    if (total > 128 * 1024 * 1024) throw new Error('Unpacked project media exceeds 128 MiB.');
    resource.file = await addMedia(new File([blob], resource.file.split('/').pop(), { type: mimeType }));
  }
  return document;
}
