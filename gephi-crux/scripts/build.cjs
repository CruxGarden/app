const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const result = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build:upstream"], {
  cwd: root,
  stdio: "inherit",
});
if (result.status !== 0) process.exit(result.status || 1);
fs.rmSync(path.join(root, "runtime"), { recursive: true, force: true });
fs.cpSync(path.join(root, "packages/gephi-lite/build"), path.join(root, "runtime"), { recursive: true });
fs.copyFileSync(path.join(root, "LICENSE.md"), path.join(root, "runtime/LICENSE.md"));
fs.copyFileSync(
  path.join(root, "packages/gephi-lite/src/assets/font/licenses.txt"),
  path.join(root, "runtime/FONT-LICENSE.txt"),
);
fs.cpSync(path.join(root, "node_modules/monaco-editor/min/vs"), path.join(root, "runtime/monaco/vs"), {
  recursive: true,
});
fs.copyFileSync(path.join(root, "node_modules/monaco-editor/LICENSE"), path.join(root, "runtime/MONACO-LICENSE.txt"));
require("./collect-licenses.cjs");

// Editable upstream source is packaged separately. Keep debug maps out of the
// runtime to avoid duplicating bundled dependency source in every new Crux.
for (const name of fs.readdirSync(path.join(root, "runtime"), { recursive: true })) {
  const file = path.join(root, "runtime", name);
  if (name.endsWith(".map")) fs.unlinkSync(file);
  else if (/\.(js|css)$/.test(name)) {
    const text = fs.readFileSync(file, "utf8");
    fs.writeFileSync(
      file,
      text.replace(/\/\/[#@] sourceMappingURL=.*$/gm, "").replace(/\/\*[#@] sourceMappingURL=[\s\S]*?\*\//g, ""),
    );
  }
}
