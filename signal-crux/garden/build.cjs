// Build Signal as upstream's desktop build does (the player package with tsc,
// then the app with Vite's electron config: relative base, edit.html only) and
// ship it as runtime/ with the license and dependency notices.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const runtime = path.join(root, 'runtime');
const run = (args) => execFileSync('npm', args, { cwd: root, stdio: 'inherit' });
for (const pkg of ['packages/player', 'packages/dialog-hooks', 'packages/community'])
  run(['run', 'build', '-w', pkg]);
run(['run', 'build:electron', '-w', 'app']);
fs.rmSync(runtime, { recursive: true, force: true });
fs.cpSync(path.join(root, 'app/dist'), runtime, { recursive: true });
// The page is edit.html upstream; the Crux serves index.html
fs.renameSync(path.join(runtime, 'edit.html'), path.join(runtime, 'index.html'));
for (const file of ['auth.html', 'community.html', 'manifest.webmanifest', 'service-worker.js'])
  fs.rmSync(path.join(runtime, file), { force: true });
fs.copyFileSync(path.join(root, 'LICENSE'), path.join(runtime, 'LICENSE'));
const deps = Object.keys(require(path.join(root, 'app/package.json')).dependencies).filter(
  (d) => !d.startsWith('@signal-app/'),
);
const lines = [
  '# Notices',
  '',
  'signal — Copyright (c) ryohey — MIT (`LICENSE`).',
  '',
  'Sound: `A320U.sf2` and `A320U_drums.sf2` (Signal Factory Sound, from upstream’s public assets, MIT with the app).',
  '',
  'Bundled dependencies:',
  '',
];
for (const dep of deps) {
  let pkg;
  try {
    pkg = require(path.join(root, 'node_modules', dep, 'package.json'));
  } catch {
    continue;
  }
  lines.push(`- \`${dep}\` ${pkg.version} — ${pkg.license ?? 'see package'}`);
}
for (const dep of ['spessasynth_core', 'spessasynth_lib']) {
  const pkg = require(path.join(root, 'node_modules', dep, 'package.json'));
  lines.push(`- \`${dep}\` ${pkg.version} — ${pkg.license ?? 'see package'}`);
}
fs.mkdirSync(path.join(root, 'licenses'), { recursive: true });
fs.writeFileSync(path.join(root, 'licenses/NOTICES.md'), lines.join('\n') + '\n');
fs.cpSync(path.join(root, 'licenses'), path.join(runtime, 'licenses'), { recursive: true });
console.log('runtime/ built');
