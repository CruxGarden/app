/* Local scene/asset provider for the native PlayCanvas Editor integration. */
import { config } from '../src/editor/config';
import { openCode } from './code.js';
import { openLaunch } from './preview.js';
import { editorDefaults, sceneDefaults } from './schema.js';

/** @type {any} */
const e = window['editor'];
/** @type {any} */
const session = window['gardenSession'];
const api = e.api.globals;
const state = session.initial;
const settings = new Map();
const originals = new Map();
const urls = new Map();
// Asset observers otherwise rewrite changed file URLs to the hosted REST endpoint.
e.api.Asset.getFileUrl = (id) => urls.get(Number(id)) || '';
let busy = 0;
let nextId = Math.max(0, ...Object.keys(state?.assets || {}).map(Number)) + 1;
const changed = () => session.changed();
const watch = (observer) => {
    for (const event of ['*:set', '*:unset', '*:insert', '*:remove', '*:move']) observer.on(event, changed);
};
const rootId = '11111111-1111-4111-8111-111111111111';
const defaultEntity = (id, name, components, position, rotation, parent = rootId) => ({
    resource_id: id,
    name,
    enabled: true,
    tags: [],
    position,
    rotation,
    scale: [1, 1, 1],
    parent,
    children: [],
    components
});
const initialScene = state?.scene || {
    settings: structuredClone(sceneDefaults),
    entities: {
        [rootId]: {
            ...defaultEntity(rootId, 'Root', {}, [0, 0, 0], [0, 0, 0], null),
            children: [
                '22222222-2222-4222-8222-222222222222',
                '33333333-3333-4333-8333-333333333333',
                '44444444-4444-4444-8444-444444444444'
            ]
        },
        '22222222-2222-4222-8222-222222222222': defaultEntity(
            '22222222-2222-4222-8222-222222222222',
            'Camera',
            { camera: {} },
            [4, 3, 6],
            [-20, 34, 0]
        ),
        '33333333-3333-4333-8333-333333333333': defaultEntity(
            '33333333-3333-4333-8333-333333333333',
            'Light',
            { light: {} },
            [0, 3, 0],
            [45, 30, 0]
        ),
        '44444444-4444-4444-8444-444444444444': defaultEntity(
            '44444444-4444-4444-8444-444444444444',
            'Cube',
            { render: { type: 'box' } },
            [0, 0.5, 0],
            [0, 0, 0]
        )
    }
};
const scene = Object.assign(new e.observer.Events(), {
    id: '1',
    uniqueId: '1',
    data: initialScene,
    submitOp: changed,
    addEntity: changed,
    removeEntity: changed,
    whenNothingPending: (callback) => queueMicrotask(callback)
});
Object.defineProperty(api.realtime, 'scenes', {
    value: {
        current: scene,
        load: () => api.realtime.emit('load:scene', scene),
        unload: () => {}
    }
});
api.realtime.connection.connect = () =>
    queueMicrotask(() => {
        api.realtime.emit('connected');
        api.realtime.emit('authenticated');
    });
api.realtime.connection.sendMessage = () => {};
api.messenger.connect = () => {};
function fileUrl(id, original) {
    if (urls.has(id)) URL.revokeObjectURL(urls.get(id));
    const url = URL.createObjectURL(new Blob([original.bytes], { type: original.type }));
    urls.set(id, url);
    return url;
}
function addAsset(data) {
    const asset = new e.api.Asset(data);
    asset.initializeHistory();
    api.assets.add(asset);
    watch(asset.observer);
    return asset;
}
api.assets.loadAllAndSubscribe = async () => {
    api.assets.clear();
    for (const [id, saved] of Object.entries(state?.assets || {})) {
        const data = structuredClone(saved);
        if (data.file) {
            const original = state['file-' + id];
            if (!original) throw Error(`Original file missing for ${data.name}.`);
            originals.set(Number(id), original);
            data.file.url = fileUrl(Number(id), original);
        }
        addAsset(data);
    }
    api.assets.emit('load:progress', 1);
    api.assets.emit('load:all');
};
api.assets.loadAll = api.assets.loadAllAndSubscribe;
async function upload(args) {
    busy++;
    try {
        const type = args.type || 'text';
        if (type === 'script' && !String(args.name || args.filename || args.file?.name).endsWith('.js'))
            throw Error('This local integration currently runs classic .js scripts.');
        if (!['texture', 'script', 'text', 'json', 'material', 'folder'].includes(type))
            throw Error('This local editor currently imports images, classic scripts, text and JSON.');
        const id = args.asset ? Number(args.asset.get('id')) : nextId++;
        const name = String(args.name || args.file?.name || 'Asset');
        if (!name || name.length > 200 || /[\\/]/.test(name)) throw Error('Choose a filename up to 200 characters.');
        const parent = args.parent;
        const path = parent ? [...parent.get('path'), Number(parent.get('id'))] : [];
        let file = null;
        if (args.file) {
            if (args.file.size > 128000000) throw Error('Choose a file up to 128 MB.');
            const bytes = new Uint8Array(await args.file.arrayBuffer());
            const original = {
                bytes,
                type: args.file.type || (type === 'script' ? 'text/javascript' : 'application/octet-stream')
            };
            originals.set(id, original);
            file = { filename: name, size: bytes.byteLength, url: fileUrl(id, original) };
        }
        const defaults = api.schema.assets.getDefaultData(type) || {};
        const data = {
            id,
            uniqueId: id,
            name,
            type,
            path,
            source: type === 'folder',
            preload: args.preload ?? type !== 'folder',
            has_thumbnail: false,
            tags: [],
            file,
            data: { ...defaults, ...(args.data || {}) },
            meta: args.meta || {},
            scope: { type: 'project', id: 1 }
        };
        if (args.asset) {
            for (const [key, value] of Object.entries(data)) args.asset.set(key, value);
        } else addAsset(data);
        changed();
        return data;
    } finally {
        busy--;
    }
}
api.assets.upload = async (args, _settings, progress) => {
    const data = await upload({ ...args, parent: args.folder || args.parent });
    progress?.(1);
    return api.assets.get(data.id);
};
// Keep the native upload/create interfaces and replace only their service operation.
const nativeMethods = e.method.bind(e);
e.method = (name, fn) => {
    if (name === 'settings:create')
        fn = (args) => {
            const data = structuredClone(state?.settings?.[args.name] || args.data);
            if (args.name === 'user' || args.name === 'projectUser')
                data.editor = { ...structuredClone(editorDefaults), ...(data.editor || {}) };
            const observer = new e.observer.Observer(data);
            observer.id = args.id;
            observer.sync = { enabled: true };
            observer.reload = () => e.emit(`settings:${args.name}:load`, observer.json());
            observer.disconnect = () => {};
            settings.set(args.name, observer);
            watch(observer);
            nativeMethods(`settings:${args.name}`, () => observer);
            return observer;
        };
    if (name === 'realtime:subscribe:userdata')
        fn = () => {
            queueMicrotask(() => {
                e.emit(`userdata:${config.self.id}:raw`, state?.settings?.sceneUser || { cameras: {} });
                const observer = e.call('userdata');
                settings.set('sceneUser', observer);
                watch(observer);
            });
            return { type: 'local', destroy() {}, submitOp: changed };
        };
    if (
        ['picker:scene', 'picker:project', 'picker:builds-publish', 'picker:store', 'picker:versioncontrol'].includes(
            name
        )
    )
        fn = () =>
            session.failed(Error('This is a local scene. Use Garden for project history and complete Crux export.'));
    if (name === 'menu:entities:new') {
        const native = fn;
        fn = (...args) =>
            native(...args)
                .filter((item) => ['Entity', '3D', 'Camera', 'Light'].includes(item.text))
                .map((item) =>
                    item.text === '3D'
                        ? {
                              ...item,
                              items: item.items.filter(
                                  (child) => !['Render', 'GSplat', 'Model (legacy)'].includes(child.text)
                              )
                          }
                        : item
                );
    }
    if (name === 'assets:realPath') fn = (asset) => asset.get('file.url');
    if (name === 'picker:codeeditor')
        fn = (asset) =>
            openCode({
                editor: e,
                asset: asset || api.assets.list().find((a) => ['script', 'text', 'json'].includes(a.get('type'))),
                originals,
                upload,
                session
            }).catch((error) => {
                console.error(error);
                session.failed(error);
            });
    if (name === 'realtime:scene:op' || name === 'realtime:assets:op') fn = changed;
    if (name === 'assets:uploadFile')
        fn = (args, done) =>
            upload(args).then(
                (data) => done?.(null, data),
                (error) => done?.(error.message)
            );
    return nativeMethods(name, fn);
};
e.on('entities:add', (observer) => {
    watch(observer);
    changed();
});
e.on('entities:remove', changed);
e.on('assets:remove', changed);
e.on('load', () => {
    watch(api.settings.scene.observer || e.call('sceneSettings'));
});
let entitiesReady = false,
    assetsReady = false,
    connected = false;
function capture() {
    const assets = {};
    const project = {
        name: config.project.name,
        scene: {
            settings: api.settings.scene.json(),
            entities: Object.fromEntries(
                api.entities.list().map((entity) => [entity.get('resource_id'), entity.json()])
            )
        },
        settings: Object.fromEntries([...settings].map(([name, observer]) => [name, observer.json()])),
        assets
    };
    for (const asset of api.assets.list()) {
        const data = asset.json();
        if (data.file) {
            const id = Number(data.id);
            if (!originals.has(id)) throw Error(`The original file for ${data.name} is unavailable.`);
            project['file-' + id] = originals.get(id);
            data.file.url = 'file-' + id;
        }
        assets[data.id] = data;
    }
    return project;
}
function connect() {
    if (!entitiesReady || !assetsReady || connected) return;
    connected = true;
    nativeMethods('garden:launch', () =>
        openLaunch({ session, capture }).catch((error) => {
            console.error(error);
            session.failed(error);
        })
    );
    session.connect({
        capture,
        busy: () => busy > 0,
        command: async (command) => {
            if (command.op === 'inspect')
                return {
                    name: config.project.name,
                    entities: api.entities
                        .list()
                        .slice(0, 200)
                        .map((entity) => ({
                            id: entity.get('resource_id'),
                            name: entity.get('name'),
                            components: Object.keys(entity.get('components'))
                        })),
                    assets: api.assets
                        .list()
                        .slice(0, 200)
                        .map((asset) => ({ id: asset.get('id'), name: asset.get('name'), type: asset.get('type') }))
                };
            if (
                command.op === 'set-name' &&
                typeof command.name === 'string' &&
                command.name.trim() &&
                command.name.length <= 200
            ) {
                config.project.name = command.name;
                changed();
                return { name: config.project.name };
            }
            if (
                command.op === 'rename-entity' &&
                typeof command.name === 'string' &&
                command.name.trim() &&
                command.name.length <= 200
            ) {
                const entity = api.entities.get(command.entityId);
                if (!entity) throw Error('Choose an existing entity.');
                entity.set('name', command.name);
                return { id: command.entityId, name: entity.get('name') };
            }
            throw Error('Choose a supported scene operation.');
        }
    });
}
e.on('entities:load', () => {
    entitiesReady = true;
    connect();
});
e.on('assets:load', () => {
    assetsReady = true;
    connect();
});
e.on('viewport:error', (error) => session.failed(error));
window.addEventListener('pagehide', () => {
    for (const url of urls.values()) URL.revokeObjectURL(url);
});

e.on('loaded', () => {
    const style = document.createElement('style');
    style.textContent = '[data-toolbar-id="publish"], .asset-store-button { display:none!important }';
    document.head.append(style);
});
