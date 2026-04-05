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

  // Obsidian — soft black, neutral, high readability
  { id: 'obsidian', name: 'Obsidian', section: 'Dark', overrides: {
    bg: '#121314', surface: '#191A1B', panel: '#191A1B',
    accent: '#BFBFBF', border: '#2A2B2C',
    text: '#BCBEBF', textMuted: '#8C8C8C',
    paneCollaboration: '#a08880', paneArtifacts: '#b0a080', paneWorkshop: '#98a080',
    paneDetails: '#80a890', paneHistory: '#8098a8', paneExport: '#8088a8',
    paneSync: '#8880a0', panePublish: '#a88890', paneStore: '#a09888',
    ...ghostPanes({
      paneCollaboration: '#a08880', paneArtifacts: '#b0a080', paneWorkshop: '#98a080',
      paneDetails: '#80a890', paneHistory: '#8098a8', paneExport: '#8088a8',
      paneSync: '#8880a0', panePublish: '#a88890', paneStore: '#a09888',
    }, '#1e1f20', '#8C8C8C'),
  }},

  // Slate — cool blue tint on obsidian base
  { id: 'slate', name: 'Slate', section: 'Dark', overrides: {
    bg: '#121316', surface: '#191A1E', panel: '#191A1E',
    surfaceSolid: '#191A1E', toolbar: '#191A1E',
    accent: '#8098B8', border: '#2A2B30',
    text: '#BCC0C8', textMuted: '#7880A0',
    paneCollaboration: '#a08880', paneArtifacts: '#b0a080', paneWorkshop: '#98a080',
    paneDetails: '#80a890', paneHistory: '#8098a8', paneExport: '#8088a8',
    paneSync: '#8880a0', panePublish: '#a88890', paneStore: '#a09888',
    ...ghostPanes({
      paneCollaboration: '#a08880', paneArtifacts: '#b0a080', paneWorkshop: '#98a080',
      paneDetails: '#80a890', paneHistory: '#8098a8', paneExport: '#8088a8',
      paneSync: '#8880a0', panePublish: '#a88890', paneStore: '#a09888',
    }, '#1e1f22', '#7880A0'),
  }},

  // Moss — green tint on obsidian base
  { id: 'moss', name: 'Moss', section: 'Dark', overrides: {
    bg: '#121413', surface: '#191B1A', panel: '#191B1A',
    surfaceSolid: '#191B1A', toolbar: '#191B1A',
    accent: '#88A888', border: '#2A2C2A',
    text: '#BCC0BC', textMuted: '#7C8C7C',
    paneCollaboration: '#a08880', paneArtifacts: '#b0a080', paneWorkshop: '#98a080',
    paneDetails: '#80a890', paneHistory: '#8098a8', paneExport: '#8088a8',
    paneSync: '#8880a0', panePublish: '#a88890', paneStore: '#a09888',
    ...ghostPanes({
      paneCollaboration: '#a08880', paneArtifacts: '#b0a080', paneWorkshop: '#98a080',
      paneDetails: '#80a890', paneHistory: '#8098a8', paneExport: '#8088a8',
      paneSync: '#8880a0', panePublish: '#a88890', paneStore: '#a09888',
    }, '#1e201f', '#7C8C7C'),
  }},

  // Ember — red tint on obsidian base
  { id: 'ember', name: 'Ember', section: 'Dark', overrides: {
    bg: '#141213', surface: '#1B1919', panel: '#1B1919',
    surfaceSolid: '#1B1919', toolbar: '#1B1919',
    accent: '#B88880', border: '#2C2A2A',
    text: '#C0BCBC', textMuted: '#8C7C7C',
    paneCollaboration: '#a08880', paneArtifacts: '#b0a080', paneWorkshop: '#98a080',
    paneDetails: '#80a890', paneHistory: '#8098a8', paneExport: '#8088a8',
    paneSync: '#8880a0', panePublish: '#a88890', paneStore: '#a09888',
    ...ghostPanes({
      paneCollaboration: '#a08880', paneArtifacts: '#b0a080', paneWorkshop: '#98a080',
      paneDetails: '#80a890', paneHistory: '#8098a8', paneExport: '#8088a8',
      paneSync: '#8880a0', panePublish: '#a88890', paneStore: '#a09888',
    }, '#201e1e', '#8C7C7C'),
  }},

  // Café — warm brown tint on obsidian base
  { id: 'cafe', name: 'Café', section: 'Dark', overrides: {
    bg: '#141312', surface: '#1B1A18', panel: '#1B1A18',
    surfaceSolid: '#1B1A18', toolbar: '#1B1A18',
    accent: '#C0A070', border: '#2C2B28',
    text: '#C0BEB8', textMuted: '#908878',
    paneCollaboration: '#a08880', paneArtifacts: '#b0a080', paneWorkshop: '#98a080',
    paneDetails: '#80a890', paneHistory: '#8098a8', paneExport: '#8088a8',
    paneSync: '#8880a0', panePublish: '#a88890', paneStore: '#a09888',
    ...ghostPanes({
      paneCollaboration: '#a08880', paneArtifacts: '#b0a080', paneWorkshop: '#98a080',
      paneDetails: '#80a890', paneHistory: '#8098a8', paneExport: '#8088a8',
      paneSync: '#8880a0', panePublish: '#a88890', paneStore: '#a09888',
    }, '#201f1e', '#908878'),
  }},

  // ════════════════════════════════════════════════════
  // LIGHT — tonal variations on parchment/ivory (warm, readable)
  // ════════════════════════════════════════════════════

  // Ivory — neutral tint on parchment base
  { id: 'ivory', name: 'Ivory', section: 'Light', overrides: {
    ...LIGHT_SYNTAX,
    bg: '#F2F0EC', surface: '#EAE8E2', panel: '#E2E0DA',
    accent: '#505048', border: '#D0CEC8',
    text: '#141410', textMuted: '#6E6E64',
    accentMuted: 'rgba(80,80,72,0.12)',
    paneCollaboration: '#9E4030', paneArtifacts: '#8E6020', paneWorkshop: '#6E7010',
    paneDetails: '#307020', paneHistory: '#206058', paneExport: '#305080',
    paneSync: '#484070', panePublish: '#803850', paneStore: '#684818',
    ...ghostPanes({
      paneCollaboration: '#9E4030', paneArtifacts: '#8E6020', paneWorkshop: '#6E7010',
      paneDetails: '#307020', paneHistory: '#206058', paneExport: '#305080',
      paneSync: '#484070', panePublish: '#803850', paneStore: '#684818',
    }, '#DAD8D0', '#6E6E64'),
    bloom1: '#c8b898', bloom2: '#b0a898', bloom3: '#98b8a8',
    bloom4: '#c0b098', bloom5: '#b0b898', bloom6: '#98b8a8',
    bloomOpacity: '0.6',
  }},

  // Mist — blue tint on parchment base
  { id: 'mist', name: 'Mist', section: 'Light', overrides: {
    ...LIGHT_SYNTAX,
    bg: '#EEF0F4', surface: '#E4E8EE', panel: '#DAE0E8',
    accent: '#3E5878', border: '#C8CED8',
    text: '#0C1018', textMuted: '#586878',
    accentMuted: 'rgba(62,88,120,0.12)',
    paneCollaboration: '#9E4030', paneArtifacts: '#8E6020', paneWorkshop: '#6E7010',
    paneDetails: '#307020', paneHistory: '#206058', paneExport: '#305080',
    paneSync: '#484070', panePublish: '#803850', paneStore: '#684818',
    ...ghostPanes({
      paneCollaboration: '#9E4030', paneArtifacts: '#8E6020', paneWorkshop: '#6E7010',
      paneDetails: '#307020', paneHistory: '#206058', paneExport: '#305080',
      paneSync: '#484070', panePublish: '#803850', paneStore: '#684818',
    }, '#D0D8E0', '#586878'),
    bloom1: '#90a8c8', bloom2: '#a890b8', bloom3: '#80b0c0',
    bloom4: '#c0a0a8', bloom5: '#a0b0a0', bloom6: '#80b0b8',
    bloomOpacity: '0.6',
  }},

  // Sage — green tint on parchment base
  { id: 'sage', name: 'Sage', section: 'Light', overrides: {
    ...LIGHT_SYNTAX,
    bg: '#EEF2EC', surface: '#E4ECE0', panel: '#DAE4D4',
    accent: '#3E6838', border: '#C8D0C4',
    text: '#0C1808', textMuted: '#587050',
    accentMuted: 'rgba(62,104,56,0.12)',
    paneCollaboration: '#9E4030', paneArtifacts: '#8E6020', paneWorkshop: '#6E7010',
    paneDetails: '#307020', paneHistory: '#206058', paneExport: '#305080',
    paneSync: '#484070', panePublish: '#803850', paneStore: '#684818',
    ...ghostPanes({
      paneCollaboration: '#9E4030', paneArtifacts: '#8E6020', paneWorkshop: '#6E7010',
      paneDetails: '#307020', paneHistory: '#206058', paneExport: '#305080',
      paneSync: '#484070', panePublish: '#803850', paneStore: '#684818',
    }, '#D0DCC8', '#587050'),
    bloom1: '#a8c890', bloom2: '#90b0b8', bloom3: '#80c8a0',
    bloom4: '#c0b090', bloom5: '#a0c080', bloom6: '#80c0a0',
    bloomOpacity: '0.6',
  }},

  // Rose — pink tint on parchment base
  { id: 'rose', name: 'Rose', section: 'Light', overrides: {
    ...LIGHT_SYNTAX,
    bg: '#F4EEEE', surface: '#ECE4E4', panel: '#E4DADC',
    accent: '#884050', border: '#D0C8C8',
    text: '#1C0C10', textMuted: '#785860',
    accentMuted: 'rgba(136,64,80,0.12)',
    paneCollaboration: '#9E4030', paneArtifacts: '#8E6020', paneWorkshop: '#6E7010',
    paneDetails: '#307020', paneHistory: '#206058', paneExport: '#305080',
    paneSync: '#484070', panePublish: '#803850', paneStore: '#684818',
    ...ghostPanes({
      paneCollaboration: '#9E4030', paneArtifacts: '#8E6020', paneWorkshop: '#6E7010',
      paneDetails: '#307020', paneHistory: '#206058', paneExport: '#305080',
      paneSync: '#484070', panePublish: '#803850', paneStore: '#684818',
    }, '#DCD0D0', '#785860'),
    bloom1: '#d89098', bloom2: '#c880a0', bloom3: '#90c0b0',
    bloom4: '#d0a098', bloom5: '#c0b890', bloom6: '#88b8a8',
    bloomOpacity: '0.6',
  }},

  // Parchment — warm cream/brown, the anchor light theme
  { id: 'parchment', name: 'Parchment', section: 'Light', overrides: {
    ...LIGHT_SYNTAX,
    bg: '#f4ece0', surface: '#ece2d4', panel: '#e4d8c8',
    accent: '#6E4E28', border: '#D0C4B4',
    text: '#1C1408', textMuted: '#6E5C44',
    accentMuted: 'rgba(110,78,40,0.12)',
    paneCollaboration: '#9E4030', paneArtifacts: '#8E6020', paneWorkshop: '#6E7010',
    paneDetails: '#307020', paneHistory: '#206058', paneExport: '#305080',
    paneSync: '#484070', panePublish: '#803850', paneStore: '#684818',
    ...ghostPanes({
      paneCollaboration: '#9E4030', paneArtifacts: '#8E6020', paneWorkshop: '#6E7010',
      paneDetails: '#307020', paneHistory: '#206058', paneExport: '#305080',
      paneSync: '#484070', panePublish: '#803850', paneStore: '#684818',
    }, '#ddd0c0', '#6E5C44'),
    bloom1: '#e0a070', bloom2: '#c890b0', bloom3: '#80c8b8',
    bloom4: '#d89070', bloom5: '#b8b870', bloom6: '#70b8a0',
    bloomOpacity: '0.6',
  }},
];
