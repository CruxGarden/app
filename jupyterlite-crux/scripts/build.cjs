const { spawnSync } = require('node:child_process');
const { join } = require('node:path');
const result = spawnSync(
  process.platform === 'win32' ? 'python' : 'python3',
  [join(__dirname, 'build.py')],
  { stdio: 'inherit' },
);
if (result.error) {
  console.error('Building JupyterLite needs Python 3.10 or newer on PATH.');
  console.error(result.error.message);
}
process.exit(result.status ?? 1);
