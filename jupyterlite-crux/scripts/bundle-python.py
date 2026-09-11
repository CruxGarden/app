from pathlib import Path
import json,urllib.request,hashlib,concurrent.futures
root=Path(__file__).resolve().parent.parent
base='https://cdn.jsdelivr.net/pyodide/v314.0.4/full/'
out=root/'runtime/pyodide';out.mkdir(parents=True,exist_ok=True)
lock=json.loads((root/'vendor/pyodide-lock.json').read_text())
manifest=json.loads((root/'python-runtime-manifest.json').read_text())
packages=lock['packages'];needed=set()
comm=out/'comm-0.2.3-py3-none-any.whl'
packages['comm']={'name':'comm','version':'0.2.3','file_name':comm.name,'sha256':hashlib.sha256(comm.read_bytes()).hexdigest(),'depends':[],'imports':['comm'],'install_dir':'site','package_type':'package'}
def include(name):
 name=name.replace('_','-').lower()
 if name in needed:return
 needed.add(name)
 for dep in packages[name]['depends']:include(dep)
for name in ['numpy','matplotlib','ipython','comm','micropip']:include(name)
def fetch(item):
 filename,sha=item
 sha=manifest['files'].get(filename,sha)
 p=out/filename
 if not p.exists():p.write_bytes(urllib.request.urlopen(base+filename).read())
 if sha and hashlib.sha256(p.read_bytes()).hexdigest()!=sha:raise ValueError(filename+' checksum mismatch')
 print(filename,p.stat().st_size,flush=True)
 return filename
files=[(packages[n]['file_name'],packages[n]['sha256']) for n in sorted(needed)]
files.extend((n,None) for n in ['pyodide.mjs','pyodide.asm.mjs','pyodide.asm.wasm','python_stdlib.zip'])
with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:list(pool.map(fetch,files))
# Keep additional packages available explicitly from their original CDN.
for name,pkg in packages.items():
 if name not in needed:pkg['file_name']=base+pkg['file_name']
(out/'pyodide-lock.json').write_text(json.dumps(lock))
expected=manifest['files']['pyodide-lock.json']
if hashlib.sha256((out/'pyodide-lock.json').read_bytes()).hexdigest()!=expected:raise ValueError('Python lock changed unexpectedly')
print('Bundled',len(needed),'Python packages')
