import { expect, it } from 'vitest';
import { loadTemplate } from './index';
it('packages the native JupyterLite app, local Python runtime and editable build source', async () => {
  const t = (await loadTemplate('jupyterlite-app'))!;
  const paths = new Set(t.files.map((f) => f.path));
  for (const p of [
    'runtime/lab/index.html',
    'runtime/pyodide/pyodide.mjs',
    'runtime/pyodide/pyodide.asm.wasm',
    'runtime/pyodide/python_stdlib.zip',
    'runtime/build/third-party-licenses.json',
    'garden/boot.js',
    'scripts/build.py',
    'scripts/bundle-python.py',
    'vendor/PYODIDE-LICENSE',
    'vendor/CPYTHON-LICENSE',
    'requirements.txt',
    'python-runtime-manifest.json',
    'LICENSE',
    '.cruxignore',
    'data/project.json',
  ])
    expect(paths.has(p), p).toBe(true);
}, 30000);
