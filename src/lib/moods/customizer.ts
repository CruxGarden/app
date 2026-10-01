import { GARDEN_DARK } from './garden-dark';

type Tokens = Record<string, string>;
export interface CustomizerChoice {
  label: string;
  tokens: Tokens;
}
export interface CustomizerGroup {
  id: string;
  label: string;
  hint: string;
  choices: CustomizerChoice[];
}

function corners(radius: number): Tokens {
  const size = `${radius}px`;
  const small = `${Math.min(radius, 8)}px`;
  const tokens: Tokens = {
    radius: size,
    radiusSm: small,
    radiusLg: size,
    paneRadius: size,
    paneHeaderRadius: small,
    buttonRadius: small,
    inputRadius: small,
    cardRadius: size,
    paneCornerShape: 'round',
    controlCornerShape: 'round',
  };
  // A high-level choice includes pane-specific overrides from the worn Mood.
  for (const key of Object.keys(GARDEN_DARK)) {
    if (/^pane[A-Z].*Radius$/.test(key)) tokens[key] = key.includes('Header') ? small : size;
    if (/^pane[A-Z].*RadiusSm$/.test(key)) tokens[key] = small;
  }
  return tokens;
}
function typeface(font: string): Tokens {
  return { fontBody: font, fontDisplay: font, fontReading: font };
}
function depth(shadow: string, elevation: string): Tokens {
  return {
    elevationPane: shadow,
    elevationPanel: shadow,
    elevationCard: shadow,
    elevationCardHover: shadow,
    elevationModal: shadow,
    elevationDropdown: shadow,
    elevationButton: shadow,
    elevationPrimaryButton: shadow,
    plasmaElevation: elevation,
  };
}

/** Named edits to ordinary tokens, shared with the full builder and portable packages. */
export const CUSTOMIZER_GROUPS: CustomizerGroup[] = [
  {
    id: 'typeface',
    label: 'Typeface',
    hint: 'Set the interface and reading font together.',
    choices: [
      { label: 'Clean', tokens: typeface("'Inter', sans-serif") },
      { label: 'Bookish', tokens: typeface('Georgia, serif') },
      { label: 'Monospace', tokens: typeface("'JetBrains Mono', monospace") },
    ],
  },
  {
    id: 'surface',
    label: 'Surface',
    hint: 'Opaque paper, translucent glass, or flowing Plasma.',
    choices: [
      { label: 'Solid', tokens: { surfaceStyle: 'solid' } },
      { label: 'Glass', tokens: { surfaceStyle: 'glass' } },
      { label: 'Plasma', tokens: { surfaceStyle: 'plasma' } },
    ],
  },
  {
    id: 'spacing',
    label: 'Spacing',
    hint: 'Give panels and their contents more breathing room.',
    choices: [
      {
        label: 'Compact',
        tokens: { density: '0.9', paneGap: '6px', workspacePadding: '6px', paneBodyPadding: '8px' },
      },
      {
        label: 'Comfortable',
        tokens: {
          density: '1',
          paneGap: '10px',
          workspacePadding: '10px',
          paneBodyPadding: '12px',
        },
      },
      {
        label: 'Roomy',
        tokens: {
          density: '1.15',
          paneGap: '16px',
          workspacePadding: '16px',
          paneBodyPadding: '16px',
        },
      },
    ],
  },
  {
    id: 'corners',
    label: 'Corners',
    hint: 'Coordinate the corners of panels, cards and controls.',
    choices: [
      { label: 'Square', tokens: corners(0) },
      { label: 'Soft', tokens: corners(8) },
      { label: 'Round', tokens: corners(16) },
    ],
  },
  {
    id: 'depth',
    label: 'Depth',
    hint: 'Coordinate shadows and Plasma elevation.',
    choices: [
      { label: 'Flat', tokens: depth('0 0 0 transparent', '0') },
      {
        label: 'Gentle',
        tokens: depth('0 2px 6px color-mix(in srgb, var(--text) 12%, transparent)', '0.3'),
      },
      {
        label: 'Floating',
        tokens: depth('0 8px 24px color-mix(in srgb, var(--text) 20%, transparent)', '0.7'),
      },
    ],
  },
  {
    id: 'motion',
    label: 'Motion',
    hint: 'Your personal motion setting and reduced-motion preference still apply.',
    choices: [
      {
        label: 'Still',
        tokens: { motionScale: '0', motionIntensity: 'off', motionAmbient: 'none' },
      },
      {
        label: 'Calm',
        tokens: { motionScale: '0.6', motionIntensity: 'subtle', motionAmbient: 'none' },
      },
      {
        label: 'Lively',
        tokens: { motionScale: '1', motionIntensity: 'normal', motionAmbient: 'breathe' },
      },
    ],
  },
];

export const CUSTOMIZER_KEYS = new Set([
  'fontScale',
  'accent',
  'bg',
  'plasmaBackground',
  ...CUSTOMIZER_GROUPS.flatMap((group) =>
    group.choices.flatMap((choice) => Object.keys(choice.tokens)),
  ),
]);

export function resetCustomizer(overrides: Tokens): Tokens {
  return Object.fromEntries(Object.entries(overrides).filter(([key]) => !CUSTOMIZER_KEYS.has(key)));
}
