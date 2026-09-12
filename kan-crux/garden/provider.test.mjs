import { createServer } from 'node:http';
import { preview } from 'vite';
import assert from 'node:assert/strict';
const { chromium } = await import(
  new URL('../../electron/node_modules/playwright/index.mjs', import.meta.url)
);
const runtime = await preview({ preview: { host: '127.0.0.1', port: 4179, strictPort: true } });
const html = `<!doctype html><html><body style="margin:0"><iframe title="Kan" style="width:100vw;height:100vh;border:0" src="http://127.0.0.1:4179"></iframe><script>
const frame=document.querySelector('iframe');
window.store={content:JSON.stringify({version:1,app:'kan',project:null}),fingerprint:null,assets:new Map(),dirty:false,writeCount:0,imports:0};
const requests=new Map();
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(n=>n.toString(16).padStart(2,'0')).join('');
window.flush=()=>new Promise((resolve,reject)=>{const id=crypto.randomUUID();const timeout=setTimeout(()=>{requests.delete(id);reject(Error('Flush timed out'));},8000);requests.set(id,result=>{clearTimeout(timeout);resolve(result);});frame.contentWindow.postMessage({type:'crux:app:flush',id},'http://127.0.0.1:4179');});
window.command=command=>new Promise((resolve,reject)=>{const id=crypto.randomUUID();const timeout=setTimeout(()=>{requests.delete(id);reject(Error('Command timed out'));},8000);requests.set(id,result=>{clearTimeout(timeout);resolve(result);});frame.contentWindow.postMessage({type:'crux:app:command',id,command},'http://127.0.0.1:4179');});
window.reopen=()=>{frame.src='http://127.0.0.1:4179/?reload='+Date.now();};
window.snapshot=()=>({...store,assets:[...store.assets].map(([key,value])=>[key,Array.from(new Uint8Array(value))])});
window.restore=value=>{store={...value,assets:new Map(value.assets.map(([key,value])=>[key,new Uint8Array(value).buffer]))};reopen();};
addEventListener('message',async event=>{
 if(event.source!==frame.contentWindow||event.origin!=='http://127.0.0.1:4179'||event.data?.type!=='crux:app') return;
 const request=event.data;
 if(request.op==='dirty'){store.dirty=request.dirty;return;}
 if(request.op==='tool-result'){requests.get(request.commandId)?.({error:request.error??null,result:request.result});requests.delete(request.commandId);return;}
 if(request.op==='flushed'){requests.get(request.flushId)?.({error:request.error??null});requests.delete(request.flushId);return;}
 let result,error;
 try{
  switch(request.op){
   case 'read':result={content:store.content,fingerprint:store.fingerprint};break;
   case 'write':if(request.expected!==store.fingerprint) throw Error('The project changed elsewhere. Reload the saved project.');store.content=request.content;store.fingerprint=await hash(new TextEncoder().encode(store.content));store.writeCount++;result={fingerprint:store.fingerprint};break;
   case 'native-import':{const fingerprint=await hash(request.bytes);const path='assets/'+fingerprint+'.bin';store.assets.set(path,request.bytes);store.imports++;result={path,fingerprint};break;}
   case 'native-read':if(!store.assets.has(request.path)) throw Error('Missing original');result={bytes:store.assets.get(request.path)};break;
   default:throw Error('Unknown provider request '+request.op);
  }
 }catch(reason){error=reason.message;}
 frame.contentWindow.postMessage({type:'crux:app:result',id:request.id,result,error},'http://127.0.0.1:4179');
});
</script></body></html>`;
const server = createServer((req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.end(html);
});
await new Promise((resolve) => server.listen(4180, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true });
let page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', (error) => {
  errors.push(error.message);
  console.log('PAGE ERROR', error.message);
});
const flush = () => page.evaluate(() => window.flush());
let app = page.frameLocator('iframe');
try {
  await page.goto('http://127.0.0.1:4180');
  await app.getByRole('button', { name: 'New', exact: true }).click();
  await app.getByPlaceholder('Name', { exact: true }).fill('Portable board');
  const blocked = await flush();
  assert.match(blocked.error, /Finish or cancel/);
  assert.equal(await page.evaluate(() => store.dirty), true);
  await app.getByRole('button', { name: 'Create board', exact: true }).click();
  await app.getByRole('button', { name: 'New list', exact: true }).click();
  await app.getByPlaceholder('List name').fill('Ideas');
  await app.getByRole('button', { name: 'Create list', exact: true }).click();
  await app.getByRole('button', { name: 'Add card', exact: true }).click();
  await app.getByPlaceholder('Card title').fill('Portable card');
  assert.match((await flush()).error, /Finish or cancel/);
  await app.getByRole('button', { name: 'Create card', exact: true }).click();
  await app.getByText('Portable card', { exact: true }).click();
  await app.locator('#title').fill('Title committed by immediate flush');
  assert.equal((await flush()).error, null);
  await app.locator('#title').fill('');
  assert.match((await flush()).error,/Correct the failed edit/);
  assert.equal(await page.evaluate(() => store.dirty),true);
  await app.locator('#title').fill('Title committed by immediate flush');
  assert.equal((await flush()).error,null);
  await app.getByRole('button',{name:'Add checklist',exact:true}).click();
  await app.getByPlaceholder('Checklist name').fill('Immediate checklist');
  await app.getByRole('button',{name:'Create checklist',exact:true}).click();
  await app.locator('[role=dialog]').waitFor({state:'hidden'});
  await app.getByRole('button',{name:'Add checklist item',exact:true}).click();
  const checklistDraft=app.locator('[contenteditable=true][placeholder="Add an item..."]');
  await checklistDraft.click();await checklistDraft.fill('Save this item without pressing Enter');
  assert.equal((await flush()).error,null);
  await app.getByText('Save this item without pressing Enter',{exact:true}).first().waitFor();
  await app.locator('body').evaluate(()=>{localStorage.theme='dark';localStorage.setItem('fontSize','large');});
  assert.equal((await flush()).error,null);
  const original = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jY1kAAAAASUVORK5CYII=',
    'base64',
  );
  await app
    .locator('#attachment-upload')
    .setInputFiles({ name: 'garden-pixel.png', mimeType: 'image/png', buffer: original });
  await app.locator('img[alt="garden-pixel.png"]').first().waitFor();
  assert.equal((await flush()).error, null);
  const inspection = await page.evaluate(() => window.command({ op: 'inspect' }));
  assert.equal(inspection.error, null);
  const list = inspection.result.board.lists[0];
  const currentCard = list.cards[0];
  const created = await page.evaluate(
    (listPublicId) => window.command({ op: 'create-card', listPublicId, title: 'Agent follow-up' }),
    list.publicId,
  );
  assert.equal(created.error, null);
  const renamed = await page.evaluate(
    (cardPublicId) =>
      window.command({ op: 'update-card', cardPublicId, title: 'Agent renamed card' }),
    currentCard.publicId,
  );
  assert.equal(renamed.error, null);
  assert.equal(await app.locator('#title').inputValue(), 'Agent renamed card');
  const moved = await page.evaluate(
    (ids) =>
      window.command({ op: 'move-card', cardPublicId: ids.card, listPublicId: ids.list, index: 1 }),
    { card: currentCard.publicId, list: list.publicId },
  );
  assert.equal(moved.error, null);
  const invalid = await page.evaluate(
    (cardPublicId) => window.command({ op: 'update-card', cardPublicId, title: 'No', extra: true }),
    currentCard.publicId,
  );
  assert(invalid.error);
  const snapshot = await page.evaluate(() => window.snapshot());
  assert(snapshot.assets.some(([, bytes]) => Buffer.from(bytes).equals(original)));
  const comment = app.locator('[data-garden-draft=comment] [contenteditable=true]');
  await comment.fill('Do not lose this unsent comment');
  assert.match((await flush()).error, /draft comment/);
  assert.match(
    (await page.evaluate(() => window.command({ op: 'inspect' }))).error,
    /draft comment/,
  );
  await app.getByRole('link', { name: 'Kan · Boards', exact: true }).click();
  await comment.filter({ hasText: 'Do not lose this unsent comment' }).waitFor();
  assert.equal(await page.evaluate(() => store.dirty), true);
  await app.getByRole('button', { name: 'Submit comment', exact: true }).click();
  await app.getByText('Do not lose this unsent comment', { exact: true }).waitFor();
  assert.equal((await flush()).error, null);
  await page.evaluate(() => (store.fingerprint = 'external-change'));
  await app.locator('#title').fill('Retain conflict draft');
  assert.match((await flush()).error, /changed elsewhere/);
  assert.equal(await app.locator('#title').inputValue(), 'Retain conflict draft');
  assert.equal(await page.evaluate(() => store.dirty), true);
  await app.getByRole('button', { name: 'Reload saved project', exact: true }).click();
  await app.getByRole('button', { name: 'Keep editing', exact: true }).click();
  assert.equal(await app.locator('#title').inputValue(), 'Retain conflict draft');
  await app.getByRole('button', { name: 'Reload saved project', exact: true }).click();
  await app.getByRole('button', { name: 'Discard and reload', exact: true }).click();
  await app.locator('#title').waitFor();
  assert.equal(await app.locator('#title').inputValue(), 'Agent renamed card');
  assert.equal((await flush()).error, null);
  const saved = await page.evaluate(() => window.snapshot());
  const imports = saved.imports;
  await app.locator('#title').fill('Text edit reuses original');
  assert.equal((await flush()).error, null);
  const after = await page.evaluate(() => window.snapshot());
  const binaryKey = Object.entries(JSON.parse(after.content).project).find(([key]) =>
    key.startsWith('file-'),
  )[1].__cruxBinary.path;
  assert.equal(after.assets.filter(([path]) => path === binaryKey).length, 1);
  assert(
    after.imports - imports <= 2,
    'Only board/state records should be imported for a text edit',
  );
  await page.close();
  page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('http://127.0.0.1:4180');
  await page.evaluate((saved) => window.restore(saved), after);
  app = page.frameLocator('iframe');
  await app.locator('#title').waitFor();
  assert.equal(await app.locator('#title').inputValue(), 'Text edit reuses original');
  assert.equal(await app.locator('html').evaluate(element=>element.classList.contains('dark')),true);
  assert.equal(await app.locator('html').evaluate(element=>element.style.fontSize),'18px');
  const image = app.locator('img[alt="garden-pixel.png"]').first();
  await image.waitFor();
  assert.deepEqual(
    await image.evaluate(async (element) =>
      Array.from(new Uint8Array(await (await fetch(element.src)).arrayBuffer())),
    ),
    [...original],
  );
  await app.getByText('Do not lose this unsent comment', { exact: true }).waitFor();
  assert.equal((await flush()).error, null);
  await page.screenshot({ path: '/private/tmp/crux-kan-provider.png' });
  assert.deepEqual(errors, []);
  console.log(
    'PASS embedded save, original attachment, drafts, navigation guard, conflict/discard and fresh-page restoration, scoped agent commands',
  );
} catch (error) {
  console.log(
    'BODY',
    await app
      .locator('body')
      .innerText()
      .catch(() => ''),
  );
  await page.screenshot({ path: '/private/tmp/crux-kan-provider-failure.png' });
  throw error;
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  await new Promise((resolve) => runtime.httpServer.close(resolve));
}
