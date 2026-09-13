import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
// Licenses of the Rust crates in the engine workspace, from cargo metadata (build machines only).
const root = fileURLToPath(new URL('../', import.meta.url));
try {
  const meta = JSON.parse(
    execFileSync('cargo', ['metadata', '--format-version', '1', '--manifest-path', `${root}engine/Cargo.toml`], {
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
    }),
  );
  const lines = meta.packages
    .filter((p) => !p.manifest_path.startsWith(`${root}engine/`))
    .map((p) => `${p.name}@${p.version}: ${p.license ?? 'See source'} (${p.repository ?? ''})`)
    .sort();
  writeFileSync(`${root}runtime/RUST_CRATES.txt`, `Rust crates compiled into the web-synth WebAssembly modules.\n\n${lines.join('\n')}\n`);
  console.log(`Recorded ${lines.length} Rust crate licenses.`);
} catch (error) {
  console.warn('cargo metadata unavailable; RUST_CRATES.txt not written:', error.message);
}
