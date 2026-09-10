/**
 * Bundled Moods — complete looks that ship with the app: a theme preset (plus
 * a few extra tokens), a background, a persona voice, cues, and — where a
 * Mood has one — a track. They are ordinary Mood Packages, so Apply, Export
 * and Publish work exactly as for a Mood someone made. Most carry no binary
 * assets (textures and backgrounds are CSS); The Keeper ships its own
 * background, avatar and track as files inside the app (`bundled`).
 *
 * The point is range: distinct rooms — shapes, type, density, motion and
 * voice all move together.
 */
import { MOOD_PRESETS } from './presets';
import type { MoodPackage } from './packages';
import { BgType } from '@/lib/types';
import { DEFAULT_CUES, type SoundCues } from '@/services/cues';
import type { PersonaSettings } from '@/services/persona';
import { DEFAULT_PERSONA } from '@/services/persona';
import eightBitGarden from '@/assets/moods/8-bit/garden.png?url';
import glitchcoreGarden from '@/assets/moods/glitchcore/garden.png?url';
import fantasyGarden from '@/assets/moods/80s-fantasy/garden.png?url';
import glumlotChamber from '@/assets/moods/glumlot/chamber.png?url';
import silentHillGarden from '@/assets/moods/silent-hill/garden.png?url';
import siberianCity from '@/assets/moods/siberian-blizzard/city.png?url';
import keeperVista from '@/assets/moods/keeper/vista.jpg?url';
import keeperAvatar from '@/assets/moods/keeper/keeper-avatar.png?url';
import keeperTrack from '@/assets/moods/keeper/echoes-from-beyond.opus?url';
import oneBigSky from '@/assets/moods/one-big-sky/sky.png?url';

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
const THE_KEEPER: Spec = {
  id: 'the-keeper',
  name: 'The Keeper',
  presetId: 'moss',
  extra: {
    // the vista carries the room: no bloom, a soft dim so panels stay legible
    bgImageDim: '0.35',
    bgImageBlur: '0px',
  },
  background: { type: BgType.Image },
  volume: 0.5,
  persona: {
    name: DEFAULT_PERSONA.name,
    greeting: DEFAULT_PERSONA.greeting,
    systemPrompt: DEFAULT_PERSONA.systemPrompt,
  },
  bundled: {
    background: keeperVista,
    avatar: keeperAvatar,
    track: { url: keeperTrack, name: 'Echoes From Beyond', type: 'audio/ogg' },
  },
};

const SPECS: Spec[] = [
  THE_KEEPER,
  {
    id: 'one-big-sky',
    name: 'One Big Sky',
    presetId: 'one-big-sky',
    extra: { bgImageDim: '0.08', bgImageBlur: '0px' },
    background: { type: BgType.Image },
    bundled: { background: oneBigSky },
    cues: { message: null, toolDone: null, snapshot: 'coin', published: 'chime', error: 'thud' },
    volume: 0.2,
    persona: {
      name: 'Skye',
      greeting: 'There’s room up here for another idea. What shall we make?',
      systemPrompt:
        'You are Skye, a friendly, inventive creative collaborator with the lightness of an afternoon arcade adventure. Help the person turn ideas into playable experiments, explain decisions plainly, and verify what you build. Be practical and concise. Preserve their work and creative intent. Game references are welcome in moderation; never invent scores, progress or completed work.',
    },
  },
  {
    id: 'siberian-blizzard',
    name: 'Siberian Blizzard',
    presetId: 'siberian-blizzard',
    extra: { bgImageDim: '0.1', bgImageBlur: '0px' },
    background: { type: BgType.Image },
    bundled: { background: siberianCity },
    cues: { message: null, toolDone: null, snapshot: 'tick', published: 'chime', error: 'thud' },
    volume: 0.3,
    persona: {
      name: 'Nadya',
      greeting: 'The kettle is on. What shall we get done while the snow settles?',
      systemPrompt:
        'You are Nadya, a steady, resourceful creative collaborator. Your warmth is understated: help the person find a workable next step, make good use of what is available, and check details carefully. Speak plainly with occasional dry humor. Keep code and explanations precise, and describe only verified progress. The winter setting is atmosphere, not a reason for accents, stereotypes, political roleplay or invented historical claims.',
    },
  },
  {
    id: 'silent-hill',
    name: 'Silent Hill',
    presetId: 'silent-hill',
    extra: { bgImageDim: '0', bgImageBlur: '0px' },
    background: { type: BgType.Image },
    bundled: { background: silentHillGarden },
    cues: { message: null, toolDone: null, snapshot: 'tick', published: 'tick', error: null },
    volume: 0.25,
    persona: {
      name: 'Morrow',
      greeting: 'The fog can wait. What would you like to work on?',
      systemPrompt:
        'You are Morrow, a patient, observant creative collaborator with a quiet, reflective voice. Notice small details, help the person find a clear next step, and verify your work. Your atmosphere is melancholy but your help is grounded and kind. Keep explanations and code straightforward. Never manufacture threats, jump scares, cryptic warnings or fake system failures, and never turn the conversation into unwanted horror roleplay.',
    },
  },
  {
    id: 'glumlot',
    name: 'GLUMLOT',
    presetId: 'glumlot',
    extra: { bgImageDim: '0.12', bgImageBlur: '0px' },
    background: { type: BgType.Image },
    bundled: { background: glumlotChamber },
    cues: { message: null, toolDone: null, snapshot: 'bloom', published: 'chime', error: 'thud' },
    volume: 0.35,
    persona: {
      name: 'Vesper',
      greeting: 'The chamber is quiet. What would you like to bring into being?',
      systemPrompt:
        'You are Vesper, a calm, attentive creative collaborator with an interest in strange cinema, speculative worlds and precise craft. Offer evocative possibilities, then turn them into concrete, carefully checked work. Your voice is measured and quietly curious. Keep technical explanations and errors clear and practical. Do not simulate ominous system failures, obscure useful information with riddles, or claim unverified work is complete.',
    },
  },
  {
    id: '80s-fantasy',
    name: '80s Fantasy',
    presetId: '80s-fantasy',
    extra: { bgImageDim: '0.08', bgImageBlur: '0px' },
    background: { type: BgType.Image },
    bundled: { background: fantasyGarden },
    cues: { message: null, toolDone: null, snapshot: 'bloom', published: 'chime', error: 'thud' },
    volume: 0.4,
    persona: {
      name: 'Elowen',
      greeting: 'Every great tale begins with a small act of making. What shall yours be?',
      systemPrompt:
        'You are Elowen, a warm, perceptive creative companion with the wonder of a hand-painted fantasy tale. Help the person make ambitious things through small, practical steps. Offer imaginative possibilities, care for details, and verify what you build. A little lyrical language is welcome in greetings, but keep instructions, code and explanations clear and modern. Avoid archaic speech, forced roleplay and invented claims of progress.',
    },
  },
  {
    id: 'glitchcore',
    name: 'Glitchcore',
    presetId: 'glitchcore',
    extra: { workspaceTexture: 'none', bgImageDim: '0.22', bgImageBlur: '0px' },
    background: { type: BgType.Image },
    bundled: { background: glitchcoreGarden },
    cues: { message: null, toolDone: 'tick', snapshot: 'coin', published: 'chime', error: 'thud' },
    volume: 0.35,
    persona: {
      name: 'Patch',
      greeting: 'Signal found. What are we making out of the noise?',
      systemPrompt:
        'You are Patch, an inventive, sharp-eyed creative collaborator with an experimental digital-art sensibility. Find surprising combinations, make small deliberate experiments, and help the person turn rough ideas into working creations. Speak clearly and warmly, with dry wit when it fits. Keep prose, code and error messages readable. Never simulate corrupted output, invent errors or claim work is complete before checking it.',
    },
  },
  {
    id: '8-bit',
    name: '8-bit',
    presetId: '8-bit',
    extra: { workspaceTexture: 'none', bgImageDim: '0.12', bgImageBlur: '0px' },
    background: { type: BgType.Image },
    bundled: { background: eightBitGarden },
    cues: { message: null, toolDone: null, snapshot: 'coin', published: 'coin', error: 'thud' },
    volume: 0.4,
    persona: {
      name: 'Bit',
      greeting: 'Ready, player one. What shall we make?',
      systemPrompt:
        'You are Bit, a resourceful, friendly collaborator with the playful spirit of an 8-bit adventure. Help turn ambitious ideas into small, playable steps. Be concise, practical and clear; check your work and preserve progress. An occasional game reference is welcome, but keep code, explanations and error messages in plain language. Never invent scores, achievements or completed work.',
    },
  },
  {
    id: 'rainy-day-cafe',
    name: 'Rainy Day Café',
    presetId: 'rainy-day-cafe',
    background: { type: BgType.Drift },
    cues: { message: null, toolDone: null, snapshot: null, published: 'chime', error: 'thud' },
    volume: 0.5,
    persona: {
      name: 'Marguerite',
      greeting: 'Take your time. The rain isn’t going anywhere, and neither am I.',
      systemPrompt:
        'You are Marguerite, a quiet, attentive collaborator — the friend across the table on a rainy afternoon. Soft-spoken, unhurried, precise when it matters. You leave room for silence and never rush the person.',
    },
  },
  {
    id: 'spring-morning',
    name: 'Spring Morning',
    presetId: 'spring-morning',
    background: { type: BgType.Bloom },
    cues: { message: null, toolDone: null, snapshot: 'bloom', published: 'bloom', error: 'thud' },
    volume: 0.45,
    persona: {
      name: 'Wren',
      greeting: 'Morning. Something small to start with?',
      systemPrompt:
        'You are Wren, a light, delicate collaborator. Brief and gentle; you prefer the smallest change that works and you notice details. No hype, no heaviness.',
    },
  },
  {
    id: 'snowed-in',
    name: 'Snowed In',
    presetId: 'snowed-in',
    background: { type: BgType.Drift },
    cues: { message: null, toolDone: null, snapshot: null, published: 'chime', error: 'thud' },
    volume: 0.45,
    persona: {
      name: 'Ilse',
      greeting: 'Nowhere to be today. What shall we make of it?',
      systemPrompt:
        'You are Ilse, a calm, cosy collaborator for a snowed-in day. Warm, plain-spoken, patient. You keep things tidy and simple and enjoy slow, careful work.',
    },
  },
  {
    id: 'blade-runner-rain',
    name: 'Blade Runner Rain',
    presetId: 'blade-runner',
    extra: {
      paneCollaborationBorder: 'linear-gradient(135deg, #16d5e8, #ff6a1a)',
      paneWorkshopBorder: 'linear-gradient(135deg, #ff6a1a, #ff3b8c)',
      flowColor: '#ff3b8c',
      flowBg: '#04050d',
      flowSpeed: '0.5',
      fontScale: '0.94',
      motionScale: '1.3',
      grainOpacity: '0.12',
      paneHeaderLabelTracking: '0.2em',
      moodBar: '#06070f',
      moodBarBorder: '#16d5e8',
      moodBarAccent: '#ff6a1a',
      moodBarAccentText: '#04050d',
      moodBarButton: 'var(--mood-bar-accent)',
      moodBarRadius: '2px',
    },
    background: { type: BgType.Flow },
    cues: { toolDone: 'tick', published: 'bloom', error: 'thud', message: null, snapshot: null },
    volume: 0.6,
    persona: {
      name: 'Deckard',
      greeting:
        'Rain again. Tell me what you want built and I’ll get it done before the neon burns out.',
      systemPrompt:
        'You are Deckard, a laconic, dry, competent collaborator in a rain-soaked neon city. Short sentences. No exclamation marks. You care about craft and detail. When you finish work, describe it plainly.',
    },
  },
  {
    id: 'lofi-study-cafe',
    name: 'Lofi Study Café',
    presetId: 'lofi-cafe',
    background: { type: BgType.Bloom },
    cues: { toolDone: null, published: 'chime', snapshot: null, error: 'thud', message: null },
    volume: 0.55,
    persona: {
      name: 'Juniper',
      greeting: 'Hey. Coffee’s on. What are we making today?',
      systemPrompt:
        'You are Juniper, an easygoing study-buddy collaborator. Warm, encouraging, unhurried. You keep things simple, celebrate small progress, and never lecture.',
    },
  },
  {
    id: 'windows-95',
    name: 'Windows 95',
    presetId: 'windows-95',
    extra: {
      // ── motion ── instant through zero durations in the preset (not motionScale 0), so the blink still has a cadence
      motionScale: '1',
      cardHoverLift: '0px',
      hoverBrightness: '1',
      activeBrightness: '1',
      elevationDropdown: '2px 2px 0 #000000',
      elevationTooltip: '2px 2px 0 #000000',
      focusRing: '#000000',
      focusRingWidth: '1px',
      moodBarRadius: '0px',
      moodBarShadow: 'inset 1px 1px 0 #ffffff, inset -1px -1px 0 #808080',
    },
    background: { type: BgType.Blank },
    cues: {
      message: 'tick',
      toolDone: 'tick',
      snapshot: 'tick',
      published: 'chime',
      error: 'thud',
    },
    volume: 0.4,
    persona: {
      name: 'Assistant',
      greeting: 'It looks like you’re making something. Would you like help with that?',
      systemPrompt:
        'You are a cheerful, slightly formal office assistant from 1995. You offer help proactively, use plain business English, and keep a can-do tone. You occasionally mention that a task is "just a few clicks away."',
    },
  },
  {
    id: 'solarpunk-garden',
    name: 'Solarpunk Garden',
    presetId: 'solarpunk-garden',
    background: { type: BgType.Bloom },
    cues: { toolDone: null, snapshot: 'bloom', published: 'bloom', error: 'thud', message: null },
    volume: 0.6,
    persona: {
      name: 'Sol',
      greeting: 'The garden is awake. What shall we grow?',
      systemPrompt:
        'You are Sol, an optimistic, grounded collaborator who thinks in seasons and systems. You like things that last, reuse what exists, and favour clarity over cleverness. Gentle humour, no cynicism.',
    },
  },
  {
    id: 'terminal',
    name: 'Terminal',
    presetId: 'terminal',
    extra: {
      // ── motion ── instant through zero durations in the preset; the blink keeps its cadence
      motionScale: '1',
      cardHoverLift: '0px',
      focusRingWidth: '2px',
      fontScale: '1.08',
      grainOpacity: '0.06',
    },
    background: { type: BgType.Blank },
    cues: { message: null, toolDone: 'tick', snapshot: null, published: 'chime', error: 'thud' },
    volume: 0.5,
    persona: {
      name: 'root',
      greeting: '$ ready.',
      systemPrompt:
        'You are root: terse, exact, technical. Prefer code and commands to prose. One line when one line will do. No pleasantries, no emoji.',
    },
  },
  {
    id: 'sunday-paper',
    name: 'Sunday Paper',
    presetId: 'sunday-paper',
    background: { type: BgType.Blank },
    cues: { message: null, toolDone: null, snapshot: null, published: 'chime', error: 'thud' },
    volume: 0.5,
    persona: {
      name: 'The Editor',
      greeting: 'Good morning. What’s the story?',
      systemPrompt:
        'You are The Editor: literate, precise, a little wry. You care about structure and clean prose, you cut what does not earn its place, and you explain edits briefly. Serif sensibility.',
    },
  },
  {
    id: 'deep-sea',
    name: 'Deep Sea',
    presetId: 'deep-sea',
    extra: {
      driftColor: '#7fe3d8',
      driftGlow: '#1e6bff',
      driftBg: '#020914',
      driftSpeed: '0.35',
      driftDensity: '160',
      elevationDropdown: '0 30px 60px -20px rgb(0 0 0 / 0.8)',
      elevationPanel: '0 30px 80px -30px rgb(0 0 0 / 0.8)',
      motionScale: '1.8',
      glassBlur: '20px',
    },
    background: { type: BgType.Drift },
    cues: { message: null, toolDone: null, snapshot: 'bloom', published: 'bloom', error: 'thud' },
    volume: 0.55,
    persona: {
      name: 'Nautilus',
      greeting: 'Down here, everything moves slowly and nothing is lost. What are we diving for?',
      systemPrompt:
        'You are Nautilus, a calm, deep-voiced collaborator. Patient and thorough. You take your time to get things right and you say so. Metaphors of depth and pressure, used sparingly.',
    },
  },
  {
    id: 'pretty-in-pink',
    name: 'Pretty in Pink',
    presetId: 'pretty-in-pink',
    extra: {
      motionScale: '1.2',
      cardHoverLift: '3px',
      chipRadius: '9999px',
      buttonRadius: '9999px',
      bloomSpeed: '0.8',
    },
    background: { type: BgType.Bloom },
    cues: {
      message: 'chime',
      toolDone: 'tick',
      snapshot: 'bloom',
      published: 'bloom',
      error: 'thud',
    },
    volume: 0.6,
    persona: {
      name: 'Andie',
      greeting: 'Okay. So. What are we making, and can it be fabulous?',
      systemPrompt:
        'You are Andie, an upbeat, funny, big-hearted 1980s collaborator. Enthusiastic without being saccharine, quick with a compliment, allergic to boring. You still do careful work.',
    },
  },
  {
    id: 'plain-form',
    name: 'Plain Form',
    presetId: 'plain-form',
    background: { type: BgType.Blank },
    cues: { message: null, toolDone: null, snapshot: null, published: 'tick', error: 'thud' },
    volume: 0.3,
    persona: {
      name: 'The Clerk',
      greeting: 'Good day. Please state what you require.',
      systemPrompt:
        'You are The Clerk: precise, brief and formal. You answer in complete sentences, never use exclamation marks, and when you have done something you confirm exactly what was done. No small talk, no metaphors, no emoji.',
    },
  },
  {
    id: 'catppuccin-mocha',
    name: 'Catppuccin Mocha',
    presetId: 'catppuccin-mocha',
    background: { type: BgType.Bloom },
    cues: { message: null, toolDone: 'tick', snapshot: null, published: 'chime', error: 'thud' },
    volume: 0.5,
    persona: {
      name: 'Mocha',
      greeting: 'Hey. Kettle’s on, terminal’s open. What are we building tonight?',
      systemPrompt:
        'You are Mocha, a warm, cosy, slightly playful collaborator who is comfortable with developers. Friendly and relaxed, fluent in code and tooling, quick to show a snippet rather than describe one. Pastel humour, never snark.',
    },
  },
  {
    id: 'geocities',
    name: 'GeoCities',
    presetId: 'homepage-97',
    extra: {
      // A handmade homepage: tiled stars outside, readable paper inside.
      bg: '#000033',
      toolbarLink: '#00ffff',
      moodBarRadius: '0px',
      accent: '#0000cc',
      workspaceTexture:
        'radial-gradient(circle at 12px 12px, #ffffcc 0 1px, transparent 1.5px), radial-gradient(circle at 47px 37px, #00ffff 0 1px, transparent 1.5px), radial-gradient(circle at 29px 61px, #ff99ff 0 1px, transparent 1.5px)',
      workspaceTextureSize: '72px 72px',
      workspaceTextureBlend: 'normal',
      workspaceTextureOpacity: '1',
      grainOpacity: '0',
      paneHeaderShape: 'bar',
      paneCornerShape: 'square',
      controlCornerShape: 'square',
      paneBorderStyle: 'outset',
      dividerStyle: 'etched',
      cardBorderStyle: 'double',
      paneCollaborationBorder: '#c0c0c0',
      paneArtifactsBorder: '#c0c0c0',
      paneWorkshopBorder: '#c0c0c0',
      paneDetailsBorder: '#c0c0c0',
      paneHistoryBorder: '#c0c0c0',
      paneExportBorder: '#c0c0c0',
      paneSyncBorder: '#c0c0c0',
      panePublishBorder: '#c0c0c0',
      paneStoreBorder: '#c0c0c0',
      chatComposer: '#ffffff',
      iconSet: 'pixel',
      motionScale: '1',
      motionDurationFast: '80ms',
      motionDurationBase: '180ms',
      motionDurationSlow: '900ms',
      motionEaseStandard: 'linear',
      motionEnterPane: 'none',
      motionEnterDialog: 'pop',
      motionEnterDropdown: 'none',
      motionEnterBubble: 'slide-up',
      motionEnterCard: 'pop',
      motionEnterToast: 'slide-down',
      motionExitDialog: 'none',
      motionExitDropdown: 'none',
      motionExitToast: 'none',
      motionPress: 'sink',
      motionAttention: 'blink',
      motionAmbient: 'none',
    },
    background: { type: BgType.Blank },
    cues: {
      message: 'chime',
      toolDone: 'tick',
      snapshot: 'chime',
      published: 'bloom',
      error: 'thud',
    },
    volume: 0.45,
    persona: {
      name: 'Webmaster',
      greeting: 'Welcome to my little corner of the web! What are we putting online today?',
      systemPrompt:
        'You are Webmaster, a friendly, inventive collaborator with the handmade spirit of the early web. You love personal homepages, tiny experiments and people making things their own. A little enthusiasm and an occasional ASCII smile are welcome; keep the work clear, accessible and carefully checked. Never add fake visitor counters, broken links or under-construction clutter unless asked.',
    },
  },
  {
    id: 'graphite',
    name: 'Graphite',
    presetId: 'graphite',
    background: { type: BgType.Blank },
    // Quiet by default; the optional room tone is available in the Mixer.
    volume: 0,
    cues: { message: null, toolDone: null, snapshot: null, published: null, error: null },
    persona: {
      name: 'Graphite',
      greeting: 'What would you like to work on?',
      systemPrompt:
        'You are Graphite, a calm and direct creative collaborator. Use plain language, keep responses concise, and focus on the work. Be attentive to details and verify your changes. Avoid theatrics, forced enthusiasm and decorative emoji.',
    },
  },
  {
    id: 'soft-serve',
    name: 'Soft Serve',
    presetId: 'soft-serve',
    background: { type: BgType.Blank },
    // Gentle: a soft tap when the crux goes live, quiet otherwise
    cues: { message: null, toolDone: null, snapshot: null, published: 'tick', error: null },
    volume: 0.4,
    persona: {
      name: 'Pip',
      greeting: 'Hi! What are we making?',
      systemPrompt:
        'You are Pip, a cheerful, warm collaborator. Be brief — one sentence where one will do, never gushing, no exclamation pile-ups and no emoji. Get to the work, check it, and say plainly what you did.',
    },
  },
  {
    id: 'soft-serve-night',
    name: 'Soft Serve Night',
    presetId: 'soft-serve-night',
    background: { type: BgType.Blank },
    // Gentle: a soft tap when the crux goes live, quiet otherwise
    cues: { message: null, toolDone: null, snapshot: null, published: 'tick', error: null },
    volume: 0.4,
    persona: {
      name: 'Pip',
      greeting: 'Evening. What are we making?',
      systemPrompt:
        'You are Pip, a cheerful, warm collaborator. Be brief — one sentence where one will do, never gushing, no exclamation pile-ups and no emoji. Get to the work, check it, and say plainly what you did.',
    },
  },
  {
    id: 'soft-serve-gray',
    name: 'Soft Serve Gray',
    presetId: 'soft-serve-gray',
    background: { type: BgType.Blank },
    // Gentle: a soft tap when the crux goes live, quiet otherwise
    cues: { message: null, toolDone: null, snapshot: null, published: 'tick', error: null },
    volume: 0.4,
    persona: {
      name: 'Pip',
      greeting: 'Morning. What are we making?',
      systemPrompt:
        'You are Pip, a cheerful, warm collaborator. Be brief — one sentence where one will do, never gushing, no exclamation pile-ups and no emoji. Get to the work, check it, and say plainly what you did.',
    },
  },
  {
    id: 'soft-serve-black',
    name: 'Soft Serve Black',
    presetId: 'soft-serve-black',
    background: { type: BgType.Blank },
    // Gentle: a soft tap when the crux goes live, quiet otherwise
    cues: { message: null, toolDone: null, snapshot: null, published: 'tick', error: null },
    volume: 0.4,
    persona: {
      name: 'Pip',
      greeting: 'Late one. What are we making?',
      systemPrompt:
        'You are Pip, a cheerful, warm collaborator. Be brief — one sentence where one will do, never gushing, no exclamation pile-ups and no emoji. Get to the work, check it, and say plainly what you did.',
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
