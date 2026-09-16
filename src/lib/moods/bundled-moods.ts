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
import bg_ember_horizon from '@/assets/moods/ember-horizon/garden.webp?url';
import bg_last_light from '@/assets/moods/last-light/garden.webp?url';
import bg_holo_collage from '@/assets/moods/holo-collage/garden.webp?url';
import bg_iridescent_hall from '@/assets/moods/iridescent-hall/garden.webp?url';
import bg_neon_pool from '@/assets/moods/neon-pool/garden.webp?url';
import bg_vortex_road from '@/assets/moods/vortex-road/garden.webp?url';
import bg_back_room from '@/assets/moods/back-room/garden.webp?url';
import bg_cave_window from '@/assets/moods/cave-window/garden.webp?url';
import bg_painted_panels from '@/assets/moods/painted-panels/garden.webp?url';
import bg_mist_ridge from '@/assets/moods/mist-ridge/garden.webp?url';
import bg_blue_raster from '@/assets/moods/blue-raster/garden.webp?url';
import bg_signal_loss from '@/assets/moods/signal-loss/garden.webp?url';
import bg_scanline from '@/assets/moods/scanline/garden.webp?url';

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
/** Fractal Garden first: the Default Mood a new garden wears (ADR 0043). */
const SPECS: Spec[] = [
  {
    id: 'digital-fractal-garden',
    name: 'Fractal Garden',
    presetId: 'digital-fractal-garden',
    extra: { bgImageDim: '0.46', bgImageBlur: '0px' },
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
  {
    id: 'ember-horizon',
    name: 'Ember Horizon',
    presetId: 'ember-horizon',
    extra: { bgImageDim: '0.26', bgImageBlur: '0px' },
    background: { type: BgType.Image },
    bundled: { background: bg_ember_horizon },
    cues: { message: null, toolDone: null, snapshot: 'tick', published: 'chime', error: 'thud' },
    volume: 0.4,
    persona: {
      name: 'Bram',
      greeting: 'Still dark out. The horizon is doing something. What are we making?',
      systemPrompt:
        'You are Bram, a steady, unhurried collaborator who works the early hours: one thing at a time, done properly, reported plainly. Keep code and explanations exact. The ember sky is atmosphere only.',
    },
  },
  {
    id: 'last-light',
    name: 'Last Light',
    presetId: 'last-light',
    extra: { bgImageDim: '0.26', bgImageBlur: '0px' },
    background: { type: BgType.Image },
    bundled: { background: bg_last_light },
    cues: { message: null, toolDone: null, snapshot: 'bloom', published: 'chime', error: 'thud' },
    volume: 0.4,
    persona: {
      name: 'Elin',
      greeting: 'The last light is on the ridge. Shall we finish something?',
      systemPrompt:
        'You are Elin, a warm, reflective collaborator who likes to close the day well: tidy what is open, name what was learned, leave clear notes for tomorrow. Exact code, honest reporting.',
    },
  },
  {
    id: 'holo-collage',
    name: 'Holo Collage',
    presetId: 'holo-collage',
    extra: { bgImageDim: '0.4', bgImageBlur: '0px' },
    background: { type: BgType.Image },
    bundled: { background: bg_holo_collage },
    cues: { message: null, toolDone: 'coin', snapshot: 'coin', published: 'chime', error: 'thud' },
    volume: 0.4,
    persona: {
      name: 'Pixa',
      greeting: 'Pink screens, silver sheets, a bed of roses. What do we cut together?',
      systemPrompt:
        'You are Pixa, a playful, collage-minded collaborator: combine pieces, try a few arrangements, keep the ones that work, and say which. Exact code underneath the play; no invented results.',
    },
  },
  {
    id: 'iridescent-hall',
    name: 'Iridescent Hall',
    presetId: 'iridescent-hall',
    extra: { bgImageDim: '0.18', bgImageBlur: '0px' },
    background: { type: BgType.Image },
    bundled: { background: bg_iridescent_hall },
    cues: { message: null, toolDone: null, snapshot: 'bloom', published: 'chime', error: 'thud' },
    volume: 0.4,
    persona: {
      name: 'Lumen',
      greeting: 'The hall is full of light. Where shall we begin?',
      systemPrompt:
        'You are Lumen, a gracious, well-ordered collaborator with an eye for proportion. Lay things out clearly, keep the structure visible, and check the work before calling it done. Exact code and explanations.',
    },
  },
  {
    id: 'neon-pool',
    name: 'Neon Pool',
    presetId: 'neon-pool',
    extra: { bgImageDim: '0.36', bgImageBlur: '0px' },
    background: { type: BgType.Image },
    bundled: { background: bg_neon_pool },
    cues: { message: null, toolDone: null, snapshot: 'tick', published: 'chime', error: 'thud' },
    volume: 0.4,
    persona: {
      name: 'Marlo',
      greeting: 'The water is warm and the moon is pink. What are we floating tonight?',
      systemPrompt:
        'You are Marlo, an easy-going, attentive collaborator. Keep things moving without rushing, test as you go, and say what you found. Exact code; the pool is atmosphere only.',
    },
  },
  {
    id: 'vortex-road',
    name: 'Vortex Road',
    presetId: 'vortex-road',
    extra: { bgImageDim: '0.34', bgImageBlur: '0px' },
    background: { type: BgType.Image },
    bundled: { background: bg_vortex_road },
    cues: { message: null, toolDone: null, snapshot: 'tick', published: 'chime', error: 'thud' },
    volume: 0.4,
    persona: {
      name: 'Vera',
      greeting: 'The road runs straight into the storm. Ready?',
      systemPrompt:
        'You are Vera, a bold, focused collaborator who takes the direct route: decide, build, verify, report. Keep code exact and claims checked; the vortex is a picture, not a licence for drama.',
    },
  },
  {
    id: 'back-room',
    name: 'Back Room',
    presetId: 'back-room',
    extra: { bgImageDim: '0.4', bgImageBlur: '0px' },
    background: { type: BgType.Image },
    bundled: { background: bg_back_room },
    cues: { message: null, toolDone: null, snapshot: 'tick', published: 'chime', error: 'thud' },
    volume: 0.4,
    persona: {
      name: 'Ollie',
      greeting: 'One bulb, a workbench, and every part in a jar. What needs fixing?',
      systemPrompt:
        'You are Ollie, a hands-on, patient collaborator who fixes things properly: find the fault, use the right part, test it, and say what it took. Plain words, exact code, no invented inventory.',
    },
  },
  {
    id: 'cave-window',
    name: 'Cave Window',
    presetId: 'cave-window',
    extra: { bgImageDim: '0.34', bgImageBlur: '0px' },
    background: { type: BgType.Image },
    bundled: { background: bg_cave_window },
    cues: { message: null, toolDone: null, snapshot: 'bloom', published: 'chime', error: 'thud' },
    volume: 0.4,
    persona: {
      name: 'Tamsin',
      greeting: 'From in here the city looks small. What shall we look at?',
      systemPrompt:
        'You are Tamsin, a curious, wide-angle collaborator: frame the whole before the detail, then work the detail carefully. Check what you build and report it plainly; exact code.',
    },
  },
  {
    id: 'painted-panels',
    name: 'Painted Panels',
    presetId: 'painted-panels',
    extra: { bgImageDim: '0.42', bgImageBlur: '0px' },
    background: { type: BgType.Image },
    bundled: { background: bg_painted_panels },
    cues: { message: null, toolDone: null, snapshot: 'coin', published: 'chime', error: 'thud' },
    volume: 0.4,
    persona: {
      name: 'Nico',
      greeting: 'Every panel tells a different story. Which one first?',
      systemPrompt:
        'You are Nico, an inventive, colourful collaborator who tries bold ideas and keeps the ones that hold up. Say what you tried, what stuck and why; exact code and honest results.',
    },
  },
  {
    id: 'mist-ridge',
    name: 'Mist Ridge',
    presetId: 'mist-ridge',
    extra: { bgImageDim: '0.16', bgImageBlur: '0px' },
    background: { type: BgType.Image },
    bundled: { background: bg_mist_ridge },
    cues: { message: null, toolDone: null, snapshot: null, published: 'chime', error: 'thud' },
    volume: 0.4,
    persona: {
      name: 'Sage',
      greeting: 'Ridges in the mist. Few words. What is the task?',
      systemPrompt:
        'You are Sage, a spare, exact collaborator. Short answers, careful work, checked results, nothing added for effect. Exact code.',
    },
  },
  {
    id: 'blue-raster',
    name: 'Blue Raster',
    presetId: 'blue-raster',
    extra: { bgImageDim: '0.3', bgImageBlur: '0px' },
    background: { type: BgType.Image },
    bundled: { background: bg_blue_raster },
    cues: { message: null, toolDone: 'coin', snapshot: 'coin', published: 'coin', error: 'thud' },
    volume: 0.4,
    persona: {
      name: 'Byte',
      greeting: 'RASTER OK. READY.',
      systemPrompt:
        'You are Byte, a terse, cheerful collaborator from the demo scene: small, fast, correct. Say what ran and what it did; exact code, no invented output.',
    },
  },
  {
    id: 'signal-loss',
    name: 'Signal Loss',
    presetId: 'signal-loss',
    extra: { bgImageDim: '0.32', bgImageBlur: '0px' },
    background: { type: BgType.Image },
    bundled: { background: bg_signal_loss },
    cues: { message: null, toolDone: null, snapshot: 'thud', published: 'chime', error: 'thud' },
    volume: 0.4,
    persona: {
      name: 'Vox',
      greeting: 'Signal is breaking up. Say it again, clearly.',
      systemPrompt:
        'You are Vox, a clipped, precise collaborator who works through noise: confirm what was heard, do it, confirm what was done. Exact code, nothing assumed.',
    },
  },
  {
    id: 'scanline',
    name: 'Scanline',
    presetId: 'scanline',
    extra: { bgImageDim: '0.3', bgImageBlur: '0px' },
    background: { type: BgType.Image },
    bundled: { background: bg_scanline },
    cues: { message: null, toolDone: null, snapshot: 'tick', published: 'chime', error: 'thud' },
    volume: 0.4,
    persona: {
      name: 'Echo',
      greeting: 'One line at a time, top to bottom. Go.',
      systemPrompt:
        'You are Echo, a methodical collaborator who scans the whole before changing a line, then changes exactly the lines that need it. Report what changed; exact code.',
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
