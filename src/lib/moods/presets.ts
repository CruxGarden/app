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
  syntaxString: 'var(--pane-details)', // green pane
  syntaxNumber: 'var(--pane-artifacts)', // orange pane
  syntaxType: 'var(--pane-export)', // blue pane
  syntaxFunction: 'var(--pane-workshop)', // gold pane
  syntaxPunctuation: 'var(--text-muted)',
  syntaxVariable: 'var(--pane-history)', // teal pane
  syntaxTag: 'var(--pane-collaboration)', // rose pane
  syntaxAttribute: 'var(--pane-workshop)', // gold pane
};

// Blade Runner helper: each pane gets a two-tone neon gradient frame, a black
// header with the neon as text, and a slightly lifted body.
function neonFrames(panes: Record<string, [string, string]>) {
  const result: Record<string, string> = {};
  for (const [key, [neon, deep]] of Object.entries(panes)) {
    result[`${key}Border`] = `linear-gradient(160deg, ${neon}, ${deep} 60%, ${neon})`;
    result[`${key}Body`] = '#0a0d1a';
    result[`${key}Surface`] = '#10142a';
    result[`${key}Header`] = '#04050d';
    result[`${key}HeaderBorder`] = 'transparent';
    result[`${key}HeaderText`] = neon;
    result[`${key}HeaderIcon`] = neon;
    result[`${key}HeaderClose`] = deep;
    result[`${key}Caption`] = neon;
    result[`${key}Heading`] = '#ffb86b';
    result[`${key}Accent`] = neon;
    result[`${key}ButtonActive`] = `color-mix(in srgb, ${neon} 18%, transparent)`;
    result[`${key}ButtonBorderActive`] = neon;
  }
  return result;
}

// Windows 95 helper: every pane is the same grey window — a raised bevel
// (light top-left, dark bottom-right, done with a hard diagonal gradient on
// the frame), a navy title bar with white text, and no radius anywhere.
function win95Panes(keys: string[]) {
  const result: Record<string, string> = {};
  for (const key of keys) {
    result[key] = '#000080';
    result[`${key}Body`] = '#c0c0c0';
    result[`${key}Surface`] = '#dfdfdf';
    result[`${key}SurfaceSolid`] = '#c0c0c0';
    result[`${key}Border`] = 'linear-gradient(135deg, #ffffff 0 50%, #404040 50%)';
    result[`${key}Header`] = 'linear-gradient(90deg, #000080, #1084d0)';
    result[`${key}HeaderBorder`] = 'transparent';
    result[`${key}HeaderText`] = '#ffffff';
    result[`${key}HeaderIcon`] = '#ffffff';
    result[`${key}HeaderClose`] = '#ffffff';
    result[`${key}HeaderRadius`] = '0px';
    result[`${key}HeaderHeight`] = '22px';
    result[`${key}Radius`] = '0px';
    result[`${key}RadiusSm`] = '0px';
    result[`${key}Text`] = '#000000';
    result[`${key}TextMuted`] = '#3a3a3a';
    result[`${key}Caption`] = '#000080';
    result[`${key}Heading`] = '#000000';
    result[`${key}Accent`] = '#000080';
    result[`${key}AccentMuted`] = '#b8b8d8';
    result[`${key}Button`] = '#000080';
    result[`${key}ButtonIcon`] = '#000080';
    result[`${key}ButtonActive`] = '#ffffff';
    result[`${key}ButtonBorderActive`] = '#808080';
  }
  return result;
}

export const MOOD_PRESETS: MoodPresetDef[] = [
  // ════════════════════════════════════════════════════
  // DARK — tonal variations on café (warm, readable)
  // ════════════════════════════════════════════════════

  // Blade Runner — rain-black indigo, neon orange and cyan, magenta signage.
  // Every pane keeps the same wet-asphalt body; its identity is a neon frame.
  {
    id: 'blade-runner',
    name: 'Blade Runner',
    section: 'Dark',
    overrides: {
      bg: '#04050d',
      panel: '#0a0d1a',
      surface: '#10142a',
      surfaceSolid: '#10142a',
      accent: '#ff6a1a',
      accentMuted: '#2a1408',
      border: '#1a2a4a',
      text: '#e8ecf6',
      textMuted: '#7d88ad',
      heading: '#ffb86b',
      caption: '#16d5e8',
      highlight: '#16d5e8',
      error: '#ff3b5c',
      warning: '#ffb020',
      success: '#2ee6a6',
      radius: '0.25rem',
      radiusSm: '0.125rem',
      radiusLg: '0.5rem',
      paneGap: '10px',
      workspacePadding: '10px',
      paneBorderWidth: '2px',
      paneHeaderHeight: '30px',
      paneHeaderRadius: '0px',
      fontDisplay: "'JetBrains Mono', monospace",
      // Top bar: a dark visor with an orange readout
      toolbar: '#06070f',
      toolbarText: '#ffb86b',
      toolbarTextMuted: '#7d88ad',
      toolbarBorder: '#1a2a4a',
      toolbarDivider: '#1a2a4a',
      iconButtonIcon: '#16d5e8',
      iconButtonIconHover: '#ff6a1a',
      iconButtonHover: '#10142a',
      // Chat: the user speaks in orange, the machine in cold cyan-grey
      chat: '#0a0d1a',
      chatText: '#e8ecf6',
      chatTextMuted: '#7d88ad',
      chatUserBubble: '#2a1408',
      chatUserBubbleText: '#ffb86b',
      chatUserBubbleBorder: '#ff6a1a',
      chatAiBubble: '#10142a',
      chatAiText: '#d6e4f0',
      chatAiBubbleBorder: '#1a2a4a',
      chatInput: '#06070f',
      chatInputText: '#e8ecf6',
      chatInputBorder: '#1a2a4a',
      chatInputBorderFocus: '#16d5e8',
      chatInputPlaceholder: '#4d5878',
      chatSendButton: '#ff6a1a',
      chatSendButtonHover: '#ff8a45',
      chatSendButtonIcon: '#04050d',
      // Controls
      primaryButton: '#ff6a1a',
      primaryButtonText: '#04050d',
      primaryButtonBorder: '#ff6a1a',
      actionButton: '#10142a',
      actionButtonText: '#16d5e8',
      actionButtonBorder: '#1a2a4a',
      badge: '#0e2a30',
      badgeText: '#16d5e8',
      badgeBorder: '#16d5e8',
      // Cards
      gardenCard: '#0a0d1a',
      gardenCardHover: '#10142a',
      gardenCardBorder: '#1a2a4a',
      gardenCardBorderHover: '#16d5e8',
      gardenCardTitle: '#ffb86b',
      gardenCardText: '#a7b1cf',
      gardenCardMeta: '#5d6890',
      gardenCardThumbnail: '#04050d',
      growthCard: '#0a0d1a',
      growthCardHover: '#10142a',
      growthCardActive: '#14213d',
      growthCardText: '#e8ecf6',
      growthCardTextMuted: '#7d88ad',
      growthCardLabel: '#16d5e8',
      growthDot: '#4d5878',
      growthDotActive: '#ff6a1a',
      overlayBadge: 'rgba(4, 5, 13, 0.75)',
      overlayBadgeText: '#16d5e8',
      // File tree
      fileTree: '#0a0d1a',
      fileTreeItemText: '#d6e4f0',
      fileTreeItemIcon: '#7d88ad',
      fileTreeItemHover: '#10142a',
      fileTreeItemSelected: '#14213d',
      fileTreeItemTextSelected: '#ffb86b',
      // Code
      syntaxComment: '#4d5878',
      syntaxKeyword: '#ff6a1a',
      syntaxString: '#16d5e8',
      syntaxNumber: '#ffb020',
      syntaxType: '#ff2bd6',
      syntaxFunction: '#ffb86b',
      syntaxPunctuation: '#7d88ad',
      syntaxVariable: '#d6e4f0',
      syntaxTag: '#ff2bd6',
      syntaxAttribute: '#16d5e8',
      // Ambient: sodium lamps over wet streets
      bloomBg1: '#04050d',
      bloomBg2: '#000000',
      bloom1: '#ff6a1a',
      bloom2: '#16d5e8',
      bloom3: '#ff2bd6',
      bloom4: '#1a2a4a',
      bloom5: '#ffb020',
      bloom6: '#0b3a44',
      bloomBlur: '80px',
      bloomOpacity: '0.55',
      // Pane identities — neon frames on the same wet-asphalt body
      paneCollaboration: '#ff2bd6',
      paneArtifacts: '#ffb020',
      paneWorkshop: '#16d5e8',
      paneDetails: '#2ee6a6',
      paneHistory: '#ff6a1a',
      paneExport: '#8a7cff',
      paneSync: '#5cc8ff',
      panePublish: '#ff3b5c',
      paneStore: '#ffd36b',
      ...neonFrames({
        paneCollaboration: ['#ff2bd6', '#7a1a9a'],
        paneArtifacts: ['#ffb020', '#8a4a00'],
        paneWorkshop: ['#16d5e8', '#0b3a44'],
        paneDetails: ['#2ee6a6', '#0b4a3a'],
        paneHistory: ['#ff6a1a', '#7a2a00'],
        paneExport: ['#8a7cff', '#2a1a7a'],
        paneSync: ['#5cc8ff', '#0b2a4a'],
        panePublish: ['#ff3b5c', '#6a0a1a'],
        paneStore: ['#ffd36b', '#7a5a00'],
      }),
    },
  },

  // Obsidian — soft black, neutral, high readability
  {
    id: 'obsidian',
    name: 'Obsidian',
    section: 'Dark',
    overrides: {
      bg: '#121314',
      surface: '#191A1B',
      panel: '#191A1B',
      accent: '#c9c9c9',
      border: '#353638',
      text: '#d5d8d9',
      textMuted: '#9b9b9b',
      paneCollaboration: '#b88f82',
      paneArtifacts: '#cdb27d',
      paneWorkshop: '#aab882',
      paneDetails: '#7fc29a',
      paneHistory: '#7fa7c2',
      paneExport: '#7f8dc2',
      paneSync: '#8f82b8',
      panePublish: '#bf8a97',
      paneStore: '#b5a78d',
      ...ghostPanes(
        {
          paneCollaboration: '#a08880',
          paneArtifacts: '#b0a080',
          paneWorkshop: '#98a080',
          paneDetails: '#80a890',
          paneHistory: '#8098a8',
          paneExport: '#8088a8',
          paneSync: '#8880a0',
          panePublish: '#a88890',
          paneStore: '#a09888',
        },
        '#1e1f20',
        '#8C8C8C',
      ),
    },
  },

  // Slate — cool blue tint on obsidian base
  {
    id: 'slate',
    name: 'Slate',
    section: 'Dark',
    overrides: {
      bg: '#121316',
      surface: '#191A1E',
      panel: '#191A1E',
      surfaceSolid: '#191A1E',
      toolbar: '#191A1E',
      accent: '#79a0d3',
      border: '#34353d',
      text: '#d4d9e3',
      textMuted: '#7a88bc',
      paneCollaboration: '#b88f82',
      paneArtifacts: '#cdb27d',
      paneWorkshop: '#aab882',
      paneDetails: '#7fc29a',
      paneHistory: '#7fa7c2',
      paneExport: '#7f8dc2',
      paneSync: '#8f82b8',
      panePublish: '#bf8a97',
      paneStore: '#b5a78d',
      ...ghostPanes(
        {
          paneCollaboration: '#a08880',
          paneArtifacts: '#b0a080',
          paneWorkshop: '#98a080',
          paneDetails: '#80a890',
          paneHistory: '#8098a8',
          paneExport: '#8088a8',
          paneSync: '#8880a0',
          panePublish: '#a88890',
          paneStore: '#a09888',
        },
        '#1e1f22',
        '#7880A0',
      ),
    },
  },

  // Moss — green tint on obsidian base
  {
    id: 'moss',
    name: 'Moss',
    section: 'Dark',
    overrides: {
      bg: '#121413',
      surface: '#191B1A',
      panel: '#191B1A',
      surfaceSolid: '#191B1A',
      toolbar: '#191B1A',
      accent: '#88bc88',
      border: '#353835',
      text: '#d5dad5',
      textMuted: '#86a186',
      paneCollaboration: '#b88f82',
      paneArtifacts: '#cdb27d',
      paneWorkshop: '#aab882',
      paneDetails: '#7fc29a',
      paneHistory: '#7fa7c2',
      paneExport: '#7f8dc2',
      paneSync: '#8f82b8',
      panePublish: '#bf8a97',
      paneStore: '#b5a78d',
      ...ghostPanes(
        {
          paneCollaboration: '#a08880',
          paneArtifacts: '#b0a080',
          paneWorkshop: '#98a080',
          paneDetails: '#80a890',
          paneHistory: '#8098a8',
          paneExport: '#8088a8',
          paneSync: '#8880a0',
          panePublish: '#a88890',
          paneStore: '#a09888',
        },
        '#1e201f',
        '#7C8C7C',
      ),
    },
  },

  // Ember — red tint on obsidian base
  {
    id: 'ember',
    name: 'Ember',
    section: 'Dark',
    overrides: {
      bg: '#141213',
      surface: '#1B1919',
      panel: '#1B1919',
      surfaceSolid: '#1B1919',
      toolbar: '#1B1919',
      accent: '#d38679',
      border: '#383535',
      text: '#dad5d5',
      textMuted: '#a18686',
      paneCollaboration: '#b88f82',
      paneArtifacts: '#cdb27d',
      paneWorkshop: '#aab882',
      paneDetails: '#7fc29a',
      paneHistory: '#7fa7c2',
      paneExport: '#7f8dc2',
      paneSync: '#8f82b8',
      panePublish: '#bf8a97',
      paneStore: '#b5a78d',
      ...ghostPanes(
        {
          paneCollaboration: '#a08880',
          paneArtifacts: '#b0a080',
          paneWorkshop: '#98a080',
          paneDetails: '#80a890',
          paneHistory: '#8098a8',
          paneExport: '#8088a8',
          paneSync: '#8880a0',
          panePublish: '#a88890',
          paneStore: '#a09888',
        },
        '#201e1e',
        '#8C7C7C',
      ),
    },
  },

  // Café — warm brown tint on obsidian base
  {
    id: 'cafe',
    name: 'Café',
    section: 'Dark',
    overrides: {
      bg: '#141312',
      surface: '#1B1A18',
      panel: '#1B1A18',
      surfaceSolid: '#1B1A18',
      toolbar: '#1B1A18',
      accent: '#dcae69',
      border: '#393732',
      text: '#dbd8d0',
      textMuted: '#a79a7f',
      paneCollaboration: '#b88f82',
      paneArtifacts: '#cdb27d',
      paneWorkshop: '#aab882',
      paneDetails: '#7fc29a',
      paneHistory: '#7fa7c2',
      paneExport: '#7f8dc2',
      paneSync: '#8f82b8',
      panePublish: '#bf8a97',
      paneStore: '#b5a78d',
      ...ghostPanes(
        {
          paneCollaboration: '#a08880',
          paneArtifacts: '#b0a080',
          paneWorkshop: '#98a080',
          paneDetails: '#80a890',
          paneHistory: '#8098a8',
          paneExport: '#8088a8',
          paneSync: '#8880a0',
          panePublish: '#a88890',
          paneStore: '#a09888',
        },
        '#201f1e',
        '#908878',
      ),
    },
  },

  // ════════════════════════════════════════════════════
  // LIGHT — tonal variations on parchment/ivory (warm, readable)
  // ════════════════════════════════════════════════════

  // Windows 95 — teal desktop, grey windows, navy title bars, bevels, no radius.
  {
    id: 'windows-95',
    name: 'Windows 95',
    section: 'Light',
    overrides: {
      bg: '#008080',
      panel: '#c0c0c0',
      surface: '#dfdfdf',
      surfaceSolid: '#c0c0c0',
      accent: '#000080',
      accentMuted: '#b8b8d8',
      border: '#808080',
      text: '#000000',
      textMuted: '#3a3a3a',
      heading: '#000000',
      caption: '#000080',
      title: '#000000',
      highlight: '#000080',
      error: '#c00000',
      warning: '#a06000',
      success: '#008000',
      radius: '0px',
      radiusSm: '0px',
      radiusLg: '0px',
      paneGap: '6px',
      workspacePadding: '6px',
      paneBorderWidth: '3px',
      paneHeaderHeight: '22px',
      paneHeaderRadius: '0px',
      paneHeaderPadding: '3px',
      fontDisplay: "Tahoma, 'MS Sans Serif', Verdana, sans-serif",
      fontBody: "Tahoma, 'MS Sans Serif', Verdana, sans-serif",
      fontMono: "'Courier New', Courier, monospace",
      // Taskbar
      toolbar: '#c0c0c0',
      toolbarText: '#000000',
      toolbarTextMuted: '#3a3a3a',
      toolbarBorder: '#ffffff',
      toolbarDivider: '#808080',
      iconButtonIcon: '#000000',
      iconButtonIconHover: '#000080',
      iconButtonHover: '#dfdfdf',
      iconButtonBorder: '#808080',
      // Chat: a dialog box
      chat: '#c0c0c0',
      chatText: '#000000',
      chatTextMuted: '#3a3a3a',
      chatBorder: '#808080',
      chatUserBubble: '#000080',
      chatUserBubbleText: '#ffffff',
      chatUserBubbleBorder: '#000080',
      chatAiBubble: '#ffffff',
      chatAiText: '#000000',
      chatAiBubbleBorder: '#808080',
      chatInput: '#ffffff',
      chatInputText: '#000000',
      chatInputBorder: '#808080',
      chatInputBorderFocus: '#000080',
      chatInputPlaceholder: '#808080',
      chatSendButton: '#c0c0c0',
      chatSendButtonHover: '#dfdfdf',
      chatSendButtonIcon: '#000000',
      // Controls
      primaryButton: '#c0c0c0',
      primaryButtonText: '#000000',
      primaryButtonBorder: '#000000',
      actionButton: '#c0c0c0',
      actionButtonText: '#000000',
      actionButtonBorder: '#808080',
      badge: '#ffffff',
      badgeText: '#000080',
      badgeBorder: '#808080',
      toggle: '#ffffff',
      toggleActive: '#000080',
      toggleThumb: '#808080',
      toggleThumbActive: '#ffffff',
      toggleBorder: '#808080',
      // Cards: icons on the desktop
      gardenCard: '#c0c0c0',
      gardenCardHover: '#dfdfdf',
      gardenCardBorder: '#ffffff',
      gardenCardBorderHover: '#000080',
      gardenCardTitle: '#000000',
      gardenCardText: '#202020',
      gardenCardMeta: '#3a3a3a',
      gardenCardThumbnail: '#008080',
      growthCard: '#ffffff',
      growthCardHover: '#dfdfdf',
      growthCardActive: '#b8b8d8',
      growthCardText: '#000000',
      growthCardTextMuted: '#3a3a3a',
      growthCardLabel: '#000080',
      growthDot: '#808080',
      growthDotActive: '#000080',
      overlayBadge: '#000080',
      overlayBadgeText: '#ffffff',
      // Explorer
      fileTree: '#ffffff',
      fileTreeItemText: '#000000',
      fileTreeItemIcon: '#000000',
      fileTreeItemHover: '#dfdfdf',
      fileTreeItemSelected: '#000080',
      fileTreeItemTextSelected: '#ffffff',
      // Notepad
      editorBackground: '#ffffff',
      codeBlock: '#ffffff',
      codeBlockText: '#000000',
      codeBlockBorder: '#808080',
      syntaxComment: '#008000',
      syntaxKeyword: '#000080',
      syntaxString: '#800000',
      syntaxNumber: '#800080',
      syntaxType: '#000080',
      syntaxFunction: '#000000',
      syntaxPunctuation: '#000000',
      syntaxVariable: '#000000',
      syntaxTag: '#800000',
      syntaxAttribute: '#ff0000',
      // Desktop: flat teal, no bloom
      bloomBg1: '#008080',
      bloomBg2: '#008080',
      bloom1: '#008080',
      bloom2: '#008080',
      bloom3: '#008080',
      bloom4: '#008080',
      bloom5: '#008080',
      bloom6: '#008080',
      bloomOpacity: '0',
      ...win95Panes([
        'paneCollaboration',
        'paneArtifacts',
        'paneWorkshop',
        'paneDetails',
        'paneHistory',
        'paneExport',
        'paneSync',
        'panePublish',
        'paneStore',
      ]),
    },
  },

  // Ivory — neutral tint on parchment base
  {
    id: 'ivory',
    name: 'Ivory',
    section: 'Light',
    overrides: {
      ...LIGHT_SYNTAX,
      bg: '#F2F0EC',
      surface: '#EAE8E2',
      panel: '#E2E0DA',
      accent: '#47473d',
      border: '#c7c4ba',
      text: '#0f0f0a',
      textMuted: '#616153',
      accentMuted: 'rgba(80,80,72,0.12)',
      paneCollaboration: '#903424',
      paneArtifacts: '#77521e',
      paneWorkshop: '#515214',
      paneDetails: '#265f18',
      paneHistory: '#14524a',
      paneExport: '#1e4278',
      paneSync: '#352a6c',
      panePublish: '#7f203f',
      paneStore: '#523914',
      ...ghostPanes(
        {
          paneCollaboration: '#9E4030',
          paneArtifacts: '#8E6020',
          paneWorkshop: '#6E7010',
          paneDetails: '#307020',
          paneHistory: '#206058',
          paneExport: '#305080',
          paneSync: '#484070',
          panePublish: '#803850',
          paneStore: '#684818',
        },
        '#DAD8D0',
        '#6E6E64',
      ),
      bloom1: '#c8b898',
      bloom2: '#b0a898',
      bloom3: '#98b8a8',
      bloom4: '#c0b098',
      bloom5: '#b0b898',
      bloom6: '#98b8a8',
      bloomOpacity: '0.6',
    },
  },

  // Mist — blue tint on parchment base
  {
    id: 'mist',
    name: 'Mist',
    section: 'Light',
    overrides: {
      ...LIGHT_SYNTAX,
      bg: '#EEF0F4',
      surface: '#E4E8EE',
      panel: '#DAE0E8',
      accent: '#2a4d77',
      border: '#b8c1d1',
      text: '#060b14',
      textMuted: '#43596f',
      accentMuted: 'rgba(62,88,120,0.12)',
      paneCollaboration: '#903424',
      paneArtifacts: '#77521e',
      paneWorkshop: '#515214',
      paneDetails: '#265f18',
      paneHistory: '#14524a',
      paneExport: '#1e4278',
      paneSync: '#352a6c',
      panePublish: '#7f203f',
      paneStore: '#523914',
      ...ghostPanes(
        {
          paneCollaboration: '#9E4030',
          paneArtifacts: '#8E6020',
          paneWorkshop: '#6E7010',
          paneDetails: '#307020',
          paneHistory: '#206058',
          paneExport: '#305080',
          paneSync: '#484070',
          panePublish: '#803850',
          paneStore: '#684818',
        },
        '#D0D8E0',
        '#586878',
      ),
      bloom1: '#90a8c8',
      bloom2: '#a890b8',
      bloom3: '#80b0c0',
      bloom4: '#c0a0a8',
      bloom5: '#a0b0a0',
      bloom6: '#80b0b8',
      bloomOpacity: '0.6',
    },
  },

  // Sage — green tint on parchment base
  {
    id: 'sage',
    name: 'Sage',
    section: 'Light',
    overrides: {
      ...LIGHT_SYNTAX,
      bg: '#EEF2EC',
      surface: '#E4ECE0',
      panel: '#DAE4D4',
      accent: '#2e6526',
      border: '#bbc8b5',
      text: '#081105',
      textMuted: '#46663b',
      accentMuted: 'rgba(62,104,56,0.12)',
      paneCollaboration: '#903424',
      paneArtifacts: '#77521e',
      paneWorkshop: '#515214',
      paneDetails: '#265f18',
      paneHistory: '#14524a',
      paneExport: '#1e4278',
      paneSync: '#352a6c',
      panePublish: '#7f203f',
      paneStore: '#523914',
      ...ghostPanes(
        {
          paneCollaboration: '#9E4030',
          paneArtifacts: '#8E6020',
          paneWorkshop: '#6E7010',
          paneDetails: '#307020',
          paneHistory: '#206058',
          paneExport: '#305080',
          paneSync: '#484070',
          panePublish: '#803850',
          paneStore: '#684818',
        },
        '#D0DCC8',
        '#587050',
      ),
      bloom1: '#a8c890',
      bloom2: '#90b0b8',
      bloom3: '#80c8a0',
      bloom4: '#c0b090',
      bloom5: '#a0c080',
      bloom6: '#80c0a0',
      bloomOpacity: '0.6',
    },
  },

  // Rose — pink tint on parchment base
  {
    id: 'rose',
    name: 'Rose',
    section: 'Light',
    overrides: {
      ...LIGHT_SYNTAX,
      bg: '#F4EEEE',
      surface: '#ECE4E4',
      panel: '#E4DADC',
      accent: '#8a293f',
      border: '#c7baba',
      text: '#17070b',
      textMuted: '#6f434e',
      accentMuted: 'rgba(136,64,80,0.12)',
      paneCollaboration: '#903424',
      paneArtifacts: '#77521e',
      paneWorkshop: '#515214',
      paneDetails: '#265f18',
      paneHistory: '#14524a',
      paneExport: '#1e4278',
      paneSync: '#352a6c',
      panePublish: '#7f203f',
      paneStore: '#523914',
      ...ghostPanes(
        {
          paneCollaboration: '#9E4030',
          paneArtifacts: '#8E6020',
          paneWorkshop: '#6E7010',
          paneDetails: '#307020',
          paneHistory: '#206058',
          paneExport: '#305080',
          paneSync: '#484070',
          panePublish: '#803850',
          paneStore: '#684818',
        },
        '#DCD0D0',
        '#785860',
      ),
      bloom1: '#d89098',
      bloom2: '#c880a0',
      bloom3: '#90c0b0',
      bloom4: '#d0a098',
      bloom5: '#c0b890',
      bloom6: '#88b8a8',
      bloomOpacity: '0.6',
    },
  },

  // Parchment — warm cream/brown, the anchor light theme
  {
    id: 'parchment',
    name: 'Parchment',
    section: 'Light',
    overrides: {
      ...LIGHT_SYNTAX,
      bg: '#f4ece0',
      surface: '#ece2d4',
      panel: '#e4d8c8',
      accent: '#6e4513',
      border: '#ccbaa1',
      text: '#140e06',
      textMuted: '#664e2e',
      accentMuted: 'rgba(110,78,40,0.12)',
      paneCollaboration: '#903424',
      paneArtifacts: '#77521e',
      paneWorkshop: '#515214',
      paneDetails: '#265f18',
      paneHistory: '#14524a',
      paneExport: '#1e4278',
      paneSync: '#352a6c',
      panePublish: '#7f203f',
      paneStore: '#523914',
      ...ghostPanes(
        {
          paneCollaboration: '#9E4030',
          paneArtifacts: '#8E6020',
          paneWorkshop: '#6E7010',
          paneDetails: '#307020',
          paneHistory: '#206058',
          paneExport: '#305080',
          paneSync: '#484070',
          panePublish: '#803850',
          paneStore: '#684818',
        },
        '#ddd0c0',
        '#6E5C44',
      ),
      bloom1: '#e0a070',
      bloom2: '#c890b0',
      bloom3: '#80c8b8',
      bloom4: '#d89070',
      bloom5: '#b8b870',
      bloom6: '#70b8a0',
      bloomOpacity: '0.6',
    },
  },
];
