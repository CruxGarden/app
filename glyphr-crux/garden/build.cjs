// Build Glyphr Studio 2 as upstream does (vite, from src/) with a relative base
// so the app runs from a Crux's runtime/ folder, then ship it with its notices.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const runtime = path.join(root, 'runtime');
execFileSync('npx', ['vite', 'build', './src/', '--emptyOutDir', '--base=./'], {
	cwd: root,
	stdio: 'inherit',
});
fs.rmSync(runtime, { recursive: true, force: true });
fs.cpSync(path.join(root, 'dist'), runtime, { recursive: true });
fs.copyFileSync(path.join(root, 'LICENSE-gpl-3.0.txt'), path.join(runtime, 'LICENSE-gpl-3.0.txt'));
fs.cpSync(path.join(root, 'licenses'), path.join(runtime, 'licenses'), { recursive: true });
for (const file of fs.readdirSync(runtime, { recursive: true })) {
	if (String(file).endsWith('.map')) fs.unlinkSync(path.join(runtime, String(file)));
}
console.log('runtime/ built');
