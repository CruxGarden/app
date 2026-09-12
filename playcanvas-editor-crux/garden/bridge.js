import { validateProject } from './model.js';

export async function startGarden() {
    let app;
    let origin;
    let expected = null;
    let revision = 0,
        saved = 0,
        hydrating = true;
    let timer,
        tail = Promise.resolve(),
        commandTail = Promise.resolve();
    const pending = new Map();
    const draftFlushers = new Set();
    let assetCache = new Map();
    const originalCache = new WeakMap();
    const bar = document.createElement('div');
    bar.id = 'garden-project';
    bar.innerHTML =
        '<span role="status">Opening Garden project…</span><button>Save project</button><button>Reload saved project</button>';
    const style = document.createElement('style');
    style.textContent =
        '#garden-project{position:fixed;bottom:0;left:0;right:0;height:32px;z-index:10000;display:flex;gap:12px;align-items:center;padding:0 10px;background:#24282c;color:#fff;font:12px system-ui}#garden-project span{flex:1}#garden-project button{padding:3px 8px;color:#fff;background:#42494f;border:1px solid #697078;border-radius:3px}#root{height:calc(100dvh - 34px)!important}';
    document.head.append(style);
    document.body.append(bar);
    const cover = document.createElement('div');
    cover.style.cssText = 'position:fixed;inset:0 0 34px;z-index:9999;background:#fafafacc;cursor:wait';
    document.body.append(cover);
    const status = bar.querySelector('span');
    const show = (text) => {
        status.textContent = text;
    };
    const send = (value) =>
        window.parent.postMessage(
            { type: 'crux:app', id: crypto.randomUUID(), ...value },
            origin && origin !== 'null' ? origin : '*'
        );
    const call = (value) =>
        new Promise((resolve, reject) => {
            const id = crypto.randomUUID();
            const timeout = setTimeout(() => {
                pending.delete(id);
                reject(new Error('Garden did not confirm the save. Your draft is still open.'));
            }, 60000);
            pending.set(id, {
                resolve: (result) => {
                    clearTimeout(timeout);
                    resolve(result);
                },
                reject: (error) => {
                    clearTimeout(timeout);
                    reject(error);
                }
            });
            send({ ...value, id });
        });
    function dirty() {
        if (hydrating) return;
        revision++;
        send({ op: 'dirty', dirty: true });
        show('Unsaved changes');
        clearTimeout(timer);
        timer = setTimeout(() => save().catch(() => {}), 800);
    }
    async function settle() {
        const deadline = Date.now() + 55000;
        await new Promise((resolve) => requestAnimationFrame(resolve));
        while (app?.busy()) {
            if (Date.now() > deadline)
                throw new Error('Wait for the scene operation to finish before closing this editor.');
            await new Promise((resolve) => setTimeout(resolve, 40));
        }
    }
    async function capture() {
        const captured = await app.capture();
        const project = Object.fromEntries(
            Object.entries(captured).map(([key, value]) => [
                key,
                key.startsWith('file-') ? value : structuredClone(value)
            ])
        );
        validateProject({ version: 1, app: 'playcanvas-editor', project });
        const nextAssets = new Map();
        const encode = async (value) => {
            const text = JSON.stringify(value);
            let ref = assetCache.get(text);
            if (!ref) {
                const bytes = new TextEncoder().encode(text).buffer;
                const saved = await call({
                    op: 'native-import',
                    bytes,
                    mimeType: 'application/json'
                });
                ref = {
                    __cruxBinary: {
                        path: saved.path,
                        kind: 'buffer',
                        type: 'application/json',
                        size: bytes.byteLength
                    }
                };
            }
            nextAssets.set(text, ref);
            return ref;
        };
        for (const key of Object.keys(project)) {
            if (key.startsWith('file-')) {
                const file = project[key];
                let ref = originalCache.get(captured[key]);
                if (!ref) {
                    const bytes = file.bytes.buffer.slice(
                        file.bytes.byteOffset,
                        file.bytes.byteOffset + file.bytes.byteLength
                    );
                    const result = await call({ op: 'native-import', bytes, mimeType: file.type });
                    ref = {
                        __cruxBinary: {
                            path: result.path,
                            kind: 'buffer',
                            type: file.type,
                            size: file.bytes.byteLength
                        }
                    };
                    originalCache.set(captured[key], ref);
                }
                project[key] = ref;
            } else project[key] = await encode(project[key]);
        }
        const doc = { version: 1, app: 'playcanvas-editor', project };
        validateProject(doc);
        assetCache = nextAssets;
        return doc;
    }
    async function decodeProject(project) {
        project = structuredClone(project);
        const decode = async (ref) => {
            const loaded = await call({
                op: 'native-read',
                path: ref.__cruxBinary.path
            });
            const text = new TextDecoder().decode(loaded.bytes);
            assetCache.set(text, ref);
            return JSON.parse(text);
        };
        for (const key of Object.keys(project)) {
            if (key.startsWith('file-')) {
                const ref = project[key];
                const loaded = await call({ op: 'native-read', path: ref.__cruxBinary.path });
                project[key] = { bytes: new Uint8Array(loaded.bytes), type: ref.__cruxBinary.type };
                originalCache.set(project[key], ref);
            } else project[key] = await decode(project[key]);
        }
        return project;
    }
    function save() {
        const operation = tail.then(async () => {
            clearTimeout(timer);
            for (const flush of draftFlushers) await flush();
            await settle();
            if (hydrating) throw new Error('Wait for the saved project to finish opening.');
            if (revision === saved) return;
            const saving = revision;
            try {
                show('Saving project…');
                const doc = await capture();
                const result = await call({
                    op: 'write',
                    path: 'project.json',
                    expected,
                    content: JSON.stringify(doc)
                });
                expected = result.fingerprint;
                saved = saving;
                send({ op: 'dirty', dirty: revision !== saved });
                show(revision === saved ? 'Saved to Garden' : 'Unsaved changes');
            } catch (error) {
                show(error.message);
                throw error;
            }
        });
        tail = operation.catch(() => {});
        return operation;
    }
    async function command(value) {
        if (hydrating || !app) throw new Error('Wait for the scene editor to open.');
        await save();
        const result = await app.command(value);
        await settle();
        await save();
        return result;
    }
    window.addEventListener('message', (event) => {
        if (event.source !== window.parent || (origin !== undefined && event.origin !== origin)) return;
        const message = event.data;
        if (!message || typeof message.type !== 'string' || !message.type.startsWith('crux:app:')) return;
        origin = event.origin;
        if (message.type === 'crux:app:result') {
            const request = pending.get(message.id);
            pending.delete(message.id);
            if (message.error) request?.reject(new Error(message.error));
            else request?.resolve(message.result);
        } else if (message.type === 'crux:app:flush') {
            (async () => {
                do {
                    await save();
                } while (revision !== saved);
            })().then(
                () => send({ op: 'flushed', flushId: message.id }),
                (error) => send({ op: 'flushed', flushId: message.id, error: error.message })
            );
        } else if (message.type === 'crux:app:command') {
            const operation = commandTail.then(() => command(message.command));
            commandTail = operation.catch(() => {});
            operation.then(
                (result) => send({ op: 'tool-result', commandId: message.id, result }),
                (error) =>
                    send({
                        op: 'tool-result',
                        commandId: message.id,
                        error: error.message
                    })
            );
        }
    });
    bar.querySelectorAll('button')[0].onclick = () => save().catch(() => {});
    bar.querySelectorAll('button')[1].onclick = () => {
        if (revision === saved || window.confirm('Discard the unsaved draft and reload the saved project?'))
            window.location.reload();
    };
    try {
        const loaded = await call({ op: 'read', path: 'project.json' });
        expected = loaded.fingerprint;
        const doc = JSON.parse(loaded.content);
        validateProject(doc);
        const initial = doc.project ? await decodeProject(doc.project) : null;
        validateProject({ version: 1, app: 'playcanvas-editor', project: initial });
        return {
            initial,
            flush: save,
            registerDraft(flush) {
                draftFlushers.add(flush);
                return () => draftFlushers.delete(flush);
            },
            changed: dirty,
            failed(error) {
                show(error.message);
            },
            connect(api) {
                app = api;
                cover.remove();
                hydrating = false;
                show('Saved to Garden');
                dirty();
            }
        };
    } catch (error) {
        show(error.message);
        throw error;
    }
}
