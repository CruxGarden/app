import { validateProject } from './model.js';
const pc = window['pc'];
let started = false;
const urls = [];
const urlFor = (bytes, type) => {
    const url = URL.createObjectURL(new Blob([bytes], { type }));
    urls.push(url);
    return url;
};
window.addEventListener('message', async (event) => {
    if (
        started ||
        event.source !== window.parent ||
        event.origin !== location.origin ||
        event.data?.type !== 'garden:launch:project'
    )
        return;
    started = true;
    const status = document.querySelector('p');
    try {
        const project = event.data.project;
        validateProject({ version: 1, app: 'playcanvas-editor', project });
        const canvas = document.querySelector('canvas');
        const app = new pc.Application(canvas, {
            mouse: new pc.Mouse(canvas),
            keyboard: new pc.Keyboard(window),
            touch: new pc.TouchDevice(canvas)
        });
        app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
        app.setCanvasResolution(pc.RESOLUTION_AUTO);
        window.addEventListener('resize', () => app.resizeCanvas());
        for (const data of Object.values(project.assets)) {
            if (data.type === 'folder') continue;
            let file = null;
            if (data.file) {
                const original = project['file-' + data.id];
                if (!original) throw Error('Missing original: ' + data.name);
                file = { ...data.file, url: urlFor(original.bytes, original.type) };
            }
            const asset = new pc.Asset(data.name, data.type, file, data.data);
            asset.id = Number(data.id);
            asset.preload = !!data.preload;
            app.assets.add(asset);
        }
        // Scripts load in project order; their classes must exist before parsing the hierarchy.
        const scripts = app.assets.list().filter((asset) => asset.type === 'script');
        const order = project.settings.project?.scripts || [];
        scripts.sort(
            (a, b) =>
                (order.indexOf(a.id) < 0 ? Infinity : order.indexOf(a.id)) -
                (order.indexOf(b.id) < 0 ? Infinity : order.indexOf(b.id))
        );
        for (const asset of scripts)
            await new Promise((resolve, reject) => {
                asset.once('load', resolve);
                asset.once('error', reject);
                app.assets.load(asset);
            });
        await new Promise((resolve, reject) => {
            app.assets.on('error', reject);
            app.preload((error) => (error ? reject(error) : resolve()));
        });
        app.applySceneSettings(project.scene.settings);
        const sceneUrl = urlFor(JSON.stringify(project.scene), 'application/json');
        await new Promise((resolve, reject) =>
            app.scenes.loadSceneHierarchy(sceneUrl, (error) => (error ? reject(error) : resolve()))
        );
        app.start();
        status.textContent = 'Running scene';
        status.style.display = 'none';
        window.addEventListener(
            'pagehide',
            () => {
                app.destroy();
                for (const url of urls) URL.revokeObjectURL(url);
            },
            { once: true }
        );
    } catch (error) {
        status.textContent = 'Cannot launch scene: ' + error.message;
    }
});
window.parent.postMessage({ type: 'garden:launch:ready' }, location.origin);
