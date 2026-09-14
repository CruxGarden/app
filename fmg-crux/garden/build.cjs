// Build the Fantasy Map Generator as upstream's desktop build does (Vite, mode
// electron: relative base, no analytics or PWA tags) and ship it as runtime/
// with the license and dependency notices.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const runtime = path.join(root, 'runtime');
// Vite 8 bundles with rolldown, whose native binding is a platform-specific optional package that a
// lockfile made elsewhere may not list: make sure this machine's is present.
const binding = `@rolldown/binding-${process.platform}-${process.arch}${process.platform === 'linux' ? '-gnu' : ''}`;
const rolldownVersion = require(path.join(root, 'node_modules/rolldown/package.json')).version;
try {
  require.resolve(`${binding}/package.json`, { paths: [root] });
} catch {
  execFileSync(
    'npm',
    ['install', '--no-save', '--ignore-scripts', `${binding}@${rolldownVersion}`],
    { cwd: root, stdio: 'inherit' },
  );
}
execFileSync('npx', ['vite', 'build', '--mode', 'electron'], { cwd: root, stdio: 'inherit' });
fs.rmSync(runtime, { recursive: true, force: true });
fs.cpSync(path.join(root, 'dist-electron/renderer'), runtime, { recursive: true });
for (const file of ['sw.js', 'manifest.webmanifest'])
  fs.rmSync(path.join(runtime, file), { force: true });
// The Garden bridge is a plain module loaded after upstream's bundle, never bundled with it
// (a top-level await inside the shared chunk broke upstream's boot order).
fs.mkdirSync(path.join(runtime, 'garden'), { recursive: true });
for (const file of ['bridge.js', 'document.js'])
  fs.copyFileSync(path.join(__dirname, file), path.join(runtime, 'garden', file));
const indexPath = path.join(runtime, 'index.html');
fs.writeFileSync(
  indexPath,
  fs
    .readFileSync(indexPath, 'utf8')
    .replace(
      '</body>',
      '    <!-- Crux Garden: the Garden bridge (inert outside the Workshop) -->\n    <script type="module" src="./garden/bridge.js"></script>\n  </body>',
    ),
);
fs.copyFileSync(path.join(root, 'LICENSE'), path.join(runtime, 'LICENSE'));
// Dependency notices from the installed packages
const deps = Object.keys(require(path.join(root, 'package.json')).dependencies);
const lines = [
  '# Notices',
  '',
  'Fantasy Map Generator — Copyright 2017-2024 Max Haniyeu (Azgaar) — MIT (`LICENSE`).',
  '',
  'Bundled dependencies:',
  '',
];
for (const dep of deps) {
  const pkg = require(path.join(root, 'node_modules', dep, 'package.json'));
  lines.push(`- \`${dep}\` ${pkg.version} — ${pkg.license ?? 'see package'}`);
}
lines.push(
  '',
  'Libraries in `libs/` (jQuery, jQuery UI, D3, Delaunator, FlatQueue, JSZip, Three.js and the rest) carry their own headers; see upstream.',
);
fs.mkdirSync(path.join(root, 'licenses'), { recursive: true });
fs.writeFileSync(path.join(root, 'licenses/NOTICES.md'), lines.join('\n') + '\n');
fs.cpSync(path.join(root, 'licenses'), path.join(runtime, 'licenses'), { recursive: true });
console.log('runtime/ built');
