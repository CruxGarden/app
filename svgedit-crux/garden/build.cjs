const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const root = path.resolve(__dirname, '..')
const runtime = path.join(root, 'runtime')
execFileSync('npm', ['run', 'build:upstream'], { cwd: root, stdio: 'inherit' })
fs.rmSync(runtime, { recursive: true, force: true })
fs.cpSync(path.join(root, 'dist/editor'), runtime, { recursive: true })
fs.rmSync(path.join(runtime, 'tests'), { recursive: true, force: true })
fs.mkdirSync(path.join(runtime, 'garden'), { recursive: true })
for (const file of ['main.js', 'bridge.js', 'model.js']) fs.copyFileSync(path.join(__dirname, file), path.join(runtime, 'garden', file))
for (const file of ['LICENSE-MIT.txt', 'licenseInfo.json']) fs.copyFileSync(path.join(root, file), path.join(runtime, file))
fs.writeFileSync(path.join(runtime, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SVG-Edit</title><link rel="stylesheet" href="./svgedit.css"><style>html,body{margin:0;overflow:hidden}#container{width:100%;height:calc(100dvh - 34px)}</style></head><body><div id="container"></div><script type="module" src="./garden/main.js"></script></body></html>`)
execFileSync(process.execPath, [path.join(__dirname, 'collect-licenses.cjs')], { cwd: root, stdio: 'inherit' })
const modules = path.join(runtime, 'extensions/node_modules')
if (fs.existsSync(modules)) fs.renameSync(modules, path.join(runtime, 'extensions/vendor'))
for (const file of fs.readdirSync(runtime, { recursive: true })) {
  const full = path.join(runtime, file)
  if (file.endsWith('.map')) fs.unlinkSync(full)
  else if (file.endsWith('.js') || file.endsWith('.css')) {
    const text = fs.readFileSync(full, 'utf8').replaceAll('../node_modules/', '../vendor/').replace(/\n?\/\/# sourceMappingURL=[^\n]*\s*$/, '').replace(/\n?\/\*# sourceMappingURL=[^*]*\*\/\s*$/, '')
    fs.writeFileSync(full, text)
  }
}
