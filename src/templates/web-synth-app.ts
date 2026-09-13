import type { TemplateDefinition } from './index';
import { LAYOUT_WORKSHOP } from './index';
// The full web-synth app travels with the Crux (GPL-2.0): TypeScript/Svelte
// source, the Rust engine workspace, the pinned lockfiles, the Garden bridge,
// notices and the built runtime. Dependency folders, build caches and the
// hosted backend/deployment configuration stay out.
const assets = import.meta.glob(
  [
    '../../web-synth-crux/{package.json,yarn.lock,index.html,fm.html,vite.config.mts,vite.config.headless.mts,tsconfig.json,svelte.config.mjs,eslint.config.mjs,.prettierrc,index.d.ts,svg.d.ts,LICENSE,UPSTREAM.md,README.md,Justfile,.cruxignore,rustfmt.toml}',
    '../../web-synth-crux/src/**/*',
    '../../web-synth-crux/engine/**/*',
    '../../web-synth-crux/public/**/*',
    '../../web-synth-crux/garden/**/*',
    '../../web-synth-crux/runtime/**/*',
    '!../../web-synth-crux/**/node_modules/**',
    '!../../web-synth-crux/**/.git/**',
    '!../../web-synth-crux/engine/target/**',
    '!../../web-synth-crux/engine/build/**',
    '!../../web-synth-crux/**/*.css',
    '!../../web-synth-crux/**/*.map',
    '!../../web-synth-crux/**/.DS_Store',
  ],
  { query: '?url', import: 'default', eager: true },
) as Record<string, string>;
const styles = import.meta.glob(
  [
    '../../web-synth-crux/src/**/*.css',
    '../../web-synth-crux/public/**/*.css',
    '../../web-synth-crux/runtime/**/*.css',
    '!../../web-synth-crux/**/node_modules/**',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const template: TemplateDefinition = {
  files: [
    ...Object.entries(styles).map(([path, content]) => ({
      path: path.replace('../../web-synth-crux/', ''),
      content,
    })),
    ...Object.entries(assets).map(([path, content]) => ({
      path: path.replace('../../web-synth-crux/', ''),
      content,
      encoding: 'asset-url' as const,
    })),
    {
      path: 'data/project.json',
      content: JSON.stringify({ version: 1, app: 'web-synth', project: null }),
    },
  ],
  layout: LAYOUT_WORKSHOP,
  meta: { settings: { entryFile: 'runtime/index.html' } },
  greeting:
    'Make sound with web-synth: a modular synth and DAW in the browser. Add modules from the + menu, patch them in the graph editor, play the MIDI keyboard, sequence notes and shape the mix. Garden saves the whole composition with every change.',
  context:
    'Actual web-synth, pinned upstream d9e7026. The composition is exactly what web-synth keeps in its own browser storage, saved as data/project.json after each change; reopening restores it. App Tools inspect the composition (modules, connections, tempo), set the tempo, add a module and rename one; they never start audio. Composition sharing, presets from the hosted backend and Faust/Soul code compilation need services that are not bundled and fail clearly. Samples from a chosen folder or the remote library are not yet portable with the Crux. Source, engine, lockfiles and notices travel with the Crux; rebuilding the WebAssembly engine needs nightly Rust and wasm-bindgen 0.2.92, then `yarn build:garden` rebuilds runtime/. See UPSTREAM.md.',
};
export default template;
