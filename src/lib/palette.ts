/**
 * Palette type definitions and constants.
 *
 * Every UI property is a CSS custom property (--bg, --text, --accent, etc.).
 * A Palette object maps these keys to values.
 *
 * Runtime palette overrides are disabled for now — the CSS-defined defaults
 * in globals.css are the source of truth.
 */

export interface Palette {
  // ── Page ─────────────────────────────────────────
  bg: string;
  text: string;
  textMuted: string;
  border: string;

  // ── Surface ──────────────────────────────────────
  surface: string;
  surfaceSolid: string;
  surfaceHover: string;
  surfaceText: string;
  surfaceTextMuted: string;
  surfaceBorder: string;

  // ── Panel ────────────────────────────────────────
  panel: string;
  panelHover: string;
  panelText: string;
  panelTextMuted: string;
  panelBorder: string;

  // ── Toolbar ──────────────────────────────────────
  toolbarBg: string;
  toolbarText: string;
  toolbarTextMuted: string;
  toolbarBorder: string;
  toolbarHover: string;
  toolbarActive: string;

  // ── Chat ─────────────────────────────────────────
  chatBg: string;
  chatText: string;
  chatTextMuted: string;
  chatBorder: string;
  chatUserBg: string;
  chatUserText: string;
  chatAiBg: string;
  chatAiText: string;

  // ── Input ────────────────────────────────────────
  inputBg: string;
  inputText: string;
  inputPlaceholder: string;
  inputBorder: string;
  inputBorderFocus: string;
  inputHover: string;

  // ── Accent ───────────────────────────────────────
  accent: string;
  accentBg: string;
  accentText: string;
  accentHover: string;
  accentMuted: string;
  accentBorder: string;

  // ── Error ────────────────────────────────────────
  error: string;
  errorBg: string;
  errorText: string;
  errorMuted: string;
  errorBorder: string;

  // ── Warning ──────────────────────────────────────
  warning: string;
  warningBg: string;
  warningText: string;
  warningMuted: string;
  warningBorder: string;

  // ── Success ──────────────────────────────────────
  success: string;
  successBg: string;
  successText: string;
  successMuted: string;
  successBorder: string;

  // ── Overlay ──────────────────────────────────────
  overlay: string;
  overlayBg: string;
  overlayText: string;
  overlayBorder: string;

  // ── Chrome ───────────────────────────────────────
  contrast: string;
  previewBg: string;
  brandAi: string;

  // ── Scrollbar ────────────────────────────────────
  scrollbarTrack: string;
  scrollbarThumb: string;
  scrollbarThumbHover: string;

  // ── Selection ────────────────────────────────────
  selectionBg: string;
  selectionText: string;
  itemSelectedBg: string;
  itemSelectedText: string;
  itemHoverBg: string;

  // ── Tooltip ──────────────────────────────────────
  tooltipBg: string;
  tooltipText: string;
  tooltipBorder: string;

  // ── Badge ────────────────────────────────────────
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;

  // ── Drag ─────────────────────────────────────────
  dragTargetBg: string;
  dragTargetBorder: string;
  dragHandle: string;
  dragHandleActive: string;

  // ── Spinner ──────────────────────────────────────
  spinnerColor: string;
  spinnerTrack: string;

  // ── Pane: Collaboration ───────────────────────────
  paneCollaboration: string;
  paneCollaborationBg: string;
  paneCollaborationText: string;
  paneCollaborationBorder: string;
  paneCollaborationIcon: string;
  paneCollaborationBtnBg: string;
  paneCollaborationBtnHover: string;

  // ── Pane: Artifacts ──────────────────────────────
  paneArtifacts: string;
  paneArtifactsBg: string;
  paneArtifactsText: string;
  paneArtifactsBorder: string;
  paneArtifactsIcon: string;
  paneArtifactsBtnBg: string;
  paneArtifactsBtnHover: string;

  // ── Pane: Workshop ───────────────────────────────
  paneWorkshop: string;
  paneWorkshopBg: string;
  paneWorkshopText: string;
  paneWorkshopBorder: string;
  paneWorkshopIcon: string;
  paneWorkshopBtnBg: string;
  paneWorkshopBtnHover: string;

  // ── Pane: Details ────────────────────────────────
  paneDetails: string;
  paneDetailsBg: string;
  paneDetailsText: string;
  paneDetailsBorder: string;
  paneDetailsIcon: string;
  paneDetailsBtnBg: string;
  paneDetailsBtnHover: string;

  // ── Pane: History ────────────────────────────────
  paneHistory: string;
  paneHistoryBg: string;
  paneHistoryText: string;
  paneHistoryBorder: string;
  paneHistoryIcon: string;
  paneHistoryBtnBg: string;
  paneHistoryBtnHover: string;

  // ── Pane: Export ─────────────────────────────────
  paneExport: string;
  paneExportBg: string;
  paneExportText: string;
  paneExportBorder: string;
  paneExportIcon: string;
  paneExportBtnBg: string;
  paneExportBtnHover: string;

  // ── Pane: Sync ───────────────────────────────────
  paneSync: string;
  paneSyncBg: string;
  paneSyncText: string;
  paneSyncBorder: string;
  paneSyncIcon: string;
  paneSyncBtnBg: string;
  paneSyncBtnHover: string;

  // ── Pane: Publish ────────────────────────────────
  panePublish: string;
  panePublishBg: string;
  panePublishText: string;
  panePublishBorder: string;
  panePublishIcon: string;
  panePublishBtnBg: string;
  panePublishBtnHover: string;

  // ── Code / Syntax ────────────────────────────────
  codeBg: string;
  codeText: string;
  codeBorder: string;
  syntaxComment: string;
  syntaxKeyword: string;
  syntaxString: string;
  syntaxNumber: string;
  syntaxType: string;
  syntaxFunction: string;
  syntaxPunctuation: string;
  syntaxVariable: string;
  syntaxTag: string;
  syntaxAttribute: string;

  // ── Bloom gradient ───────────────────────────────
  bloomBg1: string;
  bloomBg2: string;
  bloom1: string;
  bloom2: string;
  bloom3: string;
  bloom4: string;
  bloom5: string;
  bloom6: string;

  // ── Bloom animation ──────────────────────────────
  bloomOpacity: string;
  bloomBlur: string;
  bloomSpeed: string;

  // ── Background type ──────────────────────────────
  backgroundType: string;

  // ── Starfield ────────────────────────────────────
  starColor: string;
  starOpacity: string;
  starSpeed: string;
  starDensity: string;

  // ── Flow field ───────────────────────────────────
  flowColor: string;
  flowSpeed: string;

  // ── Drift ────────────────────────────────────────
  driftColor: string;
  driftSpeed: string;
  driftDensity: string;
  driftGlow: string;
  driftBg: string;

  // ── Shape ────────────────────────────────────────
  radius: string;
  radiusSm: string;

  // ── Font ─────────────────────────────────────────
  fontDisplay: string;
  fontBody: string;
  fontMono: string;
}

export const DARK_PALETTE: Palette = {
  // Page
  bg: '#0b0d0c',
  text: '#e2e4e3',
  textMuted: '#8b908d',
  border: 'rgba(82, 96, 86, 0.18)',

  // Surface
  surface: '#121513',
  surfaceSolid: '#131514',
  surfaceHover: '#181b19',
  surfaceText: '#e2e4e3',
  surfaceTextMuted: '#8b908d',
  surfaceBorder: 'rgba(82, 96, 86, 0.18)',

  // Panel
  panel: '#141816',
  panelHover: '#1a1d1b',
  panelText: '#e2e4e3',
  panelTextMuted: '#8b908d',
  panelBorder: 'rgba(82, 96, 86, 0.18)',

  // Toolbar
  toolbarBg: '#131514',
  toolbarText: '#e2e4e3',
  toolbarTextMuted: '#8b908d',
  toolbarBorder: 'rgba(82, 96, 86, 0.18)',
  toolbarHover: '#1a2723',
  toolbarActive: '#1a2723',

  // Chat
  chatBg: '#0b0d0c',
  chatText: '#e2e4e3',
  chatTextMuted: '#8b908d',
  chatBorder: 'rgba(82, 96, 86, 0.18)',
  chatUserBg: '#1a2723',
  chatUserText: '#7db3a3',
  chatAiBg: '#181b19',
  chatAiText: '#e2e4e3',

  // Input
  inputBg: '#131514',
  inputText: '#e2e4e3',
  inputPlaceholder: '#6a6e6b',
  inputBorder: 'rgba(82, 96, 86, 0.18)',
  inputBorderFocus: '#7db3a3',
  inputHover: '#181b19',

  // Accent
  accent: '#7db3a3',
  accentBg: '#7db3a3',
  accentText: '#0b0d0c',
  accentHover: '#6da393',
  accentMuted: '#1a2723',
  accentBorder: 'rgba(125, 179, 163, 0.3)',

  // Error
  error: '#e63946',
  errorBg: '#e63946',
  errorText: '#ffffff',
  errorMuted: 'rgba(230, 57, 70, 0.15)',
  errorBorder: 'rgba(230, 57, 70, 0.3)',

  // Warning
  warning: '#e6a030',
  warningBg: '#e6a030',
  warningText: '#0b0d0c',
  warningMuted: 'rgba(230, 160, 48, 0.15)',
  warningBorder: 'rgba(230, 160, 48, 0.3)',

  // Success
  success: '#4caf50',
  successBg: '#4caf50',
  successText: '#0b0d0c',
  successMuted: 'rgba(76, 175, 80, 0.15)',
  successBorder: 'rgba(76, 175, 80, 0.3)',

  // Overlay
  overlay: 'rgba(0, 0, 0, 0.5)',
  overlayBg: '#141816',
  overlayText: '#e2e4e3',
  overlayBorder: 'rgba(82, 96, 86, 0.18)',

  // Chrome
  contrast: '#ffffff',
  previewBg: 'rgba(0, 0, 0, 0.2)',
  brandAi: '#D97757',

  // Scrollbar
  scrollbarTrack: 'transparent',
  scrollbarThumb: 'rgba(82, 96, 86, 0.18)',
  scrollbarThumbHover: '#8b908d',

  // Selection
  selectionBg: '#1a2723',
  selectionText: '#7db3a3',
  itemSelectedBg: '#1a2723',
  itemSelectedText: '#7db3a3',
  itemHoverBg: '#181b19',

  // Tooltip
  tooltipBg: '#131514',
  tooltipText: '#e2e4e3',
  tooltipBorder: 'rgba(82, 96, 86, 0.18)',

  // Badge
  badgeBg: '#1a2723',
  badgeText: '#7db3a3',
  badgeBorder: 'rgba(125, 179, 163, 0.2)',

  // Drag
  dragTargetBg: 'rgba(125, 179, 163, 0.1)',
  dragTargetBorder: '#7db3a3',
  dragHandle: 'rgba(125, 179, 163, 0.3)',
  dragHandleActive: 'rgba(125, 179, 163, 0.5)',

  // Spinner
  spinnerColor: '#7db3a3',
  spinnerTrack: 'rgba(82, 96, 86, 0.18)',

  // Pane: Collaboration
  paneCollaboration: '#d47080',
  paneCollaborationBg: 'rgba(212, 112, 128, 0.15)',
  paneCollaborationText: '#d47080',
  paneCollaborationBorder: 'rgba(212, 112, 128, 0.2)',
  paneCollaborationIcon: '#d47080',
  paneCollaborationBtnBg: 'rgba(212, 112, 128, 0.15)',
  paneCollaborationBtnHover: 'rgba(212, 112, 128, 0.1)',

  // Pane: Artifacts
  paneArtifacts: '#d4944c',
  paneArtifactsBg: 'rgba(212, 148, 76, 0.15)',
  paneArtifactsText: '#d4944c',
  paneArtifactsBorder: 'rgba(212, 148, 76, 0.2)',
  paneArtifactsIcon: '#d4944c',
  paneArtifactsBtnBg: 'rgba(212, 148, 76, 0.15)',
  paneArtifactsBtnHover: 'rgba(212, 148, 76, 0.1)',

  // Pane: Workshop
  paneWorkshop: '#c8a84c',
  paneWorkshopBg: 'rgba(200, 168, 76, 0.15)',
  paneWorkshopText: '#c8a84c',
  paneWorkshopBorder: 'rgba(200, 168, 76, 0.2)',
  paneWorkshopIcon: '#c8a84c',
  paneWorkshopBtnBg: 'rgba(200, 168, 76, 0.15)',
  paneWorkshopBtnHover: 'rgba(200, 168, 76, 0.1)',

  // Pane: Details
  paneDetails: '#5cb87a',
  paneDetailsBg: 'rgba(92, 184, 122, 0.15)',
  paneDetailsText: '#5cb87a',
  paneDetailsBorder: 'rgba(92, 184, 122, 0.2)',
  paneDetailsIcon: '#5cb87a',
  paneDetailsBtnBg: 'rgba(92, 184, 122, 0.15)',
  paneDetailsBtnHover: 'rgba(92, 184, 122, 0.1)',

  // Pane: History
  paneHistory: '#4cb8b0',
  paneHistoryBg: 'rgba(76, 184, 176, 0.15)',
  paneHistoryText: '#4cb8b0',
  paneHistoryBorder: 'rgba(76, 184, 176, 0.2)',
  paneHistoryIcon: '#4cb8b0',
  paneHistoryBtnBg: 'rgba(76, 184, 176, 0.15)',
  paneHistoryBtnHover: 'rgba(76, 184, 176, 0.1)',

  // Pane: Export
  paneExport: '#5b9ed4',
  paneExportBg: 'rgba(91, 158, 212, 0.15)',
  paneExportText: '#5b9ed4',
  paneExportBorder: 'rgba(91, 158, 212, 0.2)',
  paneExportIcon: '#5b9ed4',
  paneExportBtnBg: 'rgba(91, 158, 212, 0.15)',
  paneExportBtnHover: 'rgba(91, 158, 212, 0.1)',

  // Pane: Sync
  paneSync: '#8c7cc8',
  paneSyncBg: 'rgba(140, 124, 200, 0.15)',
  paneSyncText: '#8c7cc8',
  paneSyncBorder: 'rgba(140, 124, 200, 0.2)',
  paneSyncIcon: '#8c7cc8',
  paneSyncBtnBg: 'rgba(140, 124, 200, 0.15)',
  paneSyncBtnHover: 'rgba(140, 124, 200, 0.1)',

  // Pane: Publish
  panePublish: '#c87ca8',
  panePublishBg: 'rgba(200, 124, 168, 0.15)',
  panePublishText: '#c87ca8',
  panePublishBorder: 'rgba(200, 124, 168, 0.2)',
  panePublishIcon: '#c87ca8',
  panePublishBtnBg: 'rgba(200, 124, 168, 0.15)',
  panePublishBtnHover: 'rgba(200, 124, 168, 0.1)',

  // Code
  codeBg: '#0e110f',
  codeText: '#e2e4e3',
  codeBorder: 'rgba(82, 96, 86, 0.18)',
  syntaxComment: '#6a7a6e',
  syntaxKeyword: '#7db3a3',
  syntaxString: '#a8d4c4',
  syntaxNumber: '#c4956a',
  syntaxType: '#9bc4b6',
  syntaxFunction: '#b8d8ca',
  syntaxPunctuation: '#8b908d',
  syntaxVariable: '#c8d4cc',
  syntaxTag: '#d47080',
  syntaxAttribute: '#c8a84c',

  // Bloom
  bloomBg1: '#0a1810',
  bloomBg2: '#060d08',
  bloom1: '#1a5a99',
  bloom2: '#8a4a99',
  bloom3: '#4a8a99',
  bloom4: '#994a3a',
  bloom5: '#7a7a3a',
  bloom6: '#3a8a7a',
  bloomOpacity: '1',
  bloomBlur: '60px',
  bloomSpeed: '1',
  backgroundType: 'bloom',

  // Starfield
  starColor: '#e0e0e0',
  starOpacity: '0.8',
  starSpeed: '1',
  starDensity: '150',

  // Flow
  flowColor: '#7db3a3',
  flowSpeed: '1',

  // Drift
  driftColor: '#d0d0d0',
  driftSpeed: '1',
  driftDensity: '400',
  driftGlow: '#808080',
  driftBg: '',

  // Shape
  radius: '0.5rem',
  radiusSm: '0.375rem',

  // Font
  fontDisplay: "'JetBrains Mono', monospace",
  fontBody: "'Outfit', sans-serif",
  fontMono: "'JetBrains Mono', monospace",
};

export const LIGHT_PALETTE: Palette = {
  // Page
  bg: '#d8d8d8',
  text: '#1c211d',
  textMuted: '#616864',
  border: 'rgba(82, 96, 86, 0.2)',

  // Surface
  surface: '#d2d2d2',
  surfaceSolid: '#d3d3d3',
  surfaceHover: '#c8c8c8',
  surfaceText: '#1c211d',
  surfaceTextMuted: '#616864',
  surfaceBorder: 'rgba(82, 96, 86, 0.2)',

  // Panel
  panel: '#d6d6d6',
  panelHover: '#cccccc',
  panelText: '#1c211d',
  panelTextMuted: '#616864',
  panelBorder: 'rgba(82, 96, 86, 0.2)',

  // Toolbar
  toolbarBg: '#d3d3d3',
  toolbarText: '#1c211d',
  toolbarTextMuted: '#616864',
  toolbarBorder: 'rgba(82, 96, 86, 0.2)',
  toolbarHover: '#c2d5ce',
  toolbarActive: '#c2d5ce',

  // Chat
  chatBg: '#d8d8d8',
  chatText: '#1c211d',
  chatTextMuted: '#616864',
  chatBorder: 'rgba(82, 96, 86, 0.2)',
  chatUserBg: '#c2d5ce',
  chatUserText: '#3a7064',
  chatAiBg: '#cccccc',
  chatAiText: '#1c211d',

  // Input
  inputBg: '#d3d3d3',
  inputText: '#1c211d',
  inputPlaceholder: '#808580',
  inputBorder: 'rgba(82, 96, 86, 0.2)',
  inputBorderFocus: '#4a8074',
  inputHover: '#cccccc',

  // Accent
  accent: '#4a8074',
  accentBg: '#4a8074',
  accentText: '#ffffff',
  accentHover: '#3a7064',
  accentMuted: '#c2d5ce',
  accentBorder: 'rgba(74, 128, 116, 0.3)',

  // Error
  error: '#c5303b',
  errorBg: '#c5303b',
  errorText: '#ffffff',
  errorMuted: 'rgba(197, 48, 59, 0.12)',
  errorBorder: 'rgba(197, 48, 59, 0.3)',

  // Warning
  warning: '#c08820',
  warningBg: '#c08820',
  warningText: '#1c211d',
  warningMuted: 'rgba(192, 136, 32, 0.12)',
  warningBorder: 'rgba(192, 136, 32, 0.3)',

  // Success
  success: '#3a8a40',
  successBg: '#3a8a40',
  successText: '#ffffff',
  successMuted: 'rgba(58, 138, 64, 0.12)',
  successBorder: 'rgba(58, 138, 64, 0.3)',

  // Overlay
  overlay: 'rgba(0, 0, 0, 0.4)',
  overlayBg: '#d6d6d6',
  overlayText: '#1c211d',
  overlayBorder: 'rgba(82, 96, 86, 0.2)',

  // Chrome
  contrast: '#ebebeb',
  previewBg: 'rgba(0, 0, 0, 0.06)',
  brandAi: '#D97757',

  // Scrollbar
  scrollbarTrack: 'transparent',
  scrollbarThumb: 'rgba(82, 96, 86, 0.2)',
  scrollbarThumbHover: '#616864',

  // Selection
  selectionBg: '#c2d5ce',
  selectionText: '#4a8074',
  itemSelectedBg: '#c2d5ce',
  itemSelectedText: '#3a7064',
  itemHoverBg: '#cccccc',

  // Tooltip
  tooltipBg: '#d3d3d3',
  tooltipText: '#1c211d',
  tooltipBorder: 'rgba(82, 96, 86, 0.2)',

  // Badge
  badgeBg: '#c2d5ce',
  badgeText: '#3a7064',
  badgeBorder: 'rgba(74, 128, 116, 0.2)',

  // Drag
  dragTargetBg: 'rgba(74, 128, 116, 0.1)',
  dragTargetBorder: '#4a8074',
  dragHandle: 'rgba(74, 128, 116, 0.3)',
  dragHandleActive: 'rgba(74, 128, 116, 0.5)',

  // Spinner
  spinnerColor: '#4a8074',
  spinnerTrack: 'rgba(82, 96, 86, 0.2)',

  // Pane: Collaboration
  paneCollaboration: '#c45868',
  paneCollaborationBg: 'rgba(196, 88, 104, 0.12)',
  paneCollaborationText: '#c45868',
  paneCollaborationBorder: 'rgba(196, 88, 104, 0.18)',
  paneCollaborationIcon: '#c45868',
  paneCollaborationBtnBg: 'rgba(196, 88, 104, 0.12)',
  paneCollaborationBtnHover: 'rgba(196, 88, 104, 0.08)',

  // Pane: Artifacts
  paneArtifacts: '#c47c3c',
  paneArtifactsBg: 'rgba(196, 124, 60, 0.12)',
  paneArtifactsText: '#c47c3c',
  paneArtifactsBorder: 'rgba(196, 124, 60, 0.18)',
  paneArtifactsIcon: '#c47c3c',
  paneArtifactsBtnBg: 'rgba(196, 124, 60, 0.12)',
  paneArtifactsBtnHover: 'rgba(196, 124, 60, 0.08)',

  // Pane: Workshop
  paneWorkshop: '#b8903c',
  paneWorkshopBg: 'rgba(184, 144, 60, 0.12)',
  paneWorkshopText: '#b8903c',
  paneWorkshopBorder: 'rgba(184, 144, 60, 0.18)',
  paneWorkshopIcon: '#b8903c',
  paneWorkshopBtnBg: 'rgba(184, 144, 60, 0.12)',
  paneWorkshopBtnHover: 'rgba(184, 144, 60, 0.08)',

  // Pane: Details
  paneDetails: '#4a9e68',
  paneDetailsBg: 'rgba(74, 158, 104, 0.12)',
  paneDetailsText: '#4a9e68',
  paneDetailsBorder: 'rgba(74, 158, 104, 0.18)',
  paneDetailsIcon: '#4a9e68',
  paneDetailsBtnBg: 'rgba(74, 158, 104, 0.12)',
  paneDetailsBtnHover: 'rgba(74, 158, 104, 0.08)',

  // Pane: History
  paneHistory: '#3a9e98',
  paneHistoryBg: 'rgba(58, 158, 152, 0.12)',
  paneHistoryText: '#3a9e98',
  paneHistoryBorder: 'rgba(58, 158, 152, 0.18)',
  paneHistoryIcon: '#3a9e98',
  paneHistoryBtnBg: 'rgba(58, 158, 152, 0.12)',
  paneHistoryBtnHover: 'rgba(58, 158, 152, 0.08)',

  // Pane: Export
  paneExport: '#4a86bc',
  paneExportBg: 'rgba(74, 134, 188, 0.12)',
  paneExportText: '#4a86bc',
  paneExportBorder: 'rgba(74, 134, 188, 0.18)',
  paneExportIcon: '#4a86bc',
  paneExportBtnBg: 'rgba(74, 134, 188, 0.12)',
  paneExportBtnHover: 'rgba(74, 134, 188, 0.08)',

  // Pane: Sync
  paneSync: '#7a6ab8',
  paneSyncBg: 'rgba(122, 106, 184, 0.12)',
  paneSyncText: '#7a6ab8',
  paneSyncBorder: 'rgba(122, 106, 184, 0.18)',
  paneSyncIcon: '#7a6ab8',
  paneSyncBtnBg: 'rgba(122, 106, 184, 0.12)',
  paneSyncBtnHover: 'rgba(122, 106, 184, 0.08)',

  // Pane: Publish
  panePublish: '#b06a98',
  panePublishBg: 'rgba(176, 106, 152, 0.12)',
  panePublishText: '#b06a98',
  panePublishBorder: 'rgba(176, 106, 152, 0.18)',
  panePublishIcon: '#b06a98',
  panePublishBtnBg: 'rgba(176, 106, 152, 0.12)',
  panePublishBtnHover: 'rgba(176, 106, 152, 0.08)',

  // Code
  codeBg: '#cacaca',
  codeText: '#1c211d',
  codeBorder: 'rgba(82, 96, 86, 0.2)',
  syntaxComment: '#616864',
  syntaxKeyword: '#4a8074',
  syntaxString: '#8a5e30',
  syntaxNumber: '#9a6840',
  syntaxType: '#2a6a80',
  syntaxFunction: '#5a6e40',
  syntaxPunctuation: '#6a7a88',
  syntaxVariable: '#3a5040',
  syntaxTag: '#c45868',
  syntaxAttribute: '#b8903c',

  // Bloom
  bloomBg1: '#0a1810',
  bloomBg2: '#060d08',
  bloom1: '#1a5a99',
  bloom2: '#8a4a99',
  bloom3: '#4a8a99',
  bloom4: '#994a3a',
  bloom5: '#7a7a3a',
  bloom6: '#3a8a7a',
  bloomOpacity: '1',
  bloomBlur: '60px',
  bloomSpeed: '1',
  backgroundType: 'bloom',

  // Starfield
  starColor: '#c8d0e0',
  starOpacity: '0.6',
  starSpeed: '1',
  starDensity: '120',

  // Flow
  flowColor: '#3a7064',
  flowSpeed: '1',

  // Drift
  driftColor: '#c8d4cc',
  driftSpeed: '1',
  driftDensity: '300',
  driftGlow: '#7aaa90',
  driftBg: '#405143',

  // Shape
  radius: '0.5rem',
  radiusSm: '0.375rem',

  // Font
  fontDisplay: "'JetBrains Mono', monospace",
  fontBody: "'Outfit', sans-serif",
  fontMono: "'JetBrains Mono', monospace",
};

/** Map camelCase palette keys to CSS custom property names */
export const KEY_TO_VAR: Record<keyof Palette, string> = {
  // Page
  bg: '--bg',
  text: '--text',
  textMuted: '--text-muted',
  border: '--border',

  // Surface
  surface: '--surface',
  surfaceSolid: '--surface-solid',
  surfaceHover: '--surface-hover',
  surfaceText: '--surface-text',
  surfaceTextMuted: '--surface-text-muted',
  surfaceBorder: '--surface-border',

  // Panel
  panel: '--panel',
  panelHover: '--panel-hover',
  panelText: '--panel-text',
  panelTextMuted: '--panel-text-muted',
  panelBorder: '--panel-border',

  // Toolbar
  toolbarBg: '--toolbar-bg',
  toolbarText: '--toolbar-text',
  toolbarTextMuted: '--toolbar-text-muted',
  toolbarBorder: '--toolbar-border',
  toolbarHover: '--toolbar-hover',
  toolbarActive: '--toolbar-active',

  // Chat
  chatBg: '--chat-bg',
  chatText: '--chat-text',
  chatTextMuted: '--chat-text-muted',
  chatBorder: '--chat-border',
  chatUserBg: '--chat-user-bg',
  chatUserText: '--chat-user-text',
  chatAiBg: '--chat-ai-bg',
  chatAiText: '--chat-ai-text',

  // Input
  inputBg: '--input-bg',
  inputText: '--input-text',
  inputPlaceholder: '--input-placeholder',
  inputBorder: '--input-border',
  inputBorderFocus: '--input-border-focus',
  inputHover: '--input-hover',

  // Accent
  accent: '--accent',
  accentBg: '--accent-bg',
  accentText: '--accent-text',
  accentHover: '--accent-hover',
  accentMuted: '--accent-muted',
  accentBorder: '--accent-border',

  // Error
  error: '--error',
  errorBg: '--error-bg',
  errorText: '--error-text',
  errorMuted: '--error-muted',
  errorBorder: '--error-border',

  // Warning
  warning: '--warning',
  warningBg: '--warning-bg',
  warningText: '--warning-text',
  warningMuted: '--warning-muted',
  warningBorder: '--warning-border',

  // Success
  success: '--success',
  successBg: '--success-bg',
  successText: '--success-text',
  successMuted: '--success-muted',
  successBorder: '--success-border',

  // Overlay
  overlay: '--overlay',
  overlayBg: '--overlay-bg',
  overlayText: '--overlay-text',
  overlayBorder: '--overlay-border',

  // Chrome
  contrast: '--contrast',
  previewBg: '--preview-bg',
  brandAi: '--brand-ai',

  // Scrollbar
  scrollbarTrack: '--scrollbar-track',
  scrollbarThumb: '--scrollbar-thumb',
  scrollbarThumbHover: '--scrollbar-thumb-hover',

  // Selection
  selectionBg: '--selection-bg',
  selectionText: '--selection-text',
  itemSelectedBg: '--item-selected-bg',
  itemSelectedText: '--item-selected-text',
  itemHoverBg: '--item-hover-bg',

  // Tooltip
  tooltipBg: '--tooltip-bg',
  tooltipText: '--tooltip-text',
  tooltipBorder: '--tooltip-border',

  // Badge
  badgeBg: '--badge-bg',
  badgeText: '--badge-text',
  badgeBorder: '--badge-border',

  // Drag
  dragTargetBg: '--drag-target-bg',
  dragTargetBorder: '--drag-target-border',
  dragHandle: '--drag-handle',
  dragHandleActive: '--drag-handle-active',

  // Spinner
  spinnerColor: '--spinner-color',
  spinnerTrack: '--spinner-track',

  // Pane: Collaboration
  paneCollaboration: '--pane-collaboration',
  paneCollaborationBg: '--pane-collaboration-bg',
  paneCollaborationText: '--pane-collaboration-text',
  paneCollaborationBorder: '--pane-collaboration-border',
  paneCollaborationIcon: '--pane-collaboration-icon',
  paneCollaborationBtnBg: '--pane-collaboration-btn-bg',
  paneCollaborationBtnHover: '--pane-collaboration-btn-hover',

  // Pane: Artifacts
  paneArtifacts: '--pane-artifacts',
  paneArtifactsBg: '--pane-artifacts-bg',
  paneArtifactsText: '--pane-artifacts-text',
  paneArtifactsBorder: '--pane-artifacts-border',
  paneArtifactsIcon: '--pane-artifacts-icon',
  paneArtifactsBtnBg: '--pane-artifacts-btn-bg',
  paneArtifactsBtnHover: '--pane-artifacts-btn-hover',

  // Pane: Workshop
  paneWorkshop: '--pane-workshop',
  paneWorkshopBg: '--pane-workshop-bg',
  paneWorkshopText: '--pane-workshop-text',
  paneWorkshopBorder: '--pane-workshop-border',
  paneWorkshopIcon: '--pane-workshop-icon',
  paneWorkshopBtnBg: '--pane-workshop-btn-bg',
  paneWorkshopBtnHover: '--pane-workshop-btn-hover',

  // Pane: Details
  paneDetails: '--pane-details',
  paneDetailsBg: '--pane-details-bg',
  paneDetailsText: '--pane-details-text',
  paneDetailsBorder: '--pane-details-border',
  paneDetailsIcon: '--pane-details-icon',
  paneDetailsBtnBg: '--pane-details-btn-bg',
  paneDetailsBtnHover: '--pane-details-btn-hover',

  // Pane: History
  paneHistory: '--pane-history',
  paneHistoryBg: '--pane-history-bg',
  paneHistoryText: '--pane-history-text',
  paneHistoryBorder: '--pane-history-border',
  paneHistoryIcon: '--pane-history-icon',
  paneHistoryBtnBg: '--pane-history-btn-bg',
  paneHistoryBtnHover: '--pane-history-btn-hover',

  // Pane: Export
  paneExport: '--pane-export',
  paneExportBg: '--pane-export-bg',
  paneExportText: '--pane-export-text',
  paneExportBorder: '--pane-export-border',
  paneExportIcon: '--pane-export-icon',
  paneExportBtnBg: '--pane-export-btn-bg',
  paneExportBtnHover: '--pane-export-btn-hover',

  // Pane: Sync
  paneSync: '--pane-sync',
  paneSyncBg: '--pane-sync-bg',
  paneSyncText: '--pane-sync-text',
  paneSyncBorder: '--pane-sync-border',
  paneSyncIcon: '--pane-sync-icon',
  paneSyncBtnBg: '--pane-sync-btn-bg',
  paneSyncBtnHover: '--pane-sync-btn-hover',

  // Pane: Publish
  panePublish: '--pane-publish',
  panePublishBg: '--pane-publish-bg',
  panePublishText: '--pane-publish-text',
  panePublishBorder: '--pane-publish-border',
  panePublishIcon: '--pane-publish-icon',
  panePublishBtnBg: '--pane-publish-btn-bg',
  panePublishBtnHover: '--pane-publish-btn-hover',

  // Code
  codeBg: '--code-bg',
  codeText: '--code-text',
  codeBorder: '--code-border',
  syntaxComment: '--syntax-comment',
  syntaxKeyword: '--syntax-keyword',
  syntaxString: '--syntax-string',
  syntaxNumber: '--syntax-number',
  syntaxType: '--syntax-type',
  syntaxFunction: '--syntax-function',
  syntaxPunctuation: '--syntax-punctuation',
  syntaxVariable: '--syntax-variable',
  syntaxTag: '--syntax-tag',
  syntaxAttribute: '--syntax-attribute',

  // Bloom
  bloomBg1: '--bloom-bg1',
  bloomBg2: '--bloom-bg2',
  bloom1: '--bloom-1',
  bloom2: '--bloom-2',
  bloom3: '--bloom-3',
  bloom4: '--bloom-4',
  bloom5: '--bloom-5',
  bloom6: '--bloom-6',
  bloomOpacity: '--bloom-opacity',
  bloomBlur: '--bloom-blur',
  bloomSpeed: '--bloom-speed',
  backgroundType: '--background-type',

  // Starfield
  starColor: '--star-color',
  starOpacity: '--star-opacity',
  starSpeed: '--star-speed',
  starDensity: '--star-density',

  // Flow
  flowColor: '--flow-color',
  flowSpeed: '--flow-speed',

  // Drift
  driftColor: '--drift-color',
  driftSpeed: '--drift-speed',
  driftDensity: '--drift-density',
  driftGlow: '--drift-glow',
  driftBg: '--drift-bg',

  // Shape
  radius: '--radius',
  radiusSm: '--radius-sm',

  // Font
  fontDisplay: '--font-display',
  fontBody: '--font-body',
  fontMono: '--font-mono',
};

/** Get the current resolved palette from computed styles */
export function getCurrentPalette(): Palette {
  const el = document.documentElement;
  const cs = getComputedStyle(el);
  const palette = {} as Palette;
  for (const [key, cssVar] of Object.entries(KEY_TO_VAR)) {
    palette[key as keyof Palette] = cs.getPropertyValue(cssVar).trim();
  }
  return palette;
}

// ── Tint System ──────────────────────────────────────────────────────────────

export type TintName = 'green' | 'yellow' | 'red' | 'blue' | 'purple' | 'gray';

/** The palette keys that carry the accent tint */
type TintKeys = Pick<
  Palette,
  | 'bg' | 'surface' | 'surfaceSolid' | 'panel'
  | 'accent' | 'accentMuted' | 'border' | 'flowColor'
  | 'syntaxComment' | 'syntaxString' | 'syntaxType' | 'syntaxFunction'
>;

interface TintPreset {
  dark: TintKeys;
  light: TintKeys;
  /** Representative swatch color shown in UI */
  swatch: string;
}

export const TINT_PRESETS: Record<TintName, TintPreset> = {
  green: {
    dark: {
      bg: '#0b0d0c',
      surface: '#121513',
      surfaceSolid: '#131514',
      panel: '#141816',
      accent: '#7db3a3',
      accentMuted: '#1a2723',
      border: 'rgba(82, 96, 86, 0.18)',
      flowColor: '#7db3a3',
      syntaxComment: '#6a7a6e',
      syntaxString: '#a8d4c4',
      syntaxType: '#9bc4b6',
      syntaxFunction: '#b8d8ca',
    },
    light: {
      bg: '#d8d8d8',
      surface: '#d2d2d2',
      surfaceSolid: '#d3d3d3',
      panel: '#d6d6d6',
      accent: '#4a8074',
      accentMuted: '#c2d5ce',
      border: 'rgba(82, 96, 86, 0.2)',
      flowColor: '#3a7064',
      syntaxComment: '#616864',
      syntaxString: '#8a5e30',
      syntaxType: '#2a6a80',
      syntaxFunction: '#5a6e40',
    },
    swatch: '#7db3a3',
  },
  yellow: {
    dark: {
      bg: '#0d0d0b',
      surface: '#151512',
      surfaceSolid: '#151514',
      panel: '#181814',
      accent: '#b3a44d',
      accentMuted: '#23221a',
      border: 'rgba(96, 92, 78, 0.18)',
      flowColor: '#b3a44d',
      syntaxComment: '#7a786a',
      syntaxString: '#d4c88a',
      syntaxType: '#c4ba80',
      syntaxFunction: '#d8d0a0',
    },
    light: {
      bg: '#e4e3d8',
      surface: '#deddd0',
      surfaceSolid: '#dfded3',
      panel: '#e2e0d4',
      accent: '#7a6e2e',
      accentMuted: '#d5d0b8',
      border: 'rgba(96, 92, 78, 0.2)',
      flowColor: '#7a6e2e',
      syntaxComment: '#686660',
      syntaxString: '#8a5e30',
      syntaxType: '#6a6a2a',
      syntaxFunction: '#5a6e40',
    },
    swatch: '#b3a44d',
  },
  red: {
    dark: {
      bg: '#0d0b0b',
      surface: '#151212',
      surfaceSolid: '#151313',
      panel: '#181414',
      accent: '#b37070',
      accentMuted: '#231a1a',
      border: 'rgba(96, 82, 82, 0.18)',
      flowColor: '#b37070',
      syntaxComment: '#7a6a6a',
      syntaxString: '#d4a8a8',
      syntaxType: '#c49b9b',
      syntaxFunction: '#d8b8b8',
    },
    light: {
      bg: '#e4deda',
      surface: '#ded8d3',
      surfaceSolid: '#dfd9d5',
      panel: '#e2dcd6',
      accent: '#8a4444',
      accentMuted: '#d5bfbf',
      border: 'rgba(96, 82, 82, 0.2)',
      flowColor: '#8a4444',
      syntaxComment: '#686060',
      syntaxString: '#8a5e30',
      syntaxType: '#804040',
      syntaxFunction: '#6e4a40',
    },
    swatch: '#b37070',
  },
  blue: {
    dark: {
      bg: '#0b0c0d',
      surface: '#121315',
      surfaceSolid: '#131415',
      panel: '#141618',
      accent: '#7098b3',
      accentMuted: '#1a2023',
      border: 'rgba(78, 88, 96, 0.18)',
      flowColor: '#7098b3',
      syntaxComment: '#6a7280',
      syntaxString: '#a8c4d4',
      syntaxType: '#90b0c8',
      syntaxFunction: '#b0ccd8',
    },
    light: {
      bg: '#dce0e4',
      surface: '#d6dade',
      surfaceSolid: '#d7dbdf',
      panel: '#dadee2',
      accent: '#3a6a8a',
      accentMuted: '#bfccd5',
      border: 'rgba(78, 88, 96, 0.2)',
      flowColor: '#3a6a8a',
      syntaxComment: '#606468',
      syntaxString: '#8a5e30',
      syntaxType: '#2a6080',
      syntaxFunction: '#406e5a',
    },
    swatch: '#7098b3',
  },
  purple: {
    dark: {
      bg: '#0c0b0d',
      surface: '#131215',
      surfaceSolid: '#141315',
      panel: '#161418',
      accent: '#9878b3',
      accentMuted: '#201a23',
      border: 'rgba(88, 80, 96, 0.18)',
      flowColor: '#9878b3',
      syntaxComment: '#726a7a',
      syntaxString: '#c4a8d4',
      syntaxType: '#b09bc4',
      syntaxFunction: '#ccb8d8',
    },
    light: {
      bg: '#e0dce4',
      surface: '#dad6de',
      surfaceSolid: '#dbd7df',
      panel: '#dedae2',
      accent: '#6a4a8a',
      accentMuted: '#c8bfd5',
      border: 'rgba(88, 80, 96, 0.2)',
      flowColor: '#6a4a8a',
      syntaxComment: '#646068',
      syntaxString: '#8a5e30',
      syntaxType: '#604a80',
      syntaxFunction: '#5a406e',
    },
    swatch: '#9878b3',
  },
  gray: {
    dark: {
      bg: '#0c0c0c',
      surface: '#131313',
      surfaceSolid: '#141414',
      panel: '#161616',
      accent: '#7db3a3',
      accentMuted: '#1a2723',
      border: 'rgba(90, 90, 90, 0.18)',
      flowColor: '#7db3a3',
      syntaxComment: '#747474',
      syntaxString: '#bcbcbc',
      syntaxType: '#adadad',
      syntaxFunction: '#c8c8c8',
    },
    light: {
      bg: '#d8d8d8',
      surface: '#d2d2d2',
      surfaceSolid: '#d3d3d3',
      panel: '#d6d6d6',
      accent: '#4a8074',
      accentMuted: '#c2d5ce',
      border: 'rgba(90, 90, 90, 0.2)',
      flowColor: '#4a8074',
      syntaxComment: '#646464',
      syntaxString: '#6a6a6a',
      syntaxType: '#505050',
      syntaxFunction: '#585858',
    },
    swatch: '#9a9a9a',
  },
};

/** Apply a tint preset to the document */
export function applyTint(tint: TintName, mode: 'dark' | 'light') {
  const values = TINT_PRESETS[tint][mode];
  const el = document.documentElement;

  el.classList.add('palette-transition');

  for (const [key, value] of Object.entries(values)) {
    const cssVar = KEY_TO_VAR[key as keyof Palette];
    if (cssVar) el.style.setProperty(cssVar, value);
  }

  document.dispatchEvent(new Event('palette-change'));
  setTimeout(() => el.classList.remove('palette-transition'), 500);
}
