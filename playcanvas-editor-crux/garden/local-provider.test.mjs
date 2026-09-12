import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateProject } from './model.js';
const { chromium } = await import(new URL('../../electron/node_modules/playwright/index.mjs', import.meta.url));
const root = resolve(fileURLToPath(new URL('../runtime/', import.meta.url)));
const scratch = await mkdtemp(join(tmpdir(), 'crux-playcanvas-provider-'));
await mkdir(join(scratch, 'assets'));
let content = JSON.stringify({ version: 1, app: 'playcanvas-editor', project: null });
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const host = `<!doctype html><style>html,body,iframe{margin:0;width:100%;height:100%;border:0}</style><iframe src="/runtime/index.html"></iframe><script>
addEventListener('message',async event=>{if(event.source!==document.querySelector('iframe').contentWindow||event.origin!==location.origin)return;const message=event.data;if(message?.type!=='crux:app'||!['read','write','native-read','native-import'].includes(message.op))return;
try{const value={...message};if(value.bytes){value.bytes=Array.from(new Uint8Array(value.bytes));}const r=await fetch('/host',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(value)});const result=await r.json();if(!r.ok)throw Error(result.error);if(result.bytes)result.bytes=new Uint8Array(result.bytes).buffer;event.source.postMessage({type:'crux:app:result',id:message.id,result},event.origin);}catch(error){event.source.postMessage({type:'crux:app:result',id:message.id,error:error.message},event.origin);}});
</script>`;
const importedCounts = new Map();
const requests = [],
    failures = [],
    errors = [];
const server = createServer(async (req, res) => {
    try {
        const path = new URL(req.url, 'http://local').pathname;
        if (path === '/') {
            res.setHeader('Content-Type', 'text/html');
            res.end(host);
            return;
        }
        if (path === '/host' && req.method === 'POST') {
            let body = '';
            for await (const chunk of req) body += chunk;
            const value = JSON.parse(body);
            let result;
            if (value.op === 'read') result = { content, fingerprint: hash(content) };
            else if (value.op === 'write') {
                if (value.expected !== hash(content)) throw Error('Saved project changed. Reload before saving.');
                validateProject(JSON.parse(value.content));
                content = value.content;
                await writeFile(join(scratch, 'project.json'), content);
                result = { fingerprint: hash(content) };
            } else if (value.op === 'native-import') {
                const bytes = Buffer.from(value.bytes);
                const fingerprint = hash(bytes);
                importedCounts.set(fingerprint, (importedCounts.get(fingerprint) || 0) + 1);
                const path = `assets/${fingerprint}.bin`;
                await writeFile(join(scratch, path), bytes);
                result = { path, fingerprint };
            } else if (value.op === 'native-read') {
                if (!/^assets\/[a-f0-9]{64}\.bin$/.test(value.path)) throw Error('Invalid original path');
                result = { bytes: [...(await readFile(join(scratch, value.path)))] };
            } else throw Error('Unknown host operation');
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(result));
            return;
        }
        if (!path.startsWith('/runtime/')) throw Error('Not found');
        const file = resolve(root, '.' + path.slice('/runtime'.length));
        if (!file.startsWith(root + '/')) throw Error('Not found');
        const bytes = await readFile(file);
        res.setHeader(
            'Content-Type',
            {
                '.js': 'text/javascript',
                '.mjs': 'text/javascript',
                '.css': 'text/css',
                '.html': 'text/html',
                '.json': 'application/json',
                '.png': 'image/png',
                '.svg': 'image/svg+xml',
                '.wasm': 'application/wasm'
            }[extname(file)] || 'application/octet-stream'
        );
        res.end(bytes);
    } catch (error) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
    }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    page.on('console', (message) => {
        if (['error', 'warning'].includes(message.type())) console.error('BROWSER:', message.text());
    });
    page.on('pageerror', (error) => errors.push(error.stack));
    page.on('request', (req) => {
        if (!req.url().startsWith(origin) && !req.url().startsWith('blob:')) requests.push(req.url());
    });
    page.on('response', (response) => {
        if (response.status() >= 400) failures.push(response.url());
    });
    await page.route('**/*', (route) =>
        route.request().url().startsWith(origin) || route.request().url().startsWith('blob:')
            ? route.continue()
            : route.abort()
    );
    await page.goto(origin);
    const frame = page.frames().find((f) => f.url().includes('/runtime/index.html'));
    await frame.getByRole('status').filter({ hasText: 'Saved to Garden' }).waitFor({ timeout: 30000 });
    await frame.getByText('Cube', { exact: true }).click();
    const name = frame.getByText('Name', { exact: true }).locator('..').locator('input:not([readonly])');
    await name.fill('Garden Cube');
    await name.press('Enter');
    await frame.getByText('Position', { exact: true }).locator('..').locator('input').first().fill('2');
    await frame.getByText('Position', { exact: true }).locator('..').locator('input').first().press('Enter');
    const originalPng = await readFile(new URL('../test-suite/images/playwright.png', import.meta.url));
    const chooser = page.waitForEvent('filechooser');
    await frame.evaluate(() => editor.call('assets:upload:picker'));
    await (await chooser).setFiles({ name: 'sample.png', mimeType: 'image/png', buffer: originalPng });
    await frame.waitForFunction(() => editor.assets.list().some((a) => a.get('name') === 'sample.png'));
    await frame.evaluate(async () => {
        const asset = await editor.assets.createScript({ filename: 'spin.js' });
        editor.call('picker:codeeditor', asset.observer);
    });
    const codeDialog = frame.getByRole('dialog', { name: 'Edit asset code' });
    await codeDialog.waitFor();
    const codeInput = codeDialog.locator('textarea').first();
    await codeInput.focus();
    await codeInput.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
    await page.keyboard.insertText(
        "var Spin = pc.createScript('spin');\nSpin.prototype.initialize = function() { this.entity.setLocalScale(3, 3, 3); };\nSpin.prototype.update = function(dt) { this.entity.rotateLocal(0, 30 * dt, 0); };"
    );
    await codeDialog.getByRole('button', { name: 'Save code', exact: true }).click();
    await codeDialog
        .getByRole('status')
        .filter({ hasText: /^Saved code$/ })
        .waitFor();
    await codeDialog.getByRole('button', { name: 'Close code editor' }).click();
    await codeDialog.waitFor({ state: 'detached' });
    await frame.evaluate(() => {
        const cube = editor.entities.get('44444444-4444-4444-8444-444444444444');
        cube.set('components.script', {
            enabled: true,
            order: ['spin'],
            scripts: { spin: { enabled: true, attributes: {} } }
        });
    });
    await frame.getByRole('button', { name: 'Save project', exact: true }).click();
    await frame.getByRole('status').filter({ hasText: 'Saved to Garden' }).waitFor();
    assert.ok(JSON.parse(content).project);
    assert.deepEqual(
        await frame.evaluate(() => editor.entities.get('44444444-4444-4444-8444-444444444444').get('position')),
        [2, 0.5, 0]
    );
    await page.reload();
    const reopened = page.frames().find((f) => f.url().includes('/runtime/index.html'));
    await reopened.getByRole('status').filter({ hasText: 'Saved to Garden' }).waitFor();
    await reopened.getByText('Garden Cube', { exact: true }).click();
    assert.deepEqual(
        await reopened.evaluate(() => editor.entities.get('44444444-4444-4444-8444-444444444444').get('position')),
        [2, 0.5, 0]
    );
    await reopened.getByRole('button', { name: 'Launch scene', exact: true }).click();
    await reopened.getByRole('dialog', { name: 'Launch scene' }).waitFor();
    const launched = page.frames().find((f) => f.url().includes('/launch.html'));
    await launched.waitForFunction(() => document.querySelector('[role=status]').textContent === 'Running scene');
    const sceneState = await launched.evaluate(() => {
        const cube = pc.Application.getApplication().root.findByName('Garden Cube');
        return { scale: cube.getLocalScale().toArray(), script: !!cube.script.spin };
    });
    assert.deepEqual(sceneState, { scale: [3, 3, 3], script: true });
    await reopened.getByRole('button', { name: 'Close preview' }).click();
    const imported = await reopened.evaluate(() =>
        editor.assets
            .list()
            .find((a) => a.get('name') === 'sample.png')
            .json()
    );
    assert.equal(imported.type, 'texture');
    const fileRef = JSON.parse(content).project['file-' + imported.id].__cruxBinary;
    assert.deepEqual(await readFile(join(scratch, fileRef.path)), originalPng);
    assert.equal(
        importedCounts.get(hash(originalPng)),
        1,
        'Unchanged original image is imported only once across scene/code saves and reload.'
    );
    assert.deepEqual(errors, []);
    assert.deepEqual(requests, []);
    assert.deepEqual(failures, []);
    await page.screenshot({ path: join(scratch, 'editor.png') });
    console.log(
        JSON.stringify({ passed: true, scratch, externalRequests: requests, failedRequests: failures }, null, 2)
    );
} catch (error) {
    for (const page of browser.contexts().flatMap((c) => c.pages())) {
        console.error(
            (
                await page
                    .frames()
                    .find((f) => f.url().includes('/runtime/index.html'))
                    ?.locator('body')
                    .innerText()
            )?.slice(-5000)
        );
        await page.screenshot({ path: join(scratch, 'failure.png') });
    }
    console.error(JSON.stringify({ scratch, errors, requests, failures }, null, 2));
    console.error(error);
    process.exitCode = 1;
} finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
}
