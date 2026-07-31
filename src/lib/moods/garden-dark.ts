/**
 * Garden Dark — The default mood palette.
 *
 * Tokens use var() references to create a cascade:
 * Change a parent token and all children update automatically.
 *
 * Root tokens (the actual colors):
 *   bg, text, textMuted, accent, border, error, warning, success
 *   panel, surface
 *   Each pane's base color
 *
 * Everything else references a parent via var(--parent).
 */

export const GARDEN_DARK = {
  // ══════════════════════════════════════════════════════
  // ROOT TOKENS — the actual colors, everything derives from these
  // ══════════════════════════════════════════════════════

  bg: '#0b0d0c',
  text: '#e8ebe9',
  textMuted: '#98a49e',
  accent: '#72c3a8',
  border: 'rgba(94, 112, 100, 0.28)',
  panel: '#141816',
  surface: '#121513',
  error: '#e63946',
  warning: '#e6a030',
  success: '#4caf50',

  // ══════════════════════════════════════════════════════
  // DERIVED TOKENS — reference parents via var()
  // ══════════════════════════════════════════════════════

  // ── From accent ──────────────────────────────────────
  highlight: 'var(--accent)',
  accentMuted: '#1a2723',
  link: 'var(--accent)',
  linkHover: 'color-mix(in srgb, var(--accent) 80%, white)',
  linkVisited: 'color-mix(in srgb, var(--accent) 80%, #666)',
  linkActive: 'var(--accent)',
  primaryButton: 'var(--accent)',
  primaryButtonHover: 'color-mix(in srgb, var(--accent) 85%, black)',
  primaryButtonText: 'var(--bg)',
  primaryButtonBorder: 'var(--accent)',
  primaryButtonBorderHover: 'color-mix(in srgb, var(--accent) 85%, black)',
  chatUserBubble: 'color-mix(in srgb, var(--accent) 15%, transparent)',
  chatUserBubbleText: 'var(--accent)',
  chatUserBubbleBorder: 'transparent',
  chatSendButton: 'var(--accent)',
  chatSendButtonHover: 'color-mix(in srgb, var(--accent) 85%, black)',
  chatSendButtonIcon: 'var(--bg)',
  chatInputBorderFocus: 'var(--accent)',
  inputBorderActive: 'var(--accent)',
  inputOutline: 'color-mix(in srgb, var(--accent) 30%, transparent)',
  badge: 'color-mix(in srgb, var(--accent) 15%, transparent)',
  badgeText: 'var(--accent)',
  badgeBorder: 'color-mix(in srgb, var(--accent) 20%, transparent)',
  selectionBg: 'color-mix(in srgb, var(--accent) 15%, transparent)',
  selectionText: 'var(--accent)',
  growthCardLabel: 'var(--accent)',
  growthDotActive: 'var(--accent)',
  growthCardActive: 'color-mix(in srgb, var(--accent) 15%, transparent)',
  settingsLabel: 'var(--accent)',
  gatewayButton: 'var(--accent)',
  gatewayButtonHover: 'color-mix(in srgb, var(--accent) 85%, black)',
  spinner: 'var(--accent)',
  spinnerTrack: 'var(--border)',
  flowColor: 'var(--accent)',
  iconButtonIconHover: 'var(--accent)',
  iconButtonHover: 'var(--accent-muted)',
  actionButtonHover: 'var(--accent-muted)',
  actionButtonTextHover: 'var(--text)',
  actionButtonBorderHover: 'color-mix(in srgb, var(--accent) 30%, transparent)',
  profileButtonHover: 'color-mix(in srgb, var(--accent) 15%, transparent)',
  profileButtonIconHover: 'var(--text)',
  gardenCardHover: 'var(--accent-muted)',
  // Note: --accent-muted is auto-computed as solid hex in applyMoodPalette
  gardenCardBorderHover: 'var(--accent)',
  fileTreeItemSelected: 'color-mix(in srgb, var(--accent) 15%, transparent)',
  fileTreeItemTextSelected: 'var(--accent)',
  fileTreeDropTarget: 'color-mix(in srgb, var(--accent) 5%, transparent)',
  fileTreeDropTargetBorder: 'color-mix(in srgb, var(--accent) 40%, transparent)',
  dragHandle: 'color-mix(in srgb, var(--accent) 30%, transparent)',
  dragHandleActive: 'color-mix(in srgb, var(--accent) 50%, transparent)',
  dragTarget: 'color-mix(in srgb, var(--accent) 10%, transparent)',
  dragTargetBorder: 'var(--accent)',
  codeLineHighlight: 'color-mix(in srgb, var(--accent) 8%, transparent)',
  snapshotBanner: 'color-mix(in srgb, var(--accent) 15%, transparent)',
  snapshotBannerBorder: 'color-mix(in srgb, var(--accent) 30%, transparent)',
  snapshotBannerText: 'var(--accent)',
  snapshotBannerButton: 'var(--accent)',
  snapshotBannerButtonHover: 'color-mix(in srgb, var(--accent) 85%, black)',

  // ── From text ────────────────────────────────────────
  title: 'var(--text)',
  heading: 'var(--text)',
  paragraph: 'var(--text)',
  panelText: 'var(--text)',
  surfaceText: 'var(--text)',
  toolbarText: 'var(--text)',
  chatText: 'var(--text)',
  chatAiText: 'var(--text)',
  inputText: 'var(--text)',
  gardenCardTitle: 'var(--text)',
  overlayText: 'var(--text)',
  consoleText: 'var(--text)',
  commandPaletteInputText: 'var(--text)',
  commandPaletteItemText: 'var(--text)',
  publicTopBarText: 'var(--text)',
  tooltipText: 'var(--text)',
  gatewayTitle: 'var(--text)',
  settingsValue: 'var(--text)',
  growthCardText: 'var(--text)',
  fileTreeItemText: 'var(--text)',
  iconButtonText: 'var(--text)',
  iconButtonTextHover: 'var(--accent)',

  // ── From textMuted ───────────────────────────────────
  caption: 'var(--text-muted)',
  panelTextMuted: 'var(--text-muted)',
  surfaceTextMuted: 'var(--text-muted)',
  toolbarTextMuted: 'var(--text-muted)',
  chatTextMuted: 'var(--text-muted)',
  gardenCardText: 'var(--text-muted)',
  gardenCardMeta: 'color-mix(in srgb, var(--text-muted) 75%, transparent)',
  growthCardTextMuted: 'var(--text-muted)',
  growthDot: 'var(--text-muted)',
  fileTreeItemIcon: 'var(--text-muted)',
  consoleTextMuted: 'var(--text-muted)',
  publicTopBarTextMuted: 'var(--text-muted)',
  publicTopBarLink: 'var(--text-muted)',
  publicTopBarLinkHover: 'var(--text)',
  gatewaySubtitle: 'var(--text-muted)',
  actionButtonText: 'var(--text-muted)',
  actionButtonIcon: 'var(--text-muted)',
  iconButtonIcon: 'var(--text-muted)',
  profileButtonIcon: 'var(--text-muted)',
  commandPaletteItemIcon: 'var(--text-muted)',
  scrollbarThumb: 'var(--border)',
  scrollbarThumbHover: 'var(--text-muted)',
  placeholder: '#6a6e6b',
  chatInputPlaceholder: '#6a6e6b',
  commandPaletteItemShortcut: '#6a6e6b',

  // ── From border ──────────────────────────────────────
  panelBorder: 'var(--border)',
  panelBorderHover: 'color-mix(in srgb, var(--border) 160%, transparent)',
  surfaceBorder: 'var(--border)',
  surfaceBorderHover: 'color-mix(in srgb, var(--border) 160%, transparent)',
  toolbarBorder: 'var(--border)',
  toolbarDivider: 'var(--border)',
  chatBorder: 'var(--border)',
  chatInputBorder: 'var(--border)',
  inputBorder: 'var(--border)',
  inputBorderHover: 'color-mix(in srgb, var(--border) 160%, transparent)',
  gardenCardBorder: 'var(--border)',
  overlayBorder: 'var(--border)',
  consoleBorder: 'var(--border)',
  consoleSidebarBorder: 'var(--border)',
  consoleInputBorder: 'var(--border)',
  commandPaletteBorder: 'var(--border)',
  publicTopBarBorder: 'var(--border)',
  tooltipBorder: 'var(--border)',
  tooltipBorderHover: 'color-mix(in srgb, var(--border) 160%, transparent)',
  gatewayPanelBorder: 'var(--border)',
  settingsPanelBorder: 'var(--border)',
  settingsDivider: 'var(--border)',
  growthTimelineBorder: 'var(--border)',
  growthCardBorder: 'var(--border)',
  growthLine: 'var(--border)',
  fileTreeBorder: 'var(--border)',
  codeBlockBorder: 'var(--border)',
  actionButtonBorder: 'var(--border)',
  iconButtonBorder: 'var(--border)',
  iconButtonBorderHover: 'color-mix(in srgb, var(--accent) 30%, transparent)',
  profileButtonBorder: 'var(--border)',
  scrollbarTrack: 'transparent',
  markdownHr: 'var(--border)',
  markdownTableBorder: 'var(--border)',
  markdownBlockquoteBorder: 'color-mix(in srgb, var(--accent) 30%, transparent)',

  // ── From bg ──────────────────────────────────────────
  chat: 'var(--bg)',
  gardenCardThumbnail: 'var(--bg)',
  contrast: '#ffffff',
  previewBg: 'color-mix(in srgb, var(--bg) 80%, transparent)',
  overlay: 'color-mix(in srgb, var(--bg) 65%, transparent)',

  // ── From surface ─────────────────────────────────────
  surfaceSolid: 'color-mix(in srgb, var(--surface) 95%, white)',
  surfaceHover: 'color-mix(in srgb, var(--surface) 85%, white)',
  input: 'var(--surface-solid)',
  chatInput: 'var(--surface-solid)',
  tooltip: 'var(--surface-solid)',
  gatewayPanel: 'var(--surface-solid)',
  commandPaletteInput: 'var(--surface-solid)',
  consoleInput: 'var(--surface-solid)',
  markdownTableHeaderBg: 'var(--surface)',
  markdownBlockquoteBg: 'color-mix(in srgb, var(--accent) 5%, transparent)',
  chatAiBubble: 'color-mix(in srgb, var(--surface) 85%, white)',
  codeBlock: 'color-mix(in srgb, var(--bg) 90%, var(--surface))',
  codeBlockText: 'var(--text)',
  growthCard: 'var(--surface)',
  growthCardHover: 'color-mix(in srgb, var(--surface) 85%, white)',

  // ── From panel ───────────────────────────────────────
  panelHover: 'color-mix(in srgb, var(--panel) 90%, white)',
  gardenCard: 'var(--panel)',
  settingsPanel: 'var(--panel)',
  overlayPanel: 'var(--panel)',
  console: 'var(--panel)',
  consoleSidebar: 'var(--surface)',
  commandPalette: 'var(--panel)',
  commandPaletteItem: 'transparent',
  commandPaletteItemHover: 'color-mix(in srgb, var(--accent) 15%, transparent)',
  fileTree: 'var(--panel)',
  fileTreeItem: 'transparent',
  fileTreeItemHover: 'color-mix(in srgb, var(--surface) 85%, white)',
  growthTimeline: 'var(--panel)',
  toolbar: 'var(--panel)',
  publicTopBar: 'var(--panel)',
  profileButton: 'transparent',
  actionButton: 'transparent',
  iconButton: 'var(--surface)',
  brandAi: '#D97757',
  inputHover: 'color-mix(in srgb, var(--surface) 85%, white)',

  // ── From error ───────────────────────────────────────
  errorMuted: 'color-mix(in srgb, var(--error) 15%, transparent)',
  errorBg: 'var(--error)',
  errorText: 'var(--error)',
  errorBorder: 'color-mix(in srgb, var(--error) 30%, transparent)',
  dangerButton: 'color-mix(in srgb, var(--error) 15%, transparent)',
  dangerButtonHover: 'color-mix(in srgb, var(--error) 25%, transparent)',
  dangerButtonText: 'var(--error)',
  dangerButtonBorder: 'color-mix(in srgb, var(--error) 30%, transparent)',

  // ── From warning ─────────────────────────────────────
  warningMuted: 'color-mix(in srgb, var(--warning) 15%, transparent)',
  warningBg: 'var(--warning)',
  warningText: 'var(--warning)',
  warningBorder: 'color-mix(in srgb, var(--warning) 30%, transparent)',

  // ── From success ─────────────────────────────────────
  successMuted: 'color-mix(in srgb, var(--success) 15%, transparent)',
  successBg: 'var(--success)',
  successText: 'var(--success)',
  successBorder: 'color-mix(in srgb, var(--success) 30%, transparent)',

  // ── Pane base colors ─────────────────────────────────
  paneCollaboration: '#d47080',
  paneArtifacts: '#d4944c',
  paneWorkshop: '#c8a84c',
  paneDetails: '#5cb87a',
  paneHistory: '#4cb8b0',
  paneExport: '#5b9ed4',
  paneSync: '#8c7cc8',
  panePublish: '#c87ca8',
  paneStore: '#c0a070',

  // ── Pane derived (all reference their base) ──────────
  ...paneTokens('paneCollaboration'),
  ...paneTokens('paneArtifacts'),
  ...paneTokens('paneWorkshop'),
  ...paneTokens('paneDetails'),
  ...paneTokens('paneHistory'),
  ...paneTokens('paneExport'),
  ...paneTokens('paneSync'),
  ...paneTokens('panePublish'),
  ...paneTokens('paneStore'),

  // ── Markdown ─────────────────────────────────────────
  markdownText: 'var(--text)',
  markdownHeading: 'var(--text)',
  markdownLink: 'var(--accent)',
  markdownLinkHover: 'color-mix(in srgb, var(--accent) 80%, white)',

  // ── Syntax highlighting ──────────────────────────────
  syntaxComment: 'var(--text-muted)',
  syntaxKeyword: 'var(--accent)',
  syntaxString: 'var(--pane-details)',
  syntaxNumber: 'var(--pane-artifacts)',
  syntaxType: 'var(--pane-export)',
  syntaxFunction: 'var(--pane-workshop)',
  syntaxPunctuation: 'var(--text-muted)',
  syntaxVariable: 'var(--text)',
  syntaxTag: 'var(--pane-collaboration)',
  syntaxAttribute: 'var(--pane-history)',

  // ── Bloom / Ambient — derive from pane colors for mood matching ──
  bloomBg1: 'color-mix(in srgb, var(--bg) 70%, var(--accent))',
  bloomBg2: 'var(--bg)',
  bloom1: 'var(--pane-export)',
  bloom2: 'var(--pane-sync)',
  bloom3: 'var(--pane-history)',
  bloom4: 'var(--pane-collaboration)',
  bloom5: 'var(--pane-workshop)',
  bloom6: 'var(--pane-details)',
  bloomOpacity: '1',
  bloomBlur: '60px',
  bloomSpeed: '1',
  // backgroundType removed — user-controlled, not mood-controlled
  starColor: '#e0e0e0',
  starOpacity: '0.8',
  starSpeed: '1',
  starDensity: '150',
  flowSpeed: '1',
  driftColor: '#d0d0d0',
  driftGlow: '#808080',
  driftBg: '',
  driftSpeed: '1',
  driftDensity: '400',

  // ── Toggle ───────────────────────────────────────────
  toggle: 'var(--surface)',
  toggleActive: 'var(--accent)',
  toggleThumb: 'var(--text-muted)',
  toggleThumbActive: 'var(--bg)',
  toggleBorder: 'var(--border)',

  // ── Dropdown ─────────────────────────────────────────
  dropdown: 'var(--panel)',
  dropdownBorder: 'var(--border)',
  dropdownItem: 'transparent',
  dropdownItemHover: 'color-mix(in srgb, var(--accent) 15%, transparent)',
  dropdownItemActive: 'color-mix(in srgb, var(--accent) 15%, transparent)',
  dropdownItemText: 'var(--text)',
  dropdownItemTextHover: 'var(--accent)',
  dropdownItemIcon: 'var(--text-muted)',
  dropdownDivider: 'var(--border)',

  // ── Model Selector ───────────────────────────────────
  modelSelector: 'var(--surface-solid)',
  modelSelectorBorder: 'var(--border)',
  modelSelectorText: 'var(--text-muted)',
  modelSelectorIcon: 'var(--text-muted)',
  modelSelectorIconHover: 'var(--accent)',
  modelSelectorDropdown: 'var(--panel)',
  modelSelectorItem: 'transparent',
  modelSelectorItemHover: 'color-mix(in srgb, var(--accent) 15%, transparent)',
  modelSelectorItemActive: 'color-mix(in srgb, var(--accent) 15%, transparent)',
  modelSelectorItemText: 'var(--text)',

  // ── Avatar ───────────────────────────────────────────
  avatar: 'color-mix(in srgb, var(--accent) 15%, transparent)',
  avatarBorder: 'var(--border)',
  avatarText: 'var(--accent)',
  avatarPlaceholder: 'color-mix(in srgb, var(--accent) 15%, transparent)',

  // ── Shape ────────────────────────────────────────────
  radius: '0.5rem',
  radiusSm: '0.375rem',
  radiusLg: '0.75rem',

  // ── Typography ───────────────────────────────────────
  fontDisplay: "'JetBrains Mono', monospace",
  fontBody: "'Outfit', sans-serif",
  fontMono: "'JetBrains Mono', monospace",
} as const;

/** Generate derived pane tokens that all reference the base pane color via var() */
function paneTokens(base: string) {
  const varRef = `var(--${base.replace(/([A-Z])/g, '-$1').toLowerCase()})`;
  return {
    [`${base}Button`]: varRef,
    [`${base}ButtonHover`]: `color-mix(in srgb, ${varRef} 10%, transparent)`,
    [`${base}ButtonActive`]: `color-mix(in srgb, ${varRef} 15%, transparent)`,
    [`${base}ButtonIcon`]: varRef,
    [`${base}ButtonIconHover`]: varRef,
    [`${base}ButtonIconActive`]: varRef,
    [`${base}ButtonBorder`]: 'transparent',
    [`${base}ButtonBorderHover`]: `color-mix(in srgb, ${varRef} 20%, transparent)`,
    [`${base}ButtonBorderActive`]: `color-mix(in srgb, ${varRef} 30%, transparent)`,
    [`${base}Header`]: `color-mix(in srgb, ${varRef} 15%, transparent)`,
    [`${base}HeaderBorder`]: `color-mix(in srgb, ${varRef} 20%, transparent)`,
    [`${base}HeaderText`]: varRef,
    [`${base}HeaderIcon`]: varRef,
    [`${base}HeaderClose`]: varRef,
    [`${base}HeaderCloseHover`]: `color-mix(in srgb, ${varRef} 80%, white)`,
  };
}

export type MoodPalette = Record<string, string>;
export type MoodPaletteKey = string;
