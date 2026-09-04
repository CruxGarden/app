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
  accentMuted: '#1a2723',
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
  settingsLabel: 'var(--accent)',
  gatewayButton: 'var(--accent)',
  gatewayButtonHover: 'color-mix(in srgb, var(--accent) 85%, black)',
  flowColor: 'var(--accent)',
  flowBg: 'var(--bg)',
  iconButtonIconHover: 'var(--accent)',
  iconButtonHover: 'var(--accent-muted)',
  actionButtonHover: 'var(--accent-muted)',
  actionButtonTextHover: 'var(--text)',
  actionButtonBorderHover: 'color-mix(in srgb, var(--accent) 30%, transparent)',
  profileButtonHover: 'color-mix(in srgb, var(--accent) 15%, transparent)',
  gardenCardHover: 'var(--accent-muted)',
  // Note: --accent-muted is auto-computed as solid hex in applyMoodPalette
  gardenCardBorderHover: 'var(--accent)',
  fileTreeItemSelected: 'color-mix(in srgb, var(--accent) 15%, transparent)',
  fileTreeItemTextSelected: 'var(--accent)',
  fileTreeDropTarget: 'color-mix(in srgb, var(--accent) 5%, transparent)',
  fileTreeDropTargetBorder: 'color-mix(in srgb, var(--accent) 40%, transparent)',
  snapshotBanner: 'color-mix(in srgb, var(--accent) 15%, transparent)',
  snapshotBannerBorder: 'color-mix(in srgb, var(--accent) 30%, transparent)',
  snapshotBannerText: 'var(--accent)',
  snapshotBannerButton: 'var(--accent)',
  snapshotBannerButtonHover: 'color-mix(in srgb, var(--accent) 85%, black)',

  // ── From text ────────────────────────────────────────
  heading: 'var(--text)',
  panelText: 'var(--text)',
  toolbarText: 'var(--text)',
  chatAiText: 'var(--text)',
  inputText: 'var(--text)',
  gardenCardTitle: 'var(--text)',
  consoleText: 'var(--text)',
  commandPaletteInputText: 'var(--text)',
  commandPaletteItemText: 'var(--text)',
  publicTopBarText: 'var(--text)',
  tooltipText: 'var(--text)',
  gatewayTitle: 'var(--text)',
  settingsValue: 'var(--text)',
  growthCardText: 'var(--text)',
  fileTreeItemText: 'var(--text)',

  // ── From textMuted ───────────────────────────────────
  caption: 'var(--text-muted)',
  surfaceTextMuted: 'var(--text-muted)',
  toolbarTextMuted: 'var(--text-muted)',
  chatTextMuted: 'var(--text-muted)',
  gardenCardText: 'var(--text-muted)',
  gardenCardMeta: 'color-mix(in srgb, var(--text-muted) 75%, transparent)',
  growthCardTextMuted: 'var(--text-muted)',
  consoleTextMuted: 'var(--text-muted)',
  publicTopBarTextMuted: 'var(--text-muted)',
  publicTopBarLink: 'var(--text-muted)',
  publicTopBarLinkHover: 'var(--text)',
  gatewaySubtitle: 'var(--text-muted)',
  actionButtonText: 'var(--text-muted)',
  iconButtonIcon: 'var(--text-muted)',
  profileButtonIcon: 'var(--text-muted)',
  commandPaletteItemIcon: 'var(--text-muted)',
  scrollbarThumb: 'var(--border)',
  scrollbarThumbHover: 'var(--text-muted)',
  placeholder: '#6a6e6b',
  chatInputPlaceholder: '#6a6e6b',

  // ── From border ──────────────────────────────────────
  panelBorder: 'var(--border)',
  surfaceBorder: 'var(--border)',
  toolbarBorder: 'var(--border)',
  toolbarDivider: 'var(--border)',
  chatInputBorder: 'var(--border)',
  inputBorder: 'var(--border)',
  gardenCardBorder: 'var(--border)',
  consoleBorder: 'var(--border)',
  consoleSidebarBorder: 'var(--border)',
  consoleInputBorder: 'var(--border)',
  commandPaletteBorder: 'var(--border)',
  publicTopBarBorder: 'var(--border)',
  tooltipBorder: 'var(--border)',
  settingsPanelBorder: 'var(--border)',
  settingsDivider: 'var(--border)',
  codeBlockBorder: 'var(--border)',
  actionButtonBorder: 'var(--border)',
  profileButtonBorder: 'var(--border)',
  scrollbarTrack: 'transparent',
  markdownHr: 'var(--border)',
  markdownTableBorder: 'var(--border)',
  markdownBlockquoteBorder: 'color-mix(in srgb, var(--accent) 30%, transparent)',

  // ── From bg ──────────────────────────────────────────
  /** the composer strip under the messages — transparent so the pane body shows */
  chatComposer: 'transparent',
  gardenCardThumbnail: 'var(--bg)',
  contrast: '#ffffff',
  previewBg: 'color-mix(in srgb, var(--bg) 80%, transparent)',

  // ── From surface ─────────────────────────────────────
  surfaceSolid: 'color-mix(in srgb, var(--surface) 95%, white)',
  surfaceHover: 'color-mix(in srgb, var(--surface) 85%, white)',
  input: 'var(--surface-solid)',
  chatInput: 'var(--surface-solid)',
  tooltip: 'var(--surface-solid)',
  commandPaletteInput: 'var(--surface-solid)',
  consoleInput: 'var(--surface-solid)',
  markdownTableHeaderBg: 'var(--surface)',
  markdownBlockquoteBg: 'color-mix(in srgb, var(--accent) 5%, transparent)',
  chatAiBubble: 'color-mix(in srgb, var(--surface) 85%, white)',
  codeBlock: 'color-mix(in srgb, var(--bg) 90%, var(--surface))',
  // Monaco reads this (a plain color — Monaco cannot take color-mix or gradients)
  editorBackground: 'var(--bg)',
  codeBlockText: 'var(--text)',
  growthCard: 'var(--surface)',

  // ── From panel ───────────────────────────────────────
  gardenCard: 'var(--panel)',
  settingsPanel: 'var(--panel)',
  console: 'var(--panel)',
  consoleSidebar: 'var(--surface)',
  commandPalette: 'var(--panel)',
  commandPaletteItem: 'transparent',
  commandPaletteItemHover: 'color-mix(in srgb, var(--accent) 15%, transparent)',
  fileTreeItem: 'transparent',
  fileTreeItemHover: 'color-mix(in srgb, var(--surface) 85%, white)',
  // States, per-component radii, shadows, meters, sizes (theme coverage pass 2026-09-04)
  chatAiBubbleText: 'var(--chat-ai-text)',
  chatAiBubbleBorder: 'transparent',
  chatInputText: 'var(--text)',
  onError: '#ffffff',
  glassBlur: '12px',
  focusRing: 'var(--accent)',
  focusRingWidth: '2px',
  focusRingOffset: '1px',
  disabledOpacity: '0.5',
  hoverBrightness: '1.1',
  activeBrightness: '0.95',
  paneHeaderHoverBrightness: '1.15',
  cardHoverLift: '2px',
  buttonRadius: 'var(--radius-sm)',
  inputRadius: 'var(--radius-sm)',
  cardRadius: 'var(--radius)',
  chipRadius: '9999px',
  tooltipRadius: 'var(--radius)',
  dropdownRadius: 'var(--radius-sm)',
  bubbleRadius: 'var(--radius)',
  elevationDropdown: '0 10px 15px -3px rgb(0 0 0 / 0.25), 0 4px 6px -4px rgb(0 0 0 / 0.2)',
  elevationTooltip: '0 10px 15px -3px rgb(0 0 0 / 0.25), 0 4px 6px -4px rgb(0 0 0 / 0.2)',
  meterTrack: 'var(--surface)',
  meterFill: 'var(--accent)',
  meterWarn: 'var(--warning)',
  meterDanger: 'var(--error)',
  meterRadius: '9999px',
  meterHeight: '6px',
  buttonDisabled: 'var(--border)',
  buttonDisabledText: 'var(--text-muted)',
  toolbarHeight: '48px',
  fileTreeRowHeight: '26px',
  fileTreeIndent: '20px',
  toggleWidth: '28px',
  toggleHeight: '16px',
  scrollbarWidth: '6px',
  // Mood bar (the soundscape control in the top bar)
  moodBar: 'var(--surface)',
  moodBarBorder: 'var(--border)',
  moodBarText: 'var(--text)',
  moodBarTextMuted: 'var(--text-muted)',
  moodBarAccent: 'var(--accent)',
  moodBarAccentText: 'var(--bg)',
  moodBarHover: 'var(--accent-muted)',
  moodBarRadius: '9999px',
  moodBarShadow: 'none',
  toolbar: 'var(--panel)',
  // the username link in the top bar (accent by default; a Mood with an accent-coloured toolbar recolours it)
  toolbarLink: 'var(--accent)',
  publicTopBar: 'var(--panel)',
  profileButton: 'transparent',
  actionButton: 'transparent',
  brandAi: '#D97757',

  // ── From error ───────────────────────────────────────
  errorMuted: 'color-mix(in srgb, var(--error) 15%, transparent)',
  dangerButton: 'color-mix(in srgb, var(--error) 15%, transparent)',
  dangerButtonHover: 'color-mix(in srgb, var(--error) 25%, transparent)',
  dangerButtonText: 'var(--error)',
  dangerButtonBorder: 'color-mix(in srgb, var(--error) 30%, transparent)',

  // ── From warning ─────────────────────────────────────
  warningBg: 'var(--warning)',
  warningText: 'var(--warning)',
  warningBorder: 'color-mix(in srgb, var(--warning) 30%, transparent)',

  // ── From success ─────────────────────────────────────

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

  // ── Overlay badges (labels drawn over thumbnails) ─────
  overlayBadge: 'rgba(0, 0, 0, 0.55)',
  overlayBadgeText: '#ffffff',

  // ── Toggle ───────────────────────────────────────────
  toggle: 'var(--surface)',
  toggleActive: 'var(--accent)',
  toggleThumb: 'var(--text-muted)',
  toggleThumbActive: 'var(--bg)',
  toggleBorder: 'var(--border)',

  // ── Dropdown ─────────────────────────────────────────
  dropdown: 'var(--panel)',
  dropdownBorder: 'var(--border)',

  // ── Model Selector ───────────────────────────────────
  modelSelectorBorder: 'var(--border)',
  modelSelectorDropdown: 'var(--panel)',

  // ── Avatar ───────────────────────────────────────────

  // ── Shape ────────────────────────────────────────────
  radius: '0.5rem',
  radiusSm: '0.375rem',
  radiusLg: '0.75rem',

  // ── Workspace layout (the mosaic chrome) ─────────────
  paneGap: '4px',
  paneRadius: 'var(--radius)',
  paneBorderWidth: '1px',
  paneHeaderHeight: '28px',
  paneHeaderRadius: 'var(--radius-sm)',
  paneHeaderPadding: '6px',
  workspacePadding: '4px',
  // Pane header anatomy
  paneHeaderLabelFont: 'var(--font-mono)',
  paneHeaderLabelSize: '11px',
  paneHeaderLabelWeight: '400',
  paneHeaderLabelCase: 'uppercase',
  paneHeaderLabelTracking: '0.05em',
  paneHeaderIconDisplay: 'inline-flex',
  paneHeaderCloseDisplay: 'inline-flex',
  paneHeaderJustify: 'space-between',

  // ── Density & type scale ─────────────────────────────
  // fontScale multiplies the root font size (every rem-based size follows);
  // density multiplies Tailwind's spacing unit (every padding/gap follows).
  fontScale: '1',
  density: '1',
  lineHeightBody: '1.5',
  fontWeightBody: '400',
  letterSpacingBody: '0',
  letterSpacingDisplay: '0',
  letterSpacingMono: '0',

  // ── Elevation ────────────────────────────────────────
  elevationPanel: '0 10px 15px -3px rgb(0 0 0 / 0.05), 0 4px 6px -4px rgb(0 0 0 / 0.05)',
  elevationCard: 'none',
  elevationCardHover: '0 10px 15px -3px rgb(0 0 0 / 0.2), 0 4px 6px -4px rgb(0 0 0 / 0.2)',
  elevationModal: '0 24px 80px -16px rgb(0 0 0 / 0.65)',
  scrim:
    'radial-gradient(ellipse 120% 90% at center, rgb(0 0 0 / 0.55) 0%, rgb(0 0 0 / 0.82) 100%)',

  // ── Motion ───────────────────────────────────────────
  // Multiplies the default transition duration (0 = instant)
  motionScale: '1',

  // ── Editor (Monaco) ──────────────────────────────────
  editorFontSize: '13px',
  editorGutter: 'var(--editor-background)',
  editorCursor: 'var(--accent)',
  editorSelection: 'color-mix(in srgb, var(--accent) 30%, transparent)',

  // ── Textures & grain (images from the Mood's assets: asset:<fingerprint>) ──
  workspaceTexture: 'none',
  workspaceTextureSize: 'cover',
  workspaceTextureBlend: 'normal',
  workspaceTextureOpacity: '1',
  grainOpacity: '0',

  // ── Font assets (asset:<fingerprint> of a .woff2/.ttf → families MoodFontDisplay/Body/Mono) ──
  fontFaceDisplay: 'none',
  fontFaceBody: 'none',
  fontFaceMono: 'none',

  // ── Image background ─────────────────────────────────
  bgImageDim: '0',
  bgImageBlur: '0px',
  bgImageFit: 'cover',
  bgImagePosition: 'center',
  bgImageScale: '1',

  // ── Home grid ────────────────────────────────────────
  gardenCardMinWidth: '220px',
  gardenCardAspect: '16 / 10',
  gardenGridGap: '1rem',
  growthCardAspect: '16 / 10',

  // ── Typography ───────────────────────────────────────
  fontDisplay: "'JetBrains Mono', monospace",
  fontBody: "'Outfit', sans-serif",
  fontMono: "'JetBrains Mono', monospace",
} as const;

/** Generate derived pane tokens that all reference the base pane color via var() */
function paneTokens(base: string) {
  const varRef = `var(--${base.replace(/([A-Z])/g, '-$1').toLowerCase()})`;
  return {
    [`${base}ButtonHover`]: `color-mix(in srgb, ${varRef} 10%, transparent)`,
    [`${base}ButtonActive`]: `color-mix(in srgb, ${varRef} 15%, transparent)`,
    [`${base}ButtonIcon`]: varRef,
    [`${base}ButtonIconHover`]: varRef,
    [`${base}ButtonIconActive`]: varRef,
    [`${base}ButtonBorderHover`]: `color-mix(in srgb, ${varRef} 20%, transparent)`,
    [`${base}ButtonBorderActive`]: `color-mix(in srgb, ${varRef} 30%, transparent)`,
    [`${base}Header`]: `color-mix(in srgb, ${varRef} 15%, transparent)`,
    [`${base}HeaderBorder`]: `color-mix(in srgb, ${varRef} 20%, transparent)`,
    [`${base}HeaderText`]: varRef,
    [`${base}HeaderIcon`]: varRef,
    [`${base}HeaderClose`]: varRef,
    [`${base}HeaderCloseHover`]: `color-mix(in srgb, ${varRef} 80%, white)`,
    // Surface: what the pane's body looks like. Each defaults to the shared
    // token, so a Mood can restyle one pane (the Workshop darker, Share
    // rounder) without touching the others. WorkspaceLayout's CSS rebinds
    // the generic tokens (--panel, --border, --radius, --text, --surface,
    // --accent) to these inside each pane, so pane content needs no changes.
    [`${base}Body`]: 'var(--panel)',
    [`${base}Border`]: 'var(--border)',
    [`${base}Radius`]: 'var(--pane-radius)',
    [`${base}Text`]: 'var(--text)',
    [`${base}TextMuted`]: 'var(--text-muted)',
    [`${base}Surface`]: 'var(--surface)',
    [`${base}Accent`]: 'var(--accent)',
    [`${base}AccentMuted`]: 'var(--accent-muted)',
    [`${base}SurfaceSolid`]: 'var(--surface-solid)',
    [`${base}RadiusSm`]: 'var(--radius-sm)',
    [`${base}Caption`]: 'var(--caption)',
    [`${base}Heading`]: 'var(--heading)',
    [`${base}HeaderRadius`]: 'var(--pane-header-radius)',
    [`${base}HeaderHeight`]: 'var(--pane-header-height)',
    [`${base}BorderWidth`]: 'var(--pane-border-width)',
    [`${base}HeaderLabelCase`]: 'var(--pane-header-label-case)',
    [`${base}HeaderJustify`]: 'var(--pane-header-justify)',
    // "0" = still; "infinite" = pulse the frame (the AI uses this to signal work)
    [`${base}Pulse`]: '0',
    // Texture: an image (asset:<fingerprint>, a url(), or none) laid over the body color
    [`${base}Texture`]: 'none',
    [`${base}TextureSize`]: 'auto',
    [`${base}TextureBlend`]: 'normal',
  };
}

export type MoodPalette = Record<string, string>;
export type MoodPaletteKey = string;
