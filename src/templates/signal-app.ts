import type { TemplateDefinition } from './index';
import { LAYOUT_WORKSHOP } from './index';
// Signal travels with the Crux: upstream's source packages, the Garden bridge,
// the lockfile and notices as text; the built app (runtime/) with its sounds as assets.
const source = import.meta.glob(
  [
    '../../signal-crux/{package.json,package-lock.json,turbo.json,biome.json,LICENSE,README.md,UPSTREAM.md,.cruxignore,.gitignore}',
    '../../signal-crux/app/*.{html,json,mts,mjs}',
    '../../signal-crux/app/src/**/*.{ts,tsx,json,svg,md}',
    '../../signal-crux/app/public/**/*.{svg,webmanifest,html}',
    '../../signal-crux/packages/*/{package.json,tsconfig.json,vite.config.ts,vitest.config.ts,README.md}',
    '../../signal-crux/packages/*/src/**/*.{ts,tsx,json,svg,md}',
    '../../signal-crux/electron/src/*.ts',
    '../../signal-crux/garden/**/*.{js,cjs,mjs,ts}',
    '../../signal-crux/licenses/**/*',
    '!../../signal-crux/**/node_modules/**',
    '!../../signal-crux/**/*.test.*',
    '!../../signal-crux/**/test/**',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const assets = import.meta.glob(
  [
    '../../signal-crux/runtime/**/*',
    '!../../signal-crux/runtime/**/*.map',
    '../../signal-crux/app/src/assets/*.png',
    '../../signal-crux/app/public/*.png',
  ],
  { query: '?url', import: 'default', eager: true },
) as Record<string, string>;
const template: TemplateDefinition = {
  files: [
    ...Object.entries(source).map(([path, content]) => ({
      path: path.replace('../../signal-crux/', ''),
      content,
    })),
    ...Object.entries(assets).map(([path, content]) => ({
      path: path.replace('../../signal-crux/', ''),
      content,
      encoding: 'asset-url' as const,
    })),
    {
      path: 'data/project.json',
      content: JSON.stringify({ version: 1, app: 'signal', project: null }),
    },
  ],
  layout: LAYOUT_WORKSHOP,
  meta: { settings: { entryFile: 'runtime/index.html' } },
  greeting:
    'A new song opens in Signal, a MIDI sequencer: draw notes in the piano roll, arrange tracks, shape the tempo, and play it with the built-in sounds. The song saves to Garden as you work; Save to Cruxspace keeps the MIDI file or a WAV render as an output. Ask me to write a melody, a bass line or a drum part, and I will put the notes in.',
  context:
    'A songwriting tool around the actual Signal sequencer (ryohey/signal, MIT; the fork keeps upstream’s source and notices, built into runtime/). The song lives in data/project.json as its name and a Garden binary asset holding the Standard MIDI File; the bridge saves after every edit. App Tools: inspect_song (name, tempo, time signature, timebase, tracks with note counts), set_song_name, set_track_notes (write notes into a track: tick counts 480 per quarter note, noteNumber 60 = middle C, velocity 1–127; one past the last track makes a new one; name, program and tempo optional; ask before replacing notes a person drew), save_song_midi and save_song_audio (a WAV render; both into exports/). The app’s own menus do the rest (open a MIDI file, export WAV/MP3, settings). Never edit runtime/. Sharing the editor as a website is not offered; the MIDI and audio files are the outputs. See UPSTREAM.md.',
};
export default template;
