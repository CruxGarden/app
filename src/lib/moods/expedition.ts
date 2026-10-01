import type { MoodPresetDef } from './presets';

/** Construction paper, drawn entirely with portable Mood tokens. No images or AI required. */
const PAPERS = [
  {
    id: 'sunflower',
    name: 'Sunflower',
    ground: '#fff6dd',
    accent: '#3731a6',
    nightAccent: '#c2b3ff',
    wash: '#e5e0f9',
  },
  {
    id: 'lagoon',
    name: 'Lagoon',
    ground: '#e8f7f1',
    accent: '#145d69',
    nightAccent: '#8cddd5',
    wash: '#caeae5',
  },
  {
    id: 'berry',
    name: 'Berry',
    ground: '#fff0f3',
    accent: '#86265a',
    nightAccent: '#ffadce',
    wash: '#f7d7e8',
  },
];
const PANES = [
  'Collaboration',
  'Artifacts',
  'Workshop',
  'Details',
  'History',
  'Export',
  'Sync',
  'Publish',
  'Store',
  'Tasks',
  'Synth',
  'Browser',
  'Settings',
  'Explore',
  'Mood',
];
const SHEETS = ['#ffc1ad', '#ffdc64', '#b8e6f1', '#afd784', '#dacdfa', '#a2dce8'];
const INKS = ['#8b3540', '#76520d', '#205971', '#355c25', '#57418a', '#235e68'];
const NIGHT_SHEETS = ['#412e37', '#403924', '#253b47', '#2d3e2d', '#37314c', '#263d41'];
const NIGHT_INKS = ['#ffb4a8', '#ffe08c', '#a2d9ef', '#b7dc94', '#d2bdff', '#9edfdc'];

function paperPalette(paper: (typeof PAPERS)[number], dark: boolean): Record<string, string> {
  const ink = dark ? '#faf1de' : '#282b4c';
  const muted = dark ? '#c6bdd3' : '#535475';
  const panel = dark ? '#262637' : '#fffdf5';
  const line = dark ? '#a39ab7' : '#625778';
  const accent = dark ? paper.nightAccent : paper.accent;
  const shadow = dark ? '#0b0b18aa' : '#282b4c30';
  const panes: Record<string, string> = {};
  PANES.forEach((pane, i) => {
    const prefix = `pane${pane}`;
    const color = (dark ? NIGHT_INKS : INKS)[i % INKS.length]!;
    const sheet = (dark ? NIGHT_SHEETS : SHEETS)[i % SHEETS.length]!;
    Object.assign(panes, {
      [prefix]: color,
      [`${prefix}Header`]: sheet,
      [`${prefix}HeaderText`]: ink,
      [`${prefix}HeaderIcon`]: color,
      [`${prefix}HeaderClose`]: ink,
      [`${prefix}HeaderBorder`]: 'transparent',
      [`${prefix}Body`]: `color-mix(in srgb, ${sheet} 24%, ${panel})`,
      [`${prefix}Border`]: line,
      [`${prefix}Heading`]: ink,
    });
  });
  return {
    ...panes,
    bg: dark ? '#191a29' : paper.ground,
    panel,
    surface: dark ? '#333245' : '#f4eddd',
    surfaceSolid: panel,
    text: ink,
    textMuted: muted,
    accent,
    border: line,
    error: dark ? '#ffa5b5' : '#a72e48',
    warning: dark ? '#ffda78' : '#795309',
    success: dark ? '#b1dc8c' : '#365e28',
    accentMuted: dark ? '#3b344e' : paper.wash,
    surfaceStyle: 'solid',
    primaryButton: accent,
    primaryButtonHover: `color-mix(in srgb, ${accent} 88%, ${ink})`,
    primaryButtonText: dark ? '#191a29' : '#ffffff',
    primaryButtonBorder: line,
    primaryButtonBorderHover: ink,
    actionButton: panel,
    actionButtonBorder: line,
    actionButtonHover: dark ? '#443f56' : paper.wash,
    actionButtonBorderHover: ink,
    placeholder: muted,
    input: panel,
    inputBorder: line,
    buttonBorderWidth: '2px',
    buttonFillOverlay: 'none',
    buttonRadius: '6px 3px 7px 4px',
    cardRadius: '4px 12px 4px 10px',
    radius: '8px',
    radiusSm: '4px',
    radiusLg: '12px',
    paneRadius: '8px',
    paneBorderWidth: '2px',
    paneGap: '10px',
    workspacePadding: '10px',
    paneHeaderPadding: '6px',
    paneHeaderHeight: '30px',
    paneHeaderRadius: '4px',
    paneBodyPadding: '12px',
    paneHeaderLabelWeight: '700',
    paneHeaderLabelCase: 'none',
    paneHeaderLabelTracking: '0.02em',
    paneHeaderLabelSize: '12px',
    paneCornerShape: 'round',
    controlCornerShape: 'round',
    paneBorderStyle: 'solid',
    paneHeaderShape: 'bar',
    dividerStyle: 'hairline',
    fontWeightDisplay: '800',
    letterSpacingDisplay: '-0.025em',
    elevationPane: `4px 5px 0 ${shadow}`,
    elevationPanel: `4px 5px 0 ${shadow}`,
    elevationCard: `3px 4px 0 ${shadow}`,
    elevationCardHover: `4px 6px 0 ${shadow}`,
    elevationButton: `2px 3px 0 ${shadow}`,
    elevationPrimaryButton: `2px 3px 0 ${shadow}`,
    elevationModal: `7px 8px 0 ${shadow}`,
    elevationDropdown: `3px 4px 0 ${shadow}`,
    elevationTooltip: `2px 3px 0 ${shadow}`,
    workspaceTexture: `radial-gradient(${dark ? '#b7a5d526' : '#d49b4040'} 1px, transparent 1px)`,
    workspaceTextureSize: '11px 11px',
    workspaceTextureOpacity: '1',
    motionPress: 'sink',
    motionIntensity: 'subtle',
    motionAmbient: 'none',
    motionEnterPane: 'none',
    motionEnterDialog: 'fade',
    motionExitDialog: 'fade',
    cardHoverLift: '2px',
    reactBackgroundActivity: '0',
  };
}

export const EXPEDITION_PRESETS: MoodPresetDef[] = PAPERS.flatMap((paper) =>
  [false, true].map((dark) => ({
    id: `expedition-${paper.id}-${dark ? 'dark' : 'light'}`,
    name: `Expedition ${paper.name} ${dark ? 'Dark' : 'Light'}`,
    section: dark ? ('Dark' as const) : ('Light' as const),
    overrides: paperPalette(paper, dark),
  })),
);
