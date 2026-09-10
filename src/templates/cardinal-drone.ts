import type { TemplateDefinition, TemplateFile } from './index';
import { LAYOUT_WORKSHOP } from './index';
const sources = import.meta.glob(
  ['../../cardinal-crux/{index.html,style.css,*.js,README.md,LICENSE,music/*,engine/*,licenses/*}'],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const runtime = import.meta.glob('../../cardinal-crux/runtime/*', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const files: TemplateFile[] = [
  ...Object.entries(sources).map(([path, content]) => ({
    path: path.replace('../../cardinal-crux/', ''),
    content,
  })),
  ...Object.entries(runtime).map(([path, content]) => ({
    path: path.replace('../../cardinal-crux/', ''),
    content,
    encoding: 'asset-url' as const,
  })),
];
const template: TemplateDefinition = {
  files,
  layout: LAYOUT_WORKSHOP,
  meta: { settings: { entryFile: 'index.html' } },
  greeting:
    'Slow Sky is a Cardinal-powered drone instrument. Press Start sound, choose a preset, and shape it with the controls. Open rack reveals the modules behind the same sound. Edits save with Growth. Ask me to make the sound darker or choose a preset: the instrument tools update these same controls and save the result. Use a Task to experiment with the instrument itself. This first version runs locally; website sharing is not available yet.',
  context:
    'This Crux contains a real Cardinal WASM engine, not a replacement synthesizer. Its curated modules are Cardinal host modules, Fundamental, selected Bogaudio and Valley Plateau. The patch, macro mappings and presets are saved atomically in music/instrument.json; music/starter.vcv is a separate recovery starting point. Preserve schemaVersion, stable module/cable IDs, macros and presets. Read model.js for validation limits. Ask the user to reload after agent file edits; never claim live parameters changed unless verified. engine/GardenBridge.inc documents the compiled engine operations. App code and the runtime retain their licenses. Use Tasks for source changes; preserve music/ content unless explicitly asked to change it. For sound-shaping requests use inspect_instrument first, then set_instrument_controls or select_instrument_preset with the discovered IDs. These act on the open instrument and confirm saved results; they do not start playback. Raw file edits still require explicit reload. No arbitrary VCV module loading, sample-player modules, recording/export or website publishing is implemented in this initial instrument.',
};
export default template;
