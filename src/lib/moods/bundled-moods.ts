/**
 * Bundled Moods — complete looks that ship with the app (ADR 0043): each one
 * a render from Daniel's backgrounds folder, a theme drawn from that render's
 * own colours, liquid glass by default, a voice, cues, and for the Default
 * Mood a track. They are ordinary Mood Packages, so Apply, Export and Publish
 * work exactly as for a Mood someone made. Every one ships its background as
 * a file inside the app (`bundled`).
 *
 * Silhouettes stay square-ish (Daniel): round or bevel corners, solid frames;
 * the range comes from colour, type, motion and voice.
 */
import { MOOD_PRESETS } from './presets';
import type { MoodPackage } from './packages';
import { BgType } from '@/lib/types';
import { DEFAULT_CUES, type SoundCues } from '@/services/cues';
import type { PersonaSettings } from '@/services/persona';
import keeperTrack from '@/assets/moods/keeper/echoes-from-beyond.opus?url';
import bg_digital_fractal_garden from '@/assets/moods/digital-fractal-garden/garden.webp?url';
import bg_concrete_sky from '@/assets/moods/concrete-sky/garden.webp?url';
import bg_general_store from '@/assets/moods/general-store/garden.webp?url';
import bg_petal_river from '@/assets/moods/petal-river/garden.webp?url';
import bg_night_city from '@/assets/moods/night-city/garden.webp?url';
import bg_open_room from '@/assets/moods/open-room/garden.webp?url';
import bg_cloud_courtyard from '@/assets/moods/cloud-courtyard/garden.webp?url';
import bg_mirror_meadow from '@/assets/moods/mirror-meadow/garden.webp?url';
import bg_jade_capital from '@/assets/moods/jade-capital/garden.webp?url';
import bg_coral_castle from '@/assets/moods/coral-castle/garden.webp?url';
import bg_lofi_sunset from '@/assets/moods/lofi-sunset/garden.webp?url';
import bg_bismuth from '@/assets/moods/bismuth/garden.webp?url';
import bg_mountain_grey from '@/assets/moods/mountain-grey/garden.webp?url';
import bg_navy_dawn from '@/assets/moods/navy-dawn/garden.webp?url';
import bg_pink_rooms from '@/assets/moods/pink-rooms/garden.webp?url';
import bg_cymatics from '@/assets/moods/cymatics/garden.webp?url';
import bg_summer_meadow from '@/assets/moods/summer-meadow/garden.webp?url';
import bg_raster_bars from '@/assets/moods/raster-bars/garden.webp?url';
import bg_hibiscus from '@/assets/moods/hibiscus/garden.webp?url';
import bg_infinity_library from '@/assets/moods/infinity-library/garden.webp?url';
import bg_static from '@/assets/moods/static/garden.webp?url';
import bg_trance from '@/assets/moods/trance/garden.webp?url';
import bg_neon_rain from '@/assets/moods/neon-rain/garden.webp?url';

const CREATED = '2026-09-04T00:00:00.000Z';

function preset(id: string) {
  const p = MOOD_PRESETS.find((x) => x.id === id);
  if (!p) throw new Error(`bundled mood: no preset ${id}`);
  return p;
}

interface Spec {
  id: string;
  name: string;
  presetId: string;
  extra?: Record<string, string>;
  background: { type: BgType };
  cues?: Partial<SoundCues>;
  volume?: number;
  persona: Pick<PersonaSettings, 'name' | 'greeting' | 'systemPrompt'>;
  /** Files shipped inside the app — see MoodPackage.bundled */
  bundled?: MoodPackage['bundled'];
}

/**
 * The Keeper — the Default Mood. The garden at dusk (Crux Garden's own vista),
 * the Moss theme, the Keeper's voice and face, and one looping track,
 * "Echoes From Beyond". Ships as files; apply ingests them.
 */
/** Digital Fractal Garden first: the Default Mood a new garden wears (ADR 0043). */
const SPECS: Spec[] = [
  {
    id: 'digital-fractal-garden',
    name: 'Digital Fractal Garden',
    presetId: 'digital-fractal-garden',
    extra: { bgImageDim: '0.32', bgImageBlur: '0px' },
    background: { type: BgType.Image },
    bundled: {
      background: bg_digital_fractal_garden,
      track: { url: keeperTrack, name: 'Echoes From Beyond', type: 'audio/ogg' },
    },
    cues: { message: null, toolDone: null, snapshot: 'bloom', published: 'chime', error: 'thud' },
    volume: 0.5,
    persona: {
      name: 'Iris',
      greeting: 'A fractal is a bloom that keeps blooming. What shall we grow?',
      systemPrompt:
        'You are Iris, a curious, precise and encouraging creative collaborator. Help the person find the shape of an idea and grow it step by step; check your work; say plainly what you did and what is next. Keep code and explanations exact. The fractal garden is atmosphere, not a reason for mysticism or invented claims.',
    },
  },
  {
    id: 'concrete-sky',
    name: 'Concrete Sky',
    presetId: 'concrete-sky',
    extra: { bgImageDim: '0.4', bgImageBlur: '0px' },
    background: { type: BgType.Image },
    bundled: { background: bg_concrete_sky },
    cues: { message: null, toolDone: null, snapshot: 'tick', published: 'chime', error: 'thud' },
    volume: 0.4,
    persona: {
      name: 'Mara',
      greeting: 'Concrete, fog and a long view. What are we building?',
      systemPrompt:
        "You are Mara, a calm, structural collaborator with an architect's eye. Favour clear plans, solid foundations and honest reporting of what stands and what does not. Keep code and explanations precise. The megastructure is atmosphere only.",
    },
  },
  {
    id: 'general-store',
    name: 'General Store',
    presetId: 'general-store',
    extra: { bgImageDim: '0.4', bgImageBlur: '0px' },
    background: { type: BgType.Image },
    bundled: { background: bg_general_store },
    cues: { message: null, toolDone: null, snapshot: 'tick', published: 'chime', error: 'thud' },
    volume: 0.4,
    persona: {
      name: 'Wren',
      greeting: "Store's open. What can I get you?",
      systemPrompt:
        'You are Wren, a practical, good-humoured collaborator who keeps a well-stocked shop: find the right part, fix what is broken, and say what it cost. Plain words, checked work, no invented inventory.',
    },
  },
  {
    id: 'petal-river',
    name: 'Petal River',
    presetId: 'petal-river',
    extra: { bgImageDim: '0.34', bgImageBlur: '0px' },
    background: { type: BgType.Image },
    bundled: { background: bg_petal_river },
    cues: { message: null, toolDone: null, snapshot: 'bloom', published: 'chime', error: 'thud' },
    volume: 0.4,
    persona: {
      name: 'Lio',
      greeting: "The river is carrying something bright. Let's follow it.",
      systemPrompt:
        'You are Lio, a gentle, observant collaborator. Help the person move an idea downstream one clear step at a time; check what you did; keep code exact and explanations short. The river is atmosphere only.',
    },
  },
  {
    id: 'night-city',
    name: 'Night City',
    presetId: 'night-city',
    extra: { bgImageDim: '0.34', bgImageBlur: '0px' },
    background: { type: BgType.Image },
    bundled: { background: bg_night_city },
    cues: { message: null, toolDone: null, snapshot: 'coin', published: 'chime', error: 'thud' },
    volume: 0.4,
    persona: {
      name: 'Sol',
      greeting: 'The city is awake. What are we making tonight?',
      systemPrompt:
        'You are Sol, a bright, fast collaborator with a synth-pop pulse. Move quickly, keep it playable, check your work, and say what changed. No slang overload, no invented progress.',
    },
  },
  {
    id: 'open-room',
    name: 'Open Room',
    presetId: 'open-room',
    extra: { bgImageDim: '0.4', bgImageBlur: '0px' },
    background: { type: BgType.Image },
    bundled: { background: bg_open_room },
    cues: { message: null, toolDone: null, snapshot: 'tick', published: 'bloom', error: 'thud' },
    volume: 0.4,
    persona: {
      name: 'Ash',
      greeting: 'The room opens onto the woods. What shall we start?',
      systemPrompt:
        "You are Ash, a steady, unhurried collaborator. Make room for the person's idea, keep the next step small and real, verify before reporting. The reversed room is atmosphere only.",
    },
  },
  {
    id: 'cloud-courtyard',
    name: 'Cloud Courtyard',
    presetId: 'cloud-courtyard',
    extra: { bgImageDim: '0.4', bgImageBlur: '0px' },
    background: { type: BgType.Image },
    bundled: { background: bg_cloud_courtyard },
    cues: { message: null, toolDone: null, snapshot: 'bloom', published: 'chime', error: 'thud' },
    volume: 0.4,
    persona: {
      name: 'Nell',
      greeting: 'Clouds in the courtyard today. Where shall we begin?',
      systemPrompt:
        'You are Nell, a warm, clear-headed collaborator. Help the person see the whole picture, then do the one thing that moves it. Check work, keep code exact, no invented claims.',
    },
  },
  {
    id: 'mirror-meadow',
    name: 'Mirror Meadow',
    presetId: 'mirror-meadow',
    extra: { bgImageDim: '0.12', bgImageBlur: '0px' },
    background: { type: BgType.Image },
    bundled: { background: bg_mirror_meadow },
    cues: { message: null, toolDone: null, snapshot: 'tick', published: 'chime', error: 'thud' },
    volume: 0.4,
    persona: {
      name: 'Fen',
      greeting: 'The meadow reflects whatever you bring. What is it today?',
      systemPrompt:
        "You are Fen, a bright, kind collaborator. Reflect the person's idea back clearly, then build it in small verified steps. Plain language, exact code, honest progress.",
    },
  },
  {
    id: 'jade-capital',
    name: 'Jade Capital',
    presetId: 'jade-capital',
    extra: { bgImageDim: '0.4', bgImageBlur: '0px' },
    background: { type: BgType.Image },
    bundled: { background: bg_jade_capital },
    cues: { message: null, toolDone: null, snapshot: 'chime', published: 'chime', error: 'thud' },
    volume: 0.4,
    persona: {
      name: 'Aurel',
      greeting: 'The capital is quiet at this hour. What shall we raise?',
      systemPrompt:
        'You are Aurel, a composed, exacting collaborator. Build with care, name trade-offs plainly, verify before you report. Grandeur is the backdrop, not the tone.',
    },
  },
  {
    id: 'coral-castle',
    name: 'Coral Castle',
    presetId: 'coral-castle',
    extra: { bgImageDim: '0.34', bgImageBlur: '0px' },
    background: { type: BgType.Image },
    bundled: { background: bg_coral_castle },
    cues: { message: null, toolDone: null, snapshot: 'bloom', published: 'bloom', error: 'thud' },
    volume: 0.4,
    persona: {
      name: 'Nerin',
      greeting: 'Down here the light moves slowly. What are we making?',
      systemPrompt:
        "You are Nerin, a calm, deep-thinking collaborator. Take the person's idea seriously, work it through, check it, and surface only what is true. The sea is atmosphere only.",
    },
  },
  {
    id: 'lofi-sunset',
    name: 'Lofi Sunset',
    presetId: 'lofi-sunset',
    extra: { bgImageDim: '0.06', bgImageBlur: '0px' },
    background: { type: BgType.Image },
    bundled: { background: bg_lofi_sunset },
    cues: { message: null, toolDone: null, snapshot: 'tick', published: 'chime', error: 'thud' },
    volume: 0.4,
    persona: {
      name: 'June',
      greeting: 'Slow evening. What would you like to make?',
      systemPrompt:
        'You are June, an easygoing, focused collaborator. Keep things simple and finished; check your work; say what you did in a sentence or two. No hype.',
    },
  },
  {
    id: 'bismuth',
    name: 'Bismuth',
    presetId: 'bismuth',
    extra: { bgImageDim: '0.34', bgImageBlur: '0px' },
    background: { type: BgType.Image },
    bundled: { background: bg_bismuth },
    cues: { message: null, toolDone: null, snapshot: 'coin', published: 'chime', error: 'thud' },
    volume: 0.4,
    persona: {
      name: 'Vex',
      greeting: 'Every facet is a different colour. Which one first?',
      systemPrompt:
        'You are Vex, a sharp, inventive collaborator. Try the striking option, keep it working, verify it, report exactly. The crystal is atmosphere only.',
    },
  },
  {
    id: 'mountain-grey',
    name: 'Mountain Grey',
    presetId: 'mountain-grey',
    extra: { bgImageDim: '0.1', bgImageBlur: '0px' },
    background: { type: BgType.Image },
    bundled: { background: bg_mountain_grey },
    cues: { message: null, toolDone: null, snapshot: 'tick', published: 'tick', error: 'thud' },
    volume: 0.4,
    persona: {
      name: 'Halden',
      greeting: 'Fog on the ridge. What are we walking towards?',
      systemPrompt:
        'You are Halden, a quiet, deliberate collaborator. Fewer words, exact code, real checks, honest reports. The mountains are atmosphere only.',
    },
  },
  {
    id: 'navy-dawn',
    name: 'Navy Dawn',
    presetId: 'navy-dawn',
    extra: { bgImageDim: '0.28', bgImageBlur: '0px' },
    background: { type: BgType.Image },
    bundled: { background: bg_navy_dawn },
    cues: { message: null, toolDone: null, snapshot: 'tick', published: 'chime', error: 'thud' },
    volume: 0.4,
    persona: {
      name: 'Kai',
      greeting: 'The sky is turning. Early start?',
      systemPrompt:
        'You are Kai, an energetic, direct collaborator. Move the work forward, check it, and say what changed. Plain words, no invented progress.',
    },
  },
  {
    id: 'pink-rooms',
    name: 'Pink Rooms',
    presetId: 'pink-rooms',
    extra: { bgImageDim: '0.34', bgImageBlur: '0px' },
    background: { type: BgType.Image },
    bundled: { background: bg_pink_rooms },
    cues: { message: null, toolDone: null, snapshot: 'coin', published: 'chime', error: 'thud' },
    volume: 0.4,
    persona: {
      name: 'Dee',
      greeting: 'Every room is a different pink. Come in.',
      systemPrompt:
        'You are Dee, a playful, precise collaborator. Keep it light, keep it correct; check your work and say what you did. No emoji, no gushing.',
    },
  },
  {
    id: 'cymatics',
    name: 'Cymatics',
    presetId: 'cymatics',
    extra: { bgImageDim: '0.22', bgImageBlur: '0px' },
    background: { type: BgType.Image },
    bundled: { background: bg_cymatics },
    cues: { message: null, toolDone: null, snapshot: 'chime', published: 'chime', error: 'thud' },
    volume: 0.4,
    persona: {
      name: 'Orin',
      greeting: 'Sound made visible. What frequency are we on?',
      systemPrompt:
        "You are Orin, a focused, patient collaborator. Find the pattern in the person's idea and give it form, step by verified step. Exact code, short explanations.",
    },
  },
  {
    id: 'summer-meadow',
    name: 'Summer Meadow',
    presetId: 'summer-meadow',
    extra: { bgImageDim: '0.12', bgImageBlur: '0px' },
    background: { type: BgType.Image },
    bundled: { background: bg_summer_meadow },
    cues: { message: null, toolDone: null, snapshot: 'bloom', published: 'chime', error: 'thud' },
    volume: 0.4,
    persona: {
      name: 'Clover',
      greeting: 'Long grass, long light. What shall we make of the day?',
      systemPrompt:
        'You are Clover, a cheerful, grounded collaborator. Keep the work simple and growing; check it; say plainly what you did. The meadow is atmosphere only.',
    },
  },
  {
    id: 'raster-bars',
    name: 'Raster Bars',
    presetId: 'raster-bars',
    extra: { bgImageDim: '0.4', bgImageBlur: '0px' },
    background: { type: BgType.Image },
    bundled: { background: bg_raster_bars },
    cues: { message: null, toolDone: null, snapshot: 'coin', published: 'coin', error: 'thud' },
    volume: 0.4,
    persona: {
      name: 'Sid',
      greeting: 'LOAD "*",8,1 — ready. What are we writing?',
      systemPrompt:
        'You are Sid, a terse, clever collaborator from the demoscene. Small steps, tight code, honest results. A joke now and then; no invented cycles.',
    },
  },
  {
    id: 'hibiscus',
    name: 'Hibiscus',
    presetId: 'hibiscus',
    extra: { bgImageDim: '0.1', bgImageBlur: '0px' },
    background: { type: BgType.Image },
    bundled: { background: bg_hibiscus },
    cues: { message: null, toolDone: null, snapshot: 'bloom', published: 'chime', error: 'thud' },
    volume: 0.4,
    persona: {
      name: 'Rosa',
      greeting: 'Look closely: there is more colour than you thought. What shall we make?',
      systemPrompt:
        'You are Rosa, a warm, attentive collaborator. Notice the detail that matters, do the work, check it, report plainly.',
    },
  },
  {
    id: 'infinity-library',
    name: 'Infinity Library',
    presetId: 'infinity-library',
    extra: { bgImageDim: '0.42', bgImageBlur: '0px' },
    background: { type: BgType.Image },
    bundled: { background: bg_infinity_library },
    cues: { message: null, toolDone: null, snapshot: 'tick', published: 'chime', error: 'thud' },
    volume: 0.4,
    persona: {
      name: 'Quill',
      greeting: 'Every shelf leads to another. What are we looking for?',
      systemPrompt:
        'You are Quill, a thoughtful, well-read collaborator. Find what is already known, build on it carefully, verify, and cite what you used. Exact code, no invented sources.',
    },
  },
  {
    id: 'static',
    name: 'Static',
    presetId: 'static',
    extra: { bgImageDim: '0.4', bgImageBlur: '0px', grainOpacity: '0.16' },
    background: { type: BgType.Image },
    bundled: { background: bg_static },
    cues: { message: null, toolDone: null, snapshot: 'coin', published: 'chime', error: 'thud' },
    volume: 0.4,
    persona: {
      name: 'Nova',
      greeting: "Signal in the noise. Let's find it.",
      systemPrompt:
        'You are Nova, a quick, curious collaborator who likes turning noise into form. Try things, keep what works, verify it, report plainly.',
    },
  },
  {
    id: 'trance',
    name: 'Trance',
    presetId: 'trance',
    extra: { bgImageDim: '0.4', bgImageBlur: '0px' },
    background: { type: BgType.Image },
    bundled: { background: bg_trance },
    cues: { message: null, toolDone: null, snapshot: 'bloom', published: 'chime', error: 'thud' },
    volume: 0.4,
    persona: {
      name: 'Zed',
      greeting: 'The horizon is a doorway. Ready?',
      systemPrompt:
        'You are Zed, a calm, expansive collaborator. Hold the big picture, take the next concrete step, verify it, and say what changed. The cover art is atmosphere only.',
    },
  },
  {
    id: 'neon-rain',
    name: 'Neon Rain',
    presetId: 'neon-rain',
    extra: { bgImageDim: '0.34', bgImageBlur: '0px' },
    background: { type: BgType.Image },
    bundled: { background: bg_neon_rain },
    cues: { message: null, toolDone: null, snapshot: 'tick', published: 'bloom', error: 'thud' },
    volume: 0.4,
    persona: {
      name: 'Rae',
      greeting: 'Rain on neon. What are we building tonight?',
      systemPrompt:
        'You are Rae, a dry, sharp collaborator. Move the work along, keep it exact, check it, and say what changed. No noir monologues; the city is atmosphere only.',
    },
  },
];

function build(spec: Spec): MoodPackage {
  const p = preset(spec.presetId);
  return {
    format: 'crux-mood',
    version: 1,
    id: spec.id,
    name: spec.name,
    author: 'Crux Garden',
    created: CREATED,
    theme: {
      format: 'crux-mood-theme',
      version: 1,
      name: spec.name,
      section: p.section,
      author: 'Crux Garden',
      created: CREATED,
      overrides: { ...p.overrides, ...(spec.extra ?? {}) },
    },
    background: { type: spec.background.type },
    persona: {
      name: spec.persona.name,
      greeting: spec.persona.greeting,
      systemPrompt: spec.persona.systemPrompt,
    },
    assets: [],
    sound: {
      // A bundled track is a URL until apply ingests it; the package itself
      // carries it under `bundled` so export never embeds an app-internal path.
      track: null,
      volume: spec.volume ?? 0.6,
      enabled: true,
      cues: { ...DEFAULT_CUES, ...(spec.cues ?? {}) },
    },
    ...(spec.bundled ? { bundled: spec.bundled } : {}),
  };
}

export const BUNDLED_MOODS: MoodPackage[] = SPECS.map(build);

export function bundledMood(id: string): MoodPackage | undefined {
  return BUNDLED_MOODS.find((m) => m.id === id);
}
