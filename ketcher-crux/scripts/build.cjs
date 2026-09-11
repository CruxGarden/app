const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { parseAst } = require('rollup/parseAst');
const root = path.resolve(__dirname, '..');
const result = spawnSync(
  process.platform === 'win32' ? 'npm.cmd' : 'npm',
  ['run', 'build:upstream'],
  { cwd: root, stdio: 'inherit' },
);
if (result.status !== 0) process.exit(result.status || 1);
fs.copyFileSync(path.join(root, 'LICENSE'), path.join(root, 'runtime/LICENSE'));
require('./collect-licenses.cjs');
for (const name of fs.readdirSync(path.join(root, 'runtime'), { recursive: true })) {
  const file = path.join(root, 'runtime', name);
  if (name.endsWith('.map')) fs.unlinkSync(file);
  else if (/\.(js|css)$/.test(name)) {
    const text = fs.readFileSync(file, 'utf8');
    // Paper.js contains source-map comments inside generated-code template
    // literals. Remove only the final Vite footer, never embedded source text.
    const output = text
      .replace(/\n\/\/[#@] sourceMappingURL=[^\r\n]*\r?\n?$/, '')
      .replace(/\/\*[#@] sourceMappingURL=[^\r\n]*\*\/\s*$/, '');
    if (name.endsWith('.js')) parseAst(output);
    fs.writeFileSync(file, output);
  }
}
