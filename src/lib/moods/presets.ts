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

export const MOOD_PRESETS: MoodPresetDef[] = [
  // ════════════════════════════════════════════════════
  // DARK — tonal variations on café (warm, readable)
  // ════════════════════════════════════════════════════

  // Obsidian — soft charcoal, minimal warm tint, high readability
  { id: 'obsidian', name: 'Obsidian', section: 'Dark', overrides: {
    bg: '#0a0a0c', surface: '#141416', panel: '#1e1e20',
    accent: '#a0a0a8', border: 'rgba(120,120,130,0.12)',
    text: '#d4d4d8', textMuted: '#787880',
    paneCollaboration: '#a08880', paneArtifacts: '#b0a080', paneWorkshop: '#98a080',
    paneDetails: '#80a890', paneHistory: '#8098a8', paneExport: '#8088a8',
    paneSync: '#8880a0', panePublish: '#a88890', paneStore: '#a09888',
    ...ghostPanes({
      paneCollaboration: '#a08880', paneArtifacts: '#b0a080', paneWorkshop: '#98a080',
      paneDetails: '#80a890', paneHistory: '#8098a8', paneExport: '#8088a8',
      paneSync: '#8880a0', panePublish: '#a88890', paneStore: '#a09888',
    }, '#343436', '#787880'),
  }},

  // Slate — cool blue-gray on warm dark
  { id: 'slate', name: 'Slate', section: 'Dark', overrides: {
    bg: '#141618', surface: '#1e2226', panel: '#282e34',
    accent: '#7098b8', border: 'rgba(80,110,140,0.12)',
    text: '#c8d0d8', textMuted: '#687888',
    paneCollaboration: '#b08070', paneArtifacts: '#c0a060', paneWorkshop: '#a0a868',
    paneDetails: '#70a880', paneHistory: '#7098b8', paneExport: '#7080b0',
    paneSync: '#8078a8', panePublish: '#b07888', paneStore: '#a89878',
    ...ghostPanes({
      paneCollaboration: '#b08070', paneArtifacts: '#c0a060', paneWorkshop: '#a0a868',
      paneDetails: '#70a880', paneHistory: '#7098b8', paneExport: '#7080b0',
      paneSync: '#8078a8', panePublish: '#b07888', paneStore: '#a89878',
    }, '#303840', '#687888'),
  }},

  // Moss — muted green on dark earth
  { id: 'moss', name: 'Moss', section: 'Dark', overrides: {
    bg: '#141610', surface: '#1e221a', panel: '#282e24',
    accent: '#88a878', border: 'rgba(80,100,70,0.12)',
    text: '#d0d8c8', textMuted: '#788870',
    paneCollaboration: '#a88878', paneArtifacts: '#b0a070', paneWorkshop: '#90a070',
    paneDetails: '#88a878', paneHistory: '#70a090', paneExport: '#7890a0',
    paneSync: '#807898', panePublish: '#a07880', paneStore: '#a09878',
    ...ghostPanes({
      paneCollaboration: '#a88878', paneArtifacts: '#b0a070', paneWorkshop: '#90a070',
      paneDetails: '#88a878', paneHistory: '#70a090', paneExport: '#7890a0',
      paneSync: '#807898', panePublish: '#a07880', paneStore: '#a09878',
    }, '#2c3226', '#788870'),
  }},

  // Ember — muted red on dark earth
  { id: 'ember', name: 'Ember', section: 'Dark', overrides: {
    bg: '#181010', surface: '#241a18', panel: '#2e2220',
    accent: '#b87068', border: 'rgba(120,70,60,0.12)',
    text: '#d8ccc8', textMuted: '#907470',
    paneCollaboration: '#b87068', paneArtifacts: '#b09070', paneWorkshop: '#a09878',
    paneDetails: '#80a080', paneHistory: '#789890', paneExport: '#7888a0',
    paneSync: '#887098', panePublish: '#a87078', paneStore: '#a89070',
    ...ghostPanes({
      paneCollaboration: '#b87068', paneArtifacts: '#b09070', paneWorkshop: '#a09878',
      paneDetails: '#80a080', paneHistory: '#789890', paneExport: '#7888a0',
      paneSync: '#887098', panePublish: '#a87078', paneStore: '#a89070',
    }, '#341e1c', '#907470'),
  }},

  // Café — warm brown, the anchor dark theme
  { id: 'cafe', name: 'Café', section: 'Dark', overrides: {
    bg: '#1a1410', surface: '#24201a', panel: '#2e2820',
    accent: '#d8a860', border: 'rgba(120,100,60,0.12)',
    text: '#e0d0b8', textMuted: '#887860',
    paneCollaboration: '#c08868', paneArtifacts: '#d8a860', paneWorkshop: '#b8a868',
    paneDetails: '#88a878', paneHistory: '#80a098', paneExport: '#7890a0',
    paneSync: '#8878a0', panePublish: '#b88080', paneStore: '#c0a070',
    ...ghostPanes({
      paneCollaboration: '#c08868', paneArtifacts: '#d8a860', paneWorkshop: '#b8a868',
      paneDetails: '#88a878', paneHistory: '#80a098', paneExport: '#7890a0',
      paneSync: '#8878a0', panePublish: '#b88080', paneStore: '#c0a070',
    }, '#362c24', '#887860'),
  }},

  // ════════════════════════════════════════════════════
  // LIGHT — tonal variations on parchment/ivory (warm, readable)
  // ════════════════════════════════════════════════════

  // Ivory — warm neutral, near-white
  { id: 'ivory', name: 'Ivory', section: 'Light', overrides: {
    ...LIGHT_SYNTAX,
    bg: '#f8f4ee', surface: '#f0ece4', panel: '#e8e4da',
    accent: '#606050', border: 'rgba(80,80,50,0.12)',
    text: '#303028', textMuted: '#787868',
    paneCollaboration: '#886050', paneArtifacts: '#887838', paneWorkshop: '#687828',
    paneDetails: '#488850', paneHistory: '#387870', paneExport: '#486880',
    paneSync: '#585878', panePublish: '#885060', paneStore: '#787038',
    ...ghostPanes({
      paneCollaboration: '#886050', paneArtifacts: '#887838', paneWorkshop: '#687828',
      paneDetails: '#488850', paneHistory: '#387870', paneExport: '#486880',
      paneSync: '#585878', panePublish: '#885060', paneStore: '#787038',
    }, '#e8e4da', '#787868'),
    bloom1: '#c8b898', bloom2: '#b0a898', bloom3: '#98b8a8',
    bloom4: '#c0b098', bloom5: '#b0b898', bloom6: '#98b8a8',
    bloomOpacity: '0.6',
  }},

  // Mist — soft blue on off-white
  { id: 'mist', name: 'Mist', section: 'Light', overrides: {
    ...LIGHT_SYNTAX,
    bg: '#eef2f6', surface: '#e4eaf0', panel: '#d8e0e8',
    accent: '#486888', border: 'rgba(50,70,100,0.10)',
    text: '#181c24', textMuted: '#607080',
    paneCollaboration: '#886058', paneArtifacts: '#887838', paneWorkshop: '#687828',
    paneDetails: '#408850', paneHistory: '#387870', paneExport: '#486888',
    paneSync: '#585880', panePublish: '#885060', paneStore: '#686838',
    bloom1: '#90a8c8', bloom2: '#a890b8', bloom3: '#80b0c0',
    bloom4: '#c0a0a8', bloom5: '#a0b0a0', bloom6: '#80b0b8',
    bloomOpacity: '0.6',
  }},

  // Sage — muted green on warm light
  { id: 'sage', name: 'Sage', section: 'Light', overrides: {
    ...LIGHT_SYNTAX,
    bg: '#eff4ec', surface: '#e4ece0', panel: '#d8e4d4',
    accent: '#507848', border: 'rgba(60,90,50,0.12)',
    text: '#1c2418', textMuted: '#688060',
    paneCollaboration: '#906050', paneArtifacts: '#907830', paneWorkshop: '#688028',
    paneDetails: '#507848', paneHistory: '#387868', paneExport: '#486880',
    paneSync: '#585878', panePublish: '#885060', paneStore: '#787028',
    bloom1: '#a8c890', bloom2: '#90b0b8', bloom3: '#80c8a0',
    bloom4: '#c0b090', bloom5: '#a0c080', bloom6: '#80c0a0',
    bloomOpacity: '0.6',
  }},

  // Rose — soft pink/blush on warm cream
  { id: 'rose', name: 'Rose', section: 'Light', overrides: {
    ...LIGHT_SYNTAX,
    bg: '#f6eeee', surface: '#efe4e4', panel: '#e6d8d8',
    accent: '#a06070', border: 'rgba(120,60,70,0.12)',
    text: '#2c1818', textMuted: '#887068',
    paneCollaboration: '#a06070', paneArtifacts: '#a07838', paneWorkshop: '#788028',
    paneDetails: '#408038', paneHistory: '#387070', paneExport: '#486888',
    paneSync: '#605880', panePublish: '#a05068', paneStore: '#886838',
    bloom1: '#d89098', bloom2: '#c880a0', bloom3: '#90c0b0',
    bloom4: '#d0a098', bloom5: '#c0b890', bloom6: '#88b8a8',
    bloomOpacity: '0.6',
  }},

  // Parchment — warm cream/brown, the anchor light theme
  { id: 'parchment', name: 'Parchment', section: 'Light', overrides: {
    ...LIGHT_SYNTAX,
    bg: '#f4ece0', surface: '#ece2d4', panel: '#e4d8c8',
    accent: '#886838', border: 'rgba(100,70,30,0.15)',
    text: '#2c2010', textMuted: '#887058',
    paneCollaboration: '#b05040', paneArtifacts: '#a07028', paneWorkshop: '#808018',
    paneDetails: '#407830', paneHistory: '#307068', paneExport: '#406090',
    paneSync: '#585088', panePublish: '#904860', paneStore: '#785828',
    bloom1: '#e0a070', bloom2: '#c890b0', bloom3: '#80c8b8',
    bloom4: '#d89070', bloom5: '#b8b870', bloom6: '#70b8a0',
    bloomOpacity: '0.6',
  }},
];
