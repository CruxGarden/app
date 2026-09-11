const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const build = path.join(root, "runtime");
const packages = new Map();
for (const name of fs.readdirSync(build, { recursive: true }).filter((n) => n.endsWith(".map"))) {
  let map;
  try {
    map = JSON.parse(fs.readFileSync(path.join(build, name), "utf8"));
  } catch {
    continue;
  }
  for (const source of map.sources || []) {
    const pos = source.indexOf("node_modules/");
    if (pos < 0) continue;
    let dir = path.dirname(path.resolve(root, source.slice(pos)));
    while (dir.startsWith(path.join(root, "node_modules"))) {
      const file = path.join(dir, "package.json");
      if (fs.existsSync(file)) {
        const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
        if (pkg.name) packages.set(dir, pkg);
        break;
      }
      dir = path.dirname(dir);
    }
  }
}
let text = "Dependency notices for the Gephi Lite browser build.\n\n";
for (const [dir, pkg] of [...packages].sort((a, b) => a[1].name.localeCompare(b[1].name))) {
  text += `\n=== ${pkg.name}@${pkg.version} (${typeof pkg.license === "string" ? pkg.license : JSON.stringify(pkg.license || pkg.licenses || "See source")}) ===\n`;
  for (const file of fs.readdirSync(dir).filter((n) => /^(license|licence|copying|notice)/i.test(n))) {
    const p = path.join(dir, file);
    if (fs.statSync(p).isFile()) text += `\n${file}\n${fs.readFileSync(p, "utf8")}\n`;
  }
}
fs.writeFileSync(path.join(build, "THIRD_PARTY_NOTICES.txt"), text);
console.log(`Included notices for ${packages.size} bundled dependency packages.`);
