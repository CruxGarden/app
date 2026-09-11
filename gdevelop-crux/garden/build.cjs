const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const editor = path.join(root, 'newIDE/app');
const commit = '7a7736a3a4ab5ec2f9ea7bde3479877467afa8c1';
const pins = {
  'libGD.js': '9f7a1e5b4e5202143974e07bef9e08451b9b5ecde0b7a34179c2ca85552f18e9',
  'libGD.wasm': 'f9e60018beb31b5c85c4287e9fd8d4ff51ad0a81dec80f79fc4bda07b94bd654',
};
function run(command, args, cwd = editor) {
  const result = spawnSync(command, args, {
    cwd, stdio: 'inherit',
    env: { ...process.env, GENERATE_SOURCEMAP: 'false',
      NODE_OPTIONS: process.env.NODE_OPTIONS || '--max-old-space-size=6144',
      NODE_PATH: path.join(editor, 'node_modules') },
  });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed (${result.status})`);
}
(async () => {
  if (process.argv.includes('--install')) {
    for (const cwd of [editor, path.join(root, 'GDJS')]) {
      run('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], cwd);
      run('npm', ['exec', '--no', '--', 'patch-package'], cwd);
    }
  }
  const engine = path.join(root, 'Binaries/embuild/GDevelop.js');
  fs.mkdirSync(engine, { recursive: true });
  for (const [name, sha256] of Object.entries(pins)) {
    const file = path.join(engine, name);
    if (!fs.existsSync(file)) {
      const response = await fetch(`https://s3.amazonaws.com/gdevelop-gdevelop.js/master/commit/${commit}/${name}`);
      if (!response.ok) throw new Error(`Pinned engine unavailable: ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (createHash('sha256').update(bytes).digest('hex') !== sha256) throw new Error(`Bad download: ${name}`);
      fs.writeFileSync(file, bytes);
    }
    if (createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== sha256) throw new Error(`Bad pinned engine: ${name}`);
  }
  run('npm', ['run', 'import-resources']);
  const metadata = { version: '5.6.282', gitHash: commit, versionWithHash: `5.6.282-${commit}` };
  fs.writeFileSync(path.join(editor, 'src/Version/VersionMetadata.js'), `// @flow\nmodule.exports = ${JSON.stringify(metadata)};\n`);
  for (const [name, hash] of Object.entries(pins)) {
    if (createHash('sha256').update(fs.readFileSync(path.join(editor, 'public', name))).digest('hex') !== hash)
      throw new Error(`Native bootstrap did not install ${name}`);
  }
  fs.copyFileSync(path.join(root, 'garden/preview-worker.js'), path.join(editor, 'public/service-worker.js'));
  run('npm', ['exec', '--no', '--', 'react-app-rewired', 'build']);
  run(process.execPath, ['scripts/check-build-output.js']);
  run(process.execPath, ['scripts/copy-GDJS-Runtime-to-build.js']);
  const runtime = path.join(root, 'runtime');
  fs.rmSync(runtime, { recursive: true, force: true });
  fs.cpSync(path.join(editor, 'build'), runtime, { recursive: true });
  console.log('Garden GDevelop native build complete. Integration acceptance is separate.');
})().catch(error => { console.error(error); process.exitCode = 1; });
