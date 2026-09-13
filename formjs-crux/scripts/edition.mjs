// The public edition of a form Crux: the form-js viewer with the saved schema,
// no framework, no dependencies. Visitors fill the form; each submission is one
// entry in the Crux Store (key response:<time>-<id>), private to the visitor
// and the author (the store's protected mode; a write needs the visitor's
// sign-in). `npm run build` renders dist/ for publishing.
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const escape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const RESPONSE_MODE = 'protected';

export function readForm(folder) {
  const doc = JSON.parse(readFileSync(join(folder, 'data/project.json'), 'utf8'));
  if (!doc || doc.app !== 'formjs') throw new Error('This Crux holds no form.');
  const project = doc.project || { name: 'Form', schema: { type: 'default', components: [] } };
  return { name: project.name || 'Form', schema: project.schema };
}

export const VIEWER_JS = `(function(){
var win=window;var enc=encodeURIComponent;
function storeFor(){
  var pub=win.crux&&win.crux.publish;
  if(pub&&pub.cruxId&&pub.apiBase){var base=pub.apiBase.replace(/\\/$/,'');return {via:'api',set:function(k,v,m){return fetch(base+'/store/'+enc(pub.cruxId)+'/'+enc(k),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({value:v,mode:m})}).then(function(r){if(r.status===401)throw new Error('Sign in to send your answers.');if(!r.ok)throw new Error('Could not send (HTTP '+r.status+').')})}}}
  if(win.crux&&win.crux.store)return {via:'sdk',set:function(k,v,m){return win.crux.store.set(k,v,{mode:m})}};
  if(win.parent&&win.parent!==win)return {via:'host',set:function(k,v,m){win.parent.postMessage({type:'crux:store:set',key:k,value:v,mode:m},'*');return Promise.resolve()}};
  return null;
}
var Viewer=win.FormViewer.Form||win.FormViewer;var form=new Viewer({container:document.getElementById('form')});
var note=document.getElementById('note');
document.getElementById('submit').onclick=function(){form.submit()};
fetch('form.json').then(function(r){return r.json()}).then(function(schema){return form.importSchema(schema,{})}).then(function(){
  var store=storeFor();
  form.on('submit',function(event){
    if(Object.keys(event.errors||{}).length){note.textContent='Please fix the marked fields.';return}
    if(!store){note.textContent='This form is not collecting answers here.';return}
    var key='response:'+Date.now()+'-'+Math.random().toString(36).slice(2,8);
    note.textContent='Sending…';
    store.set(key,{submittedAt:new Date().toISOString(),data:event.data},'${RESPONSE_MODE}').then(function(){note.textContent='Thank you, your answers were sent.';form.reset&&form.reset()},function(e){note.textContent=e&&e.message||'Could not send.'});
  });
}).catch(function(e){note.textContent='This form could not load: '+(e&&e.message||e)});
})();`;

export function buildEdition(folder, outDir = join(folder, 'dist')) {
  const { name, schema } = readForm(folder);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(join(outDir, 'vendor', 'flatpickr'), { recursive: true });
  for (const file of ['form-viewer.umd.js', 'form-js.css', 'LICENSE']) copyFileSync(join(folder, 'vendor', file), join(outDir, 'vendor', file));
  copyFileSync(join(folder, 'vendor/flatpickr/light.css'), join(outDir, 'vendor/flatpickr/light.css'));
  writeFileSync(join(outDir, 'form.json'), JSON.stringify(schema));
  writeFileSync(join(outDir, 'viewer.js'), VIEWER_JS);
  writeFileSync(
    join(outDir, 'index.html'),
    `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escape(name)}</title><link rel="stylesheet" href="vendor/form-js.css"/><link rel="stylesheet" href="vendor/flatpickr/light.css"/><style>body{margin:0;font:16px/1.5 system-ui,sans-serif;background:#f7f7f5;color:#1f2328}main{max-width:720px;margin:32px auto;padding:0 16px}h1{font-size:1.6rem}#form{background:#fff;padding:16px 24px;border:1px solid #d9d9d4;border-radius:8px}.actions{margin-top:12px}#submit{font:inherit;padding:8px 20px;border:1px solid #2f6f4e;border-radius:4px;background:#2f6f4e;color:#fff;cursor:pointer}#note{min-height:1.5em;margin-top:12px;color:#2f6f4e}footer{margin-top:24px;font-size:.8rem;color:#6b6f66}</style></head><body><main><h1>${escape(name)}</h1><div id="form"></div><p class="actions"><button type="button" id="submit">Submit</button></p><p id="note" role="status"></p><footer>Grown in Crux Garden. Form by form-js (bpmn.io).</footer></main><script src="vendor/form-viewer.umd.js"></script><script src="viewer.js"></script></body></html>`,
  );
  return { name, fields: (schema.components || []).filter((c) => c.key).length };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const built = buildEdition(process.cwd());
  console.log(`Public edition: ${built.name}, ${built.fields} field(s).`);
}
