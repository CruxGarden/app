import fs from 'node:fs';
import path from 'node:path';
// Carry the license files of bundled dependencies with the compiled editor.
export function gardenLicenses() {
  return {
    name: 'garden-bundled-licenses',
    generateBundle(_options, bundle) {
      const packages = new Map();
      for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk') continue;
        for (const id of Object.keys(output.modules)) {
          if (!id.includes('node_modules')) continue;
          let dir = path.dirname(id.split('?')[0]);
          while (dir !== path.dirname(dir)) {
            const file = path.join(dir, 'package.json');
            if (fs.existsSync(file)) {
              const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
              const key = pkg.name + '@' + pkg.version;
              if (!packages.has(key)) {
                const texts = fs
                  .readdirSync(dir)
                  .filter((n) => /^(licen[sc]e|copying|notice)(\.|$)/i.test(n))
                  .filter((n) => fs.statSync(path.join(dir, n)).isFile())
                  .map((n) => fs.readFileSync(path.join(dir, n), 'utf8'));
                packages.set(
                  key,
                  '## ' +
                    key +
                    '\nDeclared license: ' +
                    JSON.stringify(pkg.license) +
                    '\n\n' +
                    texts.join('\n\n'),
                );
              }
              break;
            }
            dir = path.dirname(dir);
          }
        }
      }
      this.emitFile({
        type: 'asset',
        fileName: 'THIRD_PARTY_NOTICES.txt',
        source:
          '# Bundled Mermaid Live Editor dependency notices\n\n' +
          [...packages]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([, v]) => v)
            .join('\n\n'),
      });
    },
  };
}
