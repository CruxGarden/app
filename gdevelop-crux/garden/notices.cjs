const fs = require('node:fs');
const path = require('node:path');
module.exports = class GardenNotices {
  apply(compiler) {
    compiler.hooks.done.tap('GardenNotices', stats => {
      const packages = new Map();
      const visited = new Set();
      const visit = module => {
        if (visited.has(module)) return;
        visited.add(module);
        if (module.resource?.includes('/node_modules/')) {
          let directory = path.dirname(module.resource.split('?')[0]);
          while (directory.includes('/node_modules/')) {
            const manifest = path.join(directory, 'package.json');
            if (fs.existsSync(manifest)) {
              const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'));
              if (pkg.name) packages.set(pkg.name + '@' + pkg.version, { directory, pkg });
              break;
            }
            directory = path.dirname(directory);
          }
        }
        if (module.modules) for (const child of module.modules) visit(child);
      };
      const compilation = c => {
        for (const module of c.modules) visit(module);
        for (const child of c.children) compilation(child);
      };
      compilation(stats.compilation);
      const notices = [];
      const inventory = [];
      for (const [name, { directory, pkg }] of [...packages].sort(([a], [b]) => a.localeCompare(b))) {
        if (name.startsWith('@esotericsoftware/')) throw new Error('Optional Spine runtime entered the editor bundle.');
        const files = fs.readdirSync(directory).filter(name => /^(licen[sc]e|copying|notice)([.-]|$)/i.test(name) && fs.statSync(path.join(directory, name)).isFile());
        inventory.push({ name, license: pkg.license || null, notices: files });
        notices.push(name + '\nDeclared license: ' + JSON.stringify(pkg.license || null) + '\n' + files.map(file => fs.readFileSync(path.join(directory, file), 'utf8')).join('\n'));
      }
      fs.mkdirSync(compiler.options.output.path, { recursive: true });
      fs.writeFileSync(path.join(compiler.options.output.path, 'THIRD_PARTY_NOTICES.txt'), notices.join('\n\n----------------\n\n'));
      fs.writeFileSync(path.join(compiler.options.output.path, 'bundled-packages.json'), JSON.stringify(inventory, null, 2));
    });
  }
};
