from pathlib import Path
import json
root=Path(__file__).resolve().parent.parent
p=root/'runtime/jupyter-lite.json';j=json.loads(p.read_text());c=j['jupyter-config-data']
c.update({'enableMemoryStorage':True,'contentsStorageDrivers':['memoryStorageDriver'],'settingsStorageDrivers':['memoryStorageDriver'],'workspacesStorageDrivers':['memoryStorageDriver'],'exposeAppInBrowser':True})
k=c['litePluginSettings']['@jupyterlite/pyodide-kernel-extension:kernel'];k['pyodideUrl']='./pyodide/pyodide.mjs';k['loadPyodideOptions']={'packages':['numpy','matplotlib','ipython','comm','micropip']}
k.pop('disablePyPIFallback',None)
p.write_text(json.dumps(j,indent=2)+'\n')

p=root/'runtime/lab/index.html'
s=p.read_text()
needle="        await import("
if "../garden/boot.js" not in s:s=s.replace(needle,"        await import('../garden/boot.js');\n"+needle,1)
p.write_text(s)
import shutil
shutil.copytree(root/'garden',root/'runtime/garden',dirs_exist_ok=True)

shutil.copy2(root/'vendor/PYODIDE-LICENSE',root/'runtime/pyodide/LICENSE')
shutil.copy2(root/'vendor/CPYTHON-LICENSE',root/'runtime/pyodide/CPYTHON-LICENSE')
