const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const runtime = path.join(root, 'runtime');
execFileSync(process.execPath, ['build.js', '--target=web', '--analyze'], {
  cwd: root,
  stdio: 'inherit',
});
fs.rmSync(runtime, { recursive: true, force: true });
fs.mkdirSync(runtime);
for (const dir of ['assets', 'css', 'font', 'icons', 'lib', 'garden'])
  fs.cpSync(path.join(root, dir), path.join(runtime, dir), { recursive: true });
for (const name of fs.readdirSync(path.join(runtime, 'garden')))
  if (!['main.js', 'model.js', 'bridge.js', 'storage.js'].includes(name))
    fs.unlinkSync(path.join(runtime, 'garden', name));
fs.mkdirSync(path.join(runtime, 'dist'));
fs.copyFileSync(path.join(root, 'dist/bundle.js'), path.join(runtime, 'dist/bundle.js'));
for (const name of ['favicon.png', 'icon_full.png', 'LICENSE.MD', 'UPSTREAM.md'])
  if (fs.existsSync(path.join(root, name)))
    fs.copyFileSync(path.join(root, name), path.join(runtime, name));
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
html = html.replace('<script>', '<script src="garden/storage.js"></script><script>');
html = html.replace('src="dist/bundle.js"', 'src="garden/main.js"');
html = html.replace(/<script type="module">[\s\S]*?<\/script>/, '');
html = html.replace(/<link rel="manifest"[^>]*>/, '');
html = html.replace(
  '</head>',
  '<style>body{height:calc(100dvh - 34px)!important}#web_download_button{display:none!important}</style></head>',
);
fs.writeFileSync(path.join(runtime, 'index.html'), html);
const meta = JSON.parse(fs.readFileSync(path.join(root, 'dist/esbuild-metafile.json'), 'utf8'));
const packages = new Map();
for (const name of Object.keys(meta.inputs)) {
  const i = name.indexOf('node_modules/');
  if (i < 0) continue;
  let dir = path.dirname(path.join(root, name.slice(i)));
  while (dir.startsWith(path.join(root, 'node_modules'))) {
    const file = path.join(dir, 'package.json');
    if (fs.existsSync(file)) {
      const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
      packages.set(dir, pkg);
      break;
    }
    dir = path.dirname(dir);
  }
}
let notices =
  'Dependency notices for the Blockbench web build. Native vendored library headers and fonts retain their notices in the source.\n';
for (const [dir, pkg] of packages) {
  notices += `\n=== ${pkg.name}@${pkg.version} (${JSON.stringify(pkg.license || pkg.licenses || 'See source')}) ===\n`;
  for (const name of fs
    .readdirSync(dir)
    .filter((n) => /^(license|licence|copying|notice)/i.test(n)))
    if (fs.statSync(path.join(dir, name)).isFile())
      notices += fs.readFileSync(path.join(dir, name), 'utf8') + '\n';
}
fs.writeFileSync(path.join(runtime, 'THIRD_PARTY_NOTICES.txt'), notices);
console.log(`Included notices for ${packages.size} bundled dependency packages.`);
