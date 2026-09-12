import { config } from '../src/editor/config';
let monacoReady;
function loadMonaco() {
    return (monacoReady ||= new Promise((resolve, reject) => {
        const script = document.createElement('script');
        const base = new URL('js/monaco-editor/min/vs', config.url.frontend).href;
        script.src = base + '/loader.js';
        script.onerror = () => reject(Error('Could not load the local code editor.'));
        script.onload = () => {
            /** @type {any} */
            const require = window['require'];
            require.config({ paths: { vs: base } });
            require(['vs/editor/editor.main'], () => resolve(window['monaco']), reject);
        };
        document.head.append(script);
    }));
}

// Use the bundled Monaco editor with local file persistence, without the hosted OT service.
export async function openCode({ editor, asset, originals, upload, session }) {
    if (!asset || !['script', 'text', 'json'].includes(asset.get('type')))
        throw Error('Create or select a script, text or JSON asset to edit.');
    if (document.querySelector('#garden-code')) return;
    const original = originals.get(Number(asset.get('id')));
    if (!original) throw Error('This asset has no editable original file.');
    const monaco = await loadMonaco();
    const dialog = document.createElement('dialog');
    dialog.id = 'garden-code';
    dialog.setAttribute('aria-label', 'Edit asset code');
    dialog.style.cssText =
        'width:85vw;height:80vh;padding:12px;background:#202428;color:white;border:1px solid #697078;';
    dialog.innerHTML =
        '<header style="display:flex;gap:12px"><strong style="flex:1"></strong><button>Save code</button><button>Close code editor</button></header><p role="status"></p><div style="height:calc(100% - 65px)"></div>';
    dialog.querySelector('strong').textContent = asset.get('name');
    document.body.append(dialog);
    dialog.showModal();
    const initial = new TextDecoder().decode(original.bytes);
    const code = monaco.editor.create(dialog.querySelector('div'), {
        value: initial,
        language: asset.get('type') === 'script' ? 'javascript' : asset.get('type') === 'json' ? 'json' : 'plaintext',
        theme: 'vs-dark',
        automaticLayout: true,
        minimap: { enabled: false }
    });
    let saved = initial,
        saving = null;
    const status = dialog.querySelector('p');
    code.onDidChangeModelContent(() => {
        status.textContent = code.getValue() === saved ? 'Saved code' : 'Unsaved code';
        session.changed();
    });
    const saveButton = dialog.querySelector('button');
    const persist = async () => {
        if (saving) await saving;
        while (code.getValue() !== saved) {
            const text = code.getValue();
            saving = (async () => {
                saveButton.disabled = true;
                await upload({
                    asset,
                    name: asset.get('name'),
                    type: asset.get('type'),
                    data: asset.get('data'),
                    file: new File([text], asset.get('name'), { type: original.type }),
                    parent: asset.get('path').length ? editor.assets.get(asset.get('path').at(-1)) : null
                });
                saved = text;
                // A syntax error must not prevent preserving a source-code draft in Growth.
                let parseError;
                if (asset.get('type') === 'script')
                    await new Promise((resolve) => {
                        editor.call('scripts:handleParse', asset, true, (error, result) => {
                            parseError = error?.message || result?.scriptsInvalid?.join('\n');
                            resolve();
                        });
                    });
                status.textContent = parseError
                    ? 'Code saved with script errors: ' + parseError
                    : code.getValue() === saved
                      ? 'Saved code'
                      : 'Unsaved code';
            })();
            try {
                await saving;
            } finally {
                saving = null;
                saveButton.disabled = false;
            }
        }
    };
    const unregister = session.registerDraft(persist);
    saveButton.onclick = async () => {
        try {
            await session.flush();
        } catch (error) {
            status.textContent = error.message;
        }
    };
    const close = (event) => {
        event?.preventDefault();
        if (saving || (code.getValue() !== saved && !window.confirm('Discard unsaved code edits?'))) return;
        unregister();
        code.getModel().dispose();
        code.dispose();
        dialog.close();
        dialog.remove();
    };
    dialog.querySelectorAll('button')[1].onclick = close;
    dialog.addEventListener('cancel', close);
    code.focus();
}
