/**
 * Mood Presets — 30 curated palettes (15 dark, 15 light)
 *
 * Each preset is a set of CSS variable overrides layered on Garden Dark.
 * They vary in: shade, structure, saturation, warmth, contrast, and vibe.
 */

export interface MoodPresetDef {
  id: string;
  name: string;
  section: 'Dark' | 'Light';
  overrides: Record<string, string>;
}

// Helper: generate pane header/button overrides for a "solid header" style
function solidPanes(panes: Record<string, string>, textOnColor = '#ffffff', textOnLight = '#000000') {
  const result: Record<string, string> = {};
  for (const [key, color] of Object.entries(panes)) {
    const prefix = key; // e.g. 'paneCollaboration'
    const isLight = parseInt(color.slice(1, 3), 16) > 180;
    const text = isLight ? textOnLight : textOnColor;
    result[`${prefix}Header`] = color;
    result[`${prefix}HeaderBorder`] = 'transparent';
    result[`${prefix}HeaderText`] = text;
    result[`${prefix}HeaderIcon`] = text;
    result[`${prefix}HeaderClose`] = text;
    result[`${prefix}ButtonActive`] = color;
    result[`${prefix}ButtonIconActive`] = text;
    result[`${prefix}ButtonBorderActive`] = 'transparent';
  }
  return result;
}

// Helper: "flat" style — dark header, colored text/border only
function flatPanes(panes: Record<string, string>, headerBg: string, closeMuted: string) {
  const result: Record<string, string> = {};
  for (const [key, color] of Object.entries(panes)) {
    const prefix = key;
    result[`${prefix}Header`] = headerBg;
    result[`${prefix}HeaderBorder`] = color;
    result[`${prefix}HeaderText`] = color;
    result[`${prefix}HeaderIcon`] = color;
    result[`${prefix}HeaderClose`] = closeMuted;
    result[`${prefix}ButtonActive`] = headerBg;
    result[`${prefix}ButtonIconActive`] = color;
    result[`${prefix}ButtonBorderActive`] = color;
  }
  return result;
}

// Helper: "ghost" style — transparent header, no borders, just tinted text
function ghostPanes(panes: Record<string, string>, headerBg: string, closeMuted: string) {
  const result: Record<string, string> = {};
  for (const [key, color] of Object.entries(panes)) {
    const prefix = key;
    result[`${prefix}Header`] = headerBg;
    result[`${prefix}HeaderBorder`] = 'transparent';
    result[`${prefix}HeaderText`] = color;
    result[`${prefix}HeaderIcon`] = color;
    result[`${prefix}HeaderClose`] = closeMuted;
    result[`${prefix}ButtonActive`] = headerBg;
    result[`${prefix}ButtonIconActive`] = color;
    result[`${prefix}ButtonBorderActive`] = 'transparent';
  }
  return result;
}

// Helper: "uniform" style — all panes same color
function uniformPanes(color: string, headerBg: string, _text: string, closeMuted: string) {
  const panes = {
    paneCollaboration: color, paneArtifacts: color, paneWorkshop: color, paneDetails: color,
    paneHistory: color, paneExport: color, paneSync: color, panePublish: color,
  };
  return { ...panes, ...ghostPanes(panes, headerBg, closeMuted) };
}

// Syntax colors for light backgrounds — dark saturated tones with good contrast
// Light syntax colors use var() references so they follow the mood's palette
const LIGHT_SYNTAX = {
  syntaxComment: 'var(--text-muted)',
  syntaxKeyword: 'var(--accent)',
  syntaxString: 'var(--pane-details)',    // green pane
  syntaxNumber: 'var(--pane-artifacts)',   // orange pane
  syntaxType: 'var(--pane-export)',        // blue pane
  syntaxFunction: 'var(--pane-workshop)',  // gold pane
  syntaxPunctuation: 'var(--text-muted)',
  syntaxVariable: 'var(--pane-history)',   // teal pane
  syntaxTag: 'var(--pane-collaboration)',  // rose pane
  syntaxAttribute: 'var(--pane-workshop)', // gold pane
};

const MID_SYNTAX = { ...LIGHT_SYNTAX };

const PANES_DEFAULT = {
  paneCollaboration: '#d47080', paneArtifacts: '#d4944c', paneWorkshop: '#c8a84c', paneDetails: '#5cb87a',
  paneHistory: '#4cb8b0', paneExport: '#5b9ed4', paneSync: '#8c7cc8', panePublish: '#c87ca8',
};

export const MOOD_PRESETS: MoodPresetDef[] = [
  // ════════════════════════════════════════════════════
  // DARK
  // ════════════════════════════════════════════════════

  { id: 'garden', name: 'Garden', section: 'Dark', overrides: {} },

  { id: 'void', name: 'Void', section: 'Dark', overrides: {
    bg: '#000000', surface: '#050505', panel: '#0a0a0a',
    accent: '#ffffff', border: 'rgba(255,255,255,0.05)',
    text: '#d0d0d0', textMuted: '#505050',
    ...uniformPanes('#808080', '#0e0e0e', '#808080', '#404040'),
    // Muted garden bloom colors
    bloom1: '#1a5a99', bloom2: '#8a4a99', bloom3: '#4a8a99',
    bloom4: '#994a3a', bloom5: '#7a7a3a', bloom6: '#3a8a7a',
  }},

  { id: 'snowblack', name: 'Snowblack', section: 'Dark', overrides: {
    bg: '#060606', surface: '#0c0c0c', panel: '#111111',
    accent: '#888888', border: 'rgba(255,255,255,0.04)',
    text: '#b0b0b0', textMuted: '#505050',
    bloom1: '#1a5a99', bloom2: '#8a4a99', bloom3: '#4a8a99',
    bloom4: '#994a3a', bloom5: '#7a7a3a', bloom6: '#3a8a7a',
    paneCollaboration: '#807070', paneArtifacts: '#808070', paneWorkshop: '#708070',
    paneDetails: '#708080', paneHistory: '#707080', paneExport: '#807080',
    paneSync: '#787878', panePublish: '#887878',
    ...ghostPanes({
      paneCollaboration: '#807070', paneArtifacts: '#808070', paneWorkshop: '#708070',
      paneDetails: '#708080', paneHistory: '#707080', paneExport: '#807080',
      paneSync: '#787878', panePublish: '#887878',
    }, '#161616', '#505050'),
  }},

  { id: 'neon', name: 'Neon', section: 'Dark', overrides: {
    bg: '#020204', surface: '#080810', panel: '#0a0a14',
    accent: '#00ffaa', border: 'rgba(0,255,170,0.06)',
    text: '#e8f0f0', textMuted: '#405060',
    paneCollaboration: '#ff2070', paneArtifacts: '#ff6010', paneWorkshop: '#ffcc00',
    paneDetails: '#00ffaa', paneHistory: '#00ccff', paneExport: '#2060ff',
    paneSync: '#aa40ff', panePublish: '#ff20aa',
    ...solidPanes({
      paneCollaboration: '#ff2070', paneArtifacts: '#ff6010', paneWorkshop: '#ffcc00',
      paneDetails: '#00ffaa', paneHistory: '#00ccff', paneExport: '#2060ff',
      paneSync: '#aa40ff', panePublish: '#ff20aa',
    }),
  }},

  { id: 'abyss', name: 'Abyss', section: 'Dark', overrides: {
    bg: '#040810', surface: '#081420', panel: '#0c1c2c',
    accent: '#40c8c0', border: 'rgba(64,200,192,0.10)',
    text: '#b0d8e0', textMuted: '#487888',
    ...PANES_DEFAULT,
  }},

  { id: 'hearth', name: 'Hearth', section: 'Dark', overrides: {
    bg: '#100804', surface: '#1c1208', panel: '#281c0c',
    accent: '#e8a040', border: 'rgba(200,140,40,0.12)',
    text: '#f0dcc0', textMuted: '#907850',
    paneCollaboration: '#d87050', paneArtifacts: '#e8a040', paneWorkshop: '#c8b830',
    paneDetails: '#80b050', paneHistory: '#50a880', paneExport: '#5090b0',
    paneSync: '#9070a0', panePublish: '#c06080',
    ...ghostPanes({
      paneCollaboration: '#d87050', paneArtifacts: '#e8a040', paneWorkshop: '#c8b830',
      paneDetails: '#80b050', paneHistory: '#50a880', paneExport: '#5090b0',
      paneSync: '#9070a0', panePublish: '#c06080',
    }, '#30200c', '#907850'),
  }},

  { id: 'regal', name: 'Regal', section: 'Dark', overrides: {
    bg: '#0a0610', surface: '#140e1c', panel: '#1c1428',
    accent: '#d4a840', border: 'rgba(160,120,40,0.12)',
    text: '#e0d0c8', textMuted: '#806898',
    paneCollaboration: '#d06878', paneArtifacts: '#d4a840', paneWorkshop: '#b8b040',
    paneDetails: '#58b870', paneHistory: '#48a8b8', paneExport: '#5888d0',
    paneSync: '#9868c0', panePublish: '#c860a0',
  }},

  { id: 'cafe', name: 'Café', section: 'Dark', overrides: {
    bg: '#1a1410', surface: '#24201a', panel: '#2e2820',
    accent: '#d8a860', border: 'rgba(120,100,60,0.12)',
    text: '#e0d0b8', textMuted: '#887860',
    paneCollaboration: '#c08868', paneArtifacts: '#d8a860', paneWorkshop: '#b8a868',
    paneDetails: '#88a878', paneHistory: '#80a098', paneExport: '#7890a0',
    paneSync: '#a08888', panePublish: '#b88080',
    ...ghostPanes({
      paneCollaboration: '#c08868', paneArtifacts: '#d8a860', paneWorkshop: '#b8a868',
      paneDetails: '#88a878', paneHistory: '#80a098', paneExport: '#7890a0',
      paneSync: '#a08888', panePublish: '#b88080',
    }, '#362c24', '#887860'),
  }},

  { id: 'darkroom', name: 'Darkroom', section: 'Dark', overrides: {
    bg: '#1e1e1e', surface: '#2d2d2d', panel: '#383838',
    accent: '#2d9cdb', border: 'rgba(0,0,0,0.40)',
    text: '#cccccc', textMuted: '#808080',
    paneCollaboration: '#6cb4ee', paneArtifacts: '#e8a848', paneWorkshop: '#7eb84c',
    paneDetails: '#6cb4ee', paneHistory: '#a0a0a0', paneExport: '#c878c0',
    paneSync: '#6cb4ee', panePublish: '#e86880',
    ...flatPanes({
      paneCollaboration: '#6cb4ee', paneArtifacts: '#e8a848', paneWorkshop: '#7eb84c',
      paneDetails: '#6cb4ee', paneHistory: '#a0a0a0', paneExport: '#c878c0',
      paneSync: '#6cb4ee', panePublish: '#e86880',
    }, '#2d2d2d', '#808080'),
  }},

  { id: 'terminal', name: 'Terminal', section: 'Dark', overrides: {
    bg: '#000800', surface: '#001000', panel: '#001800',
    accent: '#00ff00', border: 'rgba(0,255,0,0.06)',
    text: '#00dd00', textMuted: '#006600',
    ...uniformPanes('#00cc00', '#002000', '#00cc00', '#006600'),
    toolbar: '#001000',
    syntaxComment: '#004400', syntaxKeyword: '#00ff00', syntaxString: '#00bb00',
    syntaxNumber: '#00dd00', syntaxType: '#00cc00', syntaxFunction: '#00ee00', syntaxPunctuation: '#006600',
  }},

  { id: 'solaris', name: 'Solaris', section: 'Dark', overrides: {
    bg: '#002830', surface: '#003840', panel: '#004850',
    accent: '#b58900', border: 'rgba(88,110,117,0.30)',
    text: '#93a1a1', textMuted: '#586e75',
    paneCollaboration: '#dc322f', paneArtifacts: '#cb4b16', paneWorkshop: '#b58900',
    paneDetails: '#859900', paneHistory: '#2aa198', paneExport: '#268bd2',
    paneSync: '#6c71c4', panePublish: '#d33682',
    ...solidPanes({
      paneCollaboration: '#dc322f', paneArtifacts: '#cb4b16', paneWorkshop: '#b58900',
      paneDetails: '#859900', paneHistory: '#2aa198', paneExport: '#268bd2',
      paneSync: '#6c71c4', panePublish: '#d33682',
    }),
  }},

  { id: 'bunker', name: 'Bunker', section: 'Dark', overrides: {
    bg: '#0c0e08', surface: '#161a10', panel: '#202818',
    accent: '#c8b878', border: 'rgba(120,130,80,0.15)',
    text: '#d8d8c0', textMuted: '#808870',
    paneCollaboration: '#b87060', paneArtifacts: '#c8a050', paneWorkshop: '#a0a840',
    paneDetails: '#60a868', paneHistory: '#509898', paneExport: '#6888a8',
    paneSync: '#8878a0', panePublish: '#a87080',
  }},

  { id: 'snowgray', name: 'Snowgray', section: 'Dark', overrides: {
    bg: '#484848', surface: '#525252', panel: '#5a5a5a',
    accent: '#b0b0b0', border: 'rgba(255,255,255,0.08)',
    text: '#d8d8d8', textMuted: '#909090',
    bloom1: '#3a6a99', bloom2: '#8a5a99', bloom3: '#5a8a99',
    bloom4: '#995a4a', bloom5: '#7a7a4a', bloom6: '#4a8a7a',
    paneCollaboration: '#c09090', paneArtifacts: '#c0c090', paneWorkshop: '#90c090',
    paneDetails: '#90c0c0', paneHistory: '#9090c0', paneExport: '#c090c0',
    paneSync: '#a8a8a8', panePublish: '#c0a8a8',
    ...ghostPanes({
      paneCollaboration: '#c09090', paneArtifacts: '#c0c090', paneWorkshop: '#90c090',
      paneDetails: '#90c0c0', paneHistory: '#9090c0', paneExport: '#c090c0',
      paneSync: '#a8a8a8', panePublish: '#c0a8a8',
    }, '#626262', '#909090'),
  }},

  { id: 'geocities', name: 'Geocities', section: 'Dark', overrides: {
    bg: '#008080', surface: '#006868', panel: '#005858',
    accent: '#ffff00', border: 'rgba(255,255,255,0.20)',
    text: '#ffffff', textMuted: '#c0e0e0',
    paneCollaboration: '#ff0000', paneArtifacts: '#ff8800', paneWorkshop: '#ffff00',
    paneDetails: '#00ff00', paneHistory: '#00ffff', paneExport: '#0088ff',
    paneSync: '#8800ff', panePublish: '#ff00ff',
    ...solidPanes({
      paneCollaboration: '#ff0000', paneArtifacts: '#ff8800', paneWorkshop: '#ffff00',
      paneDetails: '#00ff00', paneHistory: '#00ffff', paneExport: '#0088ff',
      paneSync: '#8800ff', panePublish: '#ff00ff',
    }),
    primaryButton: '#ffff00', primaryButtonText: '#000000',
  }},

  { id: 'velvet', name: 'Velvet', section: 'Dark', overrides: {
    bg: '#10080c', surface: '#1c1018', panel: '#281820',
    accent: '#e888a8', border: 'rgba(200,100,140,0.12)',
    text: '#f0d8e0', textMuted: '#906878',
    paneCollaboration: '#e888a8', paneArtifacts: '#e8a888', paneWorkshop: '#d8c878',
    paneDetails: '#88c898', paneHistory: '#88b8c8', paneExport: '#88a0d8',
    paneSync: '#b888d8', panePublish: '#d888b8',
    ...ghostPanes({
      paneCollaboration: '#e888a8', paneArtifacts: '#e8a888', paneWorkshop: '#d8c878',
      paneDetails: '#88c898', paneHistory: '#88b8c8', paneExport: '#88a0d8',
      paneSync: '#b888d8', panePublish: '#d888b8',
    }, '#301820', '#906878'),
  }},

  // ════════════════════════════════════════════════════
  // LIGHT
  // ════════════════════════════════════════════════════

  { id: 'parchment', name: 'Parchment', section: 'Light', overrides: {
    ...LIGHT_SYNTAX,
    bg: '#f4ece0', surface: '#ece2d4', panel: '#e4d8c8',
    accent: '#886838', border: 'rgba(100,70,30,0.15)',
    text: '#2c2010', textMuted: '#887058',
    paneCollaboration: '#b05040', paneArtifacts: '#a07028', paneWorkshop: '#808018',
    paneDetails: '#407830', paneHistory: '#307068', paneExport: '#406090',
    paneSync: '#685088', panePublish: '#904860',
  }},

  { id: 'sky', name: 'Sky', section: 'Light', overrides: {
    ...LIGHT_SYNTAX,
    bg: '#e8f0f8', surface: '#dce8f4', panel: '#d0e0f0',
    accent: '#2870c0', border: 'rgba(40,80,160,0.10)',
    text: '#101830', textMuted: '#5070a0',
    paneCollaboration: '#c04858', paneArtifacts: '#c07828', paneWorkshop: '#909010',
    paneDetails: '#208848', paneHistory: '#188080', paneExport: '#2870c0',
    paneSync: '#5850a8', panePublish: '#a04878',
    ...flatPanes({
      paneCollaboration: '#c04858', paneArtifacts: '#c07828', paneWorkshop: '#909010',
      paneDetails: '#208848', paneHistory: '#188080', paneExport: '#2870c0',
      paneSync: '#5850a8', panePublish: '#a04878',
    }, '#d0e0f0', '#5070a0'),
  }},

  { id: 'blossom', name: 'Blossom', section: 'Light', overrides: {
    ...LIGHT_SYNTAX,
    bg: '#f8eff2', surface: '#f0e4ea', panel: '#e8d8e0',
    accent: '#c06888', border: 'rgba(160,80,100,0.10)',
    text: '#281018', textMuted: '#907080',
    paneCollaboration: '#c06070', paneArtifacts: '#b88038', paneWorkshop: '#889020',
    paneDetails: '#409858', paneHistory: '#308880', paneExport: '#4870a8',
    paneSync: '#7858a0', panePublish: '#c05878',
  }},

  { id: 'snowwhite', name: 'Snowwhite', section: 'Light', overrides: {
    ...LIGHT_SYNTAX,
    bg: '#ffffff', surface: '#f8f8f8', panel: '#f0f0f0',
    accent: '#222222', border: 'rgba(0,0,0,0.06)',
    text: '#111111', textMuted: '#808080',
    ...uniformPanes('#555555', '#e8e8e8', '#555555', '#aaaaaa'),
    // Soft pastel garden bloom colors for light bg
    bloom1: '#6090c0', bloom2: '#a070b8', bloom3: '#60b0c0',
    bloom4: '#c07060', bloom5: '#a0a060', bloom6: '#60b0a0',
  }},

  { id: 'candy', name: 'Candy', section: 'Light', overrides: {
    ...LIGHT_SYNTAX,
    bg: '#f8f0f8', surface: '#f0e8f4', panel: '#ece0f0',
    accent: '#e040a0', border: 'rgba(200,0,150,0.08)',
    text: '#302030', textMuted: '#886888',
    paneCollaboration: '#d02060', paneArtifacts: '#c06010', paneWorkshop: '#8a7800',
    paneDetails: '#108840', paneHistory: '#0898a8', paneExport: '#2060d0',
    paneSync: '#7030d0', panePublish: '#d01888',
    ...solidPanes({
      paneCollaboration: '#d02060', paneArtifacts: '#c06010', paneWorkshop: '#8a7800',
      paneDetails: '#108840', paneHistory: '#0898a8', paneExport: '#2060d0',
      paneSync: '#7030d0', panePublish: '#d01888',
    }),
    chatUserBubble: '#fce0f0', chatUserBubbleText: '#e040a0',
    primaryButton: '#e040a0', primaryButtonText: '#ffffff',
  }},

  { id: 'cubicle', name: 'Cubicle', section: 'Light', overrides: {
    ...MID_SYNTAX,
    bg: '#c8c0b0', surface: '#b8b0a0', panel: '#d0c8b8',
    accent: '#486898', border: 'rgba(0,0,0,0.20)',
    text: '#282018', textMuted: '#706858',
    ...uniformPanes('#405868', '#a8a090', '#383020', '#706858'),
    toolbar: '#b8b0a0',
    primaryButton: '#486898', primaryButtonText: '#e0e0e0',
  }},

  { id: 'meadow', name: 'Meadow', section: 'Light', overrides: {
    ...LIGHT_SYNTAX,
    bg: '#ecf4e8', surface: '#e0edd8', panel: '#d4e6cc',
    accent: '#488038', border: 'rgba(40,80,20,0.12)',
    text: '#182010', textMuted: '#607848',
    paneCollaboration: '#c05848', paneArtifacts: '#b07828', paneWorkshop: '#808818',
    paneDetails: '#488038', paneHistory: '#287868', paneExport: '#386898',
    paneSync: '#685890', panePublish: '#a04868',
    ...ghostPanes({
      paneCollaboration: '#c05848', paneArtifacts: '#b07828', paneWorkshop: '#808818',
      paneDetails: '#488038', paneHistory: '#287868', paneExport: '#386898',
      paneSync: '#685890', panePublish: '#a04868',
    }, '#d4e6cc', '#607848'),
  }},

  { id: 'pearl', name: 'Pearl', section: 'Light', overrides: {
    ...LIGHT_SYNTAX,
    bg: '#f0eff4', surface: '#e6e4ec', panel: '#dcd8e4',
    accent: '#7060a0', border: 'rgba(80,60,120,0.10)',
    text: '#201828', textMuted: '#887898',
    paneCollaboration: '#b06080', paneArtifacts: '#b88040', paneWorkshop: '#909020',
    paneDetails: '#409870', paneHistory: '#308890', paneExport: '#4870b0',
    paneSync: '#7060a0', panePublish: '#b05880',
  }},

  { id: 'sand', name: 'Sand', section: 'Light', overrides: {
    ...LIGHT_SYNTAX,
    bg: '#f0e8d8', surface: '#e8dcc8', panel: '#e0d0b8',
    accent: '#906830', border: 'rgba(100,70,20,0.12)',
    text: '#302010', textMuted: '#907848',
    paneCollaboration: '#b05038', paneArtifacts: '#906818', paneWorkshop: '#707010',
    paneDetails: '#408838', paneHistory: '#307868', paneExport: '#487090',
    paneSync: '#786088', panePublish: '#a05060',
    ...flatPanes({
      paneCollaboration: '#b05038', paneArtifacts: '#906818', paneWorkshop: '#707010',
      paneDetails: '#307828', paneHistory: '#286858', paneExport: '#386080',
      paneSync: '#685078', panePublish: '#904050',
    }, '#e0d0b8', '#907848'),
  }},

  { id: 'frost', name: 'Frost', section: 'Light', overrides: {
    ...LIGHT_SYNTAX,
    bg: '#eef4f6', surface: '#e2ecf0', panel: '#d6e4ea',
    accent: '#2888a0', border: 'rgba(30,100,130,0.10)',
    text: '#102028', textMuted: '#508090',
    paneCollaboration: '#c05060', paneArtifacts: '#b87830', paneWorkshop: '#889018',
    paneDetails: '#288848', paneHistory: '#2888a0', paneExport: '#3870b0',
    paneSync: '#6058a0', panePublish: '#a04880',
  }},

  { id: 'cotton', name: 'Cotton', section: 'Light', overrides: {
    ...LIGHT_SYNTAX,
    bg: '#f6f2f0', surface: '#eeeae6', panel: '#e6e0dc',
    accent: '#a07060', border: 'rgba(100,60,40,0.10)',
    text: '#2c2020', textMuted: '#988078',
    paneCollaboration: '#a85040', paneArtifacts: '#907020', paneWorkshop: '#707010',
    paneDetails: '#388040', paneHistory: '#287068', paneExport: '#406890',
    paneSync: '#685888', panePublish: '#904860',
    ...ghostPanes({
      paneCollaboration: '#a85040', paneArtifacts: '#907020', paneWorkshop: '#707010',
      paneDetails: '#388040', paneHistory: '#287068', paneExport: '#406890',
      paneSync: '#685888', panePublish: '#904860',
    }, '#e6e0dc', '#988078'),
  }},

  { id: 'mint', name: 'Mint', section: 'Light', overrides: {
    ...LIGHT_SYNTAX,
    bg: '#e8f4f0', surface: '#dceee8', panel: '#d0e8e0',
    accent: '#288870', border: 'rgba(20,100,80,0.10)',
    text: '#102018', textMuted: '#508878',
    paneCollaboration: '#c05858', paneArtifacts: '#b08030', paneWorkshop: '#889020',
    paneDetails: '#288870', paneHistory: '#2080a0', paneExport: '#4070a8',
    paneSync: '#6060a0', panePublish: '#a05070',
    ...solidPanes({
      paneCollaboration: '#c05858', paneArtifacts: '#b08030', paneWorkshop: '#889020',
      paneDetails: '#288870', paneHistory: '#2080a0', paneExport: '#4070a8',
      paneSync: '#6060a0', panePublish: '#a05070',
    }),
  }},

  { id: 'sunrise', name: 'Sunrise', section: 'Light', overrides: {
    ...LIGHT_SYNTAX,
    bg: '#f8f0e4', surface: '#f0e6d6', panel: '#e8dcc8',
    accent: '#d07030', border: 'rgba(180,80,20,0.10)',
    text: '#301808', textMuted: '#a07040',
    paneCollaboration: '#b04828', paneArtifacts: '#a06020', paneWorkshop: '#807010',
    paneDetails: '#408030', paneHistory: '#287868', paneExport: '#306090',
    paneSync: '#584890', panePublish: '#983858',
    ...solidPanes({
      paneCollaboration: '#b04828', paneArtifacts: '#a06020', paneWorkshop: '#807010',
      paneDetails: '#408030', paneHistory: '#287868', paneExport: '#306090',
      paneSync: '#584890', panePublish: '#983858',
    }),
  }},

  { id: 'lemonade', name: 'Lemonade', section: 'Light', overrides: {
    ...LIGHT_SYNTAX,
    bg: '#f8f6e0', surface: '#f0ecd0', panel: '#e8e4c4',
    accent: '#908020', border: 'rgba(120,110,20,0.12)',
    text: '#282408', textMuted: '#888040',
    paneCollaboration: '#c06048', paneArtifacts: '#b08828', paneWorkshop: '#908020',
    paneDetails: '#488838', paneHistory: '#308078', paneExport: '#487098',
    paneSync: '#685890', panePublish: '#a04868',
    ...ghostPanes({
      paneCollaboration: '#c06048', paneArtifacts: '#b08828', paneWorkshop: '#908020',
      paneDetails: '#488838', paneHistory: '#308078', paneExport: '#487098',
      paneSync: '#685890', panePublish: '#a04868',
    }, '#e8e4c4', '#888040'),
  }},

  { id: 'ivory', name: 'Ivory', section: 'Light', overrides: {
    ...LIGHT_SYNTAX,
    bg: '#f8f4ee', surface: '#f0ece4', panel: '#e8e4da',
    accent: '#606050', border: 'rgba(80,80,50,0.12)',
    text: '#303028', textMuted: '#787868',
    paneCollaboration: '#886050', paneArtifacts: '#887838', paneWorkshop: '#687828',
    paneDetails: '#488850', paneHistory: '#387870', paneExport: '#486880',
    paneSync: '#685878', panePublish: '#885060',
    ...ghostPanes({
      paneCollaboration: '#886050', paneArtifacts: '#887838', paneWorkshop: '#687828',
      paneDetails: '#488850', paneHistory: '#387870', paneExport: '#486880',
      paneSync: '#685878', panePublish: '#885060',
    }, '#e8e4da', '#787868'),
  }},
];
