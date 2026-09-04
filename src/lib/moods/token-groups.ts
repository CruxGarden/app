/**
 * How the Mood Builder presents the palette: every GARDEN_DARK key belongs to
 * exactly one group, has a kind (which control edits it) and a short label.
 * Pure data + string functions — no DOM, no React.
 */
import { GARDEN_DARK } from './garden-dark';

export type TokenKind = 'color' | 'length' | 'number' | 'font' | 'text' | 'asset' | 'choice';

/**
 * Tokens whose value is one of a fixed set of names (a border style, an enter
 * animation, an icon set). The Mood Builder renders a select; set_theme refuses
 * anything else. Register a token here when you add one — keep the sections.
 */
export const TOKEN_CHOICES: Record<string, readonly string[]> = {
  // ── motion (motion.css) ──
  // ── shape (shape.css) ──
  // ── icons (ui/icons) ──
};

/** The allowed values for a choice token, or null when the token is free-form. */
export function tokenChoices(key: string): readonly string[] | null {
  return TOKEN_CHOICES[key] ?? null;
}

export interface TokenGroup {
  id: string;
  label: string;
  hint: string;
  /** Key prefix stripped from labels inside this group (pane groups). */
  strip?: string;
  match: (key: string) => boolean;
}

const PANES: { id: string; label: string }[] = [
  { id: 'Collaboration', label: 'Collaboration' },
  { id: 'Artifacts', label: 'Artifacts' },
  { id: 'Workshop', label: 'Workshop' },
  { id: 'Details', label: 'Metadata' },
  { id: 'History', label: 'History' },
  { id: 'Export', label: 'Export' },
  { id: 'Sync', label: 'Sync' },
  { id: 'Publish', label: 'Share' },
  { id: 'Store', label: 'Store' },
];

const LAYOUT_KEYS = new Set([
  'radius',
  'radiusSm',
  'radiusLg',
  'buttonRadius',
  'inputRadius',
  'cardRadius',
  'chipRadius',
  'tooltipRadius',
  'dropdownRadius',
  'bubbleRadius',
  'meterRadius',
  'meterHeight',
  'toolbarHeight',
  'fileTreeRowHeight',
  'fileTreeIndent',
  'toggleWidth',
  'toggleHeight',
  'scrollbarWidth',
  'cardHoverLift',
  'paneGap',
  'paneRadius',
  'paneBorderWidth',
  'paneHeaderHeight',
  'paneHeaderRadius',
  'paneHeaderPadding',
  'workspacePadding',
  'density',
]);
const TYPE_KEYS = new Set([
  'fontDisplay',
  'fontBody',
  'fontMono',
  'fontScale',
  'lineHeightBody',
  'fontWeightBody',
  'letterSpacingBody',
  'letterSpacingDisplay',
  'letterSpacingMono',
]);
const HEADER_KEYS = new Set([
  'paneHeaderHoverBrightness',
  'paneHeaderLabelFont',
  'paneHeaderLabelSize',
  'paneHeaderLabelWeight',
  'paneHeaderLabelCase',
  'paneHeaderLabelTracking',
  'paneHeaderIconDisplay',
  'paneHeaderCloseDisplay',
  'paneHeaderJustify',
]);
const ELEVATION_KEYS = new Set([
  'elevationPanel',
  'elevationCard',
  'elevationCardHover',
  'elevationModal',
  'elevationDropdown',
  'elevationTooltip',
  'scrim',
  'glassBlur',
  'motionScale',
  'hoverBrightness',
  'activeBrightness',
  'disabledOpacity',
]);
const EDITOR_KEYS = new Set([
  'editorBackground',
  'editorFontSize',
  'editorGutter',
  'editorCursor',
  'editorSelection',
]);
const IMAGE_BG_KEYS = new Set([
  'bgImageDim',
  'bgImageBlur',
  'bgImageFit',
  'bgImagePosition',
  'bgImageScale',
]);
const TEXTURE_KEYS = new Set([
  'workspaceTexture',
  'workspaceTextureSize',
  'workspaceTextureBlend',
  'workspaceTextureOpacity',
  'grainOpacity',
]);
const FONT_ASSET_KEYS = new Set(['fontFaceDisplay', 'fontFaceBody', 'fontFaceMono']);
const GRID_KEYS = new Set([
  'gardenCardMinWidth',
  'gardenCardAspect',
  'gardenGridGap',
  'growthCardAspect',
]);
/** Free-form CSS keywords (text-transform, iteration count, background-size…) */
const TEXT_KEYS = /(Case|Display|Justify|Fit|Position|Pulse)$|^(elevation|scrim)/;

const FOUNDATION_KEYS = new Set([
  'bg',
  'text',
  'textMuted',
  'accent',
  'accentMuted',
  'border',
  'panel',
  'surface',
  'surfaceSolid',
  'surfaceHover',
  'error',
  'warning',
  'success',
  'contrast',
  'heading',
  'caption',
  'placeholder',
]);

const starts =
  (...prefixes: string[]) =>
  (key: string) =>
    prefixes.some((p) => key.startsWith(p));

export const TOKEN_GROUPS: TokenGroup[] = [
  {
    id: 'foundation',
    label: 'Foundation',
    hint: 'The root colors everything else derives from.',
    match: (k) => FOUNDATION_KEYS.has(k),
  },
  {
    id: 'layout',
    label: 'Shape & layout',
    hint: 'Corner radii, the gutter between workspace panes, header height, and density (multiplies every padding and gap).',
    match: (k) => LAYOUT_KEYS.has(k),
  },
  {
    id: 'textures',
    label: 'Textures & grain',
    hint: 'Images from your assets laid over the workspace (and per pane, in each pane group), plus film grain.',
    match: (k) => TEXTURE_KEYS.has(k),
  },
  {
    id: 'typography',
    label: 'Typography',
    hint: 'Font stacks, the type scale (multiplies every size), weight, line height and tracking.',
    match: (k) => TYPE_KEYS.has(k) || FONT_ASSET_KEYS.has(k),
  },
  {
    id: 'header',
    label: 'Pane headers',
    hint: 'How every pane title bar is set: label font, size, case, tracking, icon and close visibility, alignment. Per-pane groups override case and alignment.',
    match: (k) => HEADER_KEYS.has(k),
  },
  {
    id: 'elevation',
    label: 'Elevation & motion',
    hint: 'Shadows for panels, cards and modals, the modal scrim, and how fast things move (0 = instant).',
    match: (k) => ELEVATION_KEYS.has(k),
  },
  {
    id: 'editor',
    label: 'Editor',
    hint: 'The code editor: ground, gutter, cursor, selection, font size.',
    match: (k) => EDITOR_KEYS.has(k),
  },
  {
    id: 'grid',
    label: 'Home grid',
    hint: 'Card width, thumbnail shape and gap on the Home Garden; snapshot card shape.',
    match: (k) => GRID_KEYS.has(k),
  },
  ...PANES.map<TokenGroup>((p) => ({
    id: `pane-${p.id.toLowerCase()}`,
    label: `${p.label} pane`,
    hint: `Everything about the ${p.label} pane: header, toggle button, body surface, text, labels, radii. Tokens inherit the shared ones until you set them.`,
    strip: `pane${p.id}`,
    match: (k) => k === `pane${p.id}` || k.startsWith(`pane${p.id}`),
  })),
  {
    id: 'chat',
    label: 'Collaboration chat',
    hint: 'Bubbles, input, send button, model selector.',
    match: starts('chat', 'brandAi', 'modelSelector'),
  },
  {
    id: 'controls',
    label: 'Controls',
    hint: 'Buttons, inputs, toggles, dropdowns, badges, tooltips.',
    match: starts(
      'primaryButton',
      'actionButton',
      'dangerButton',
      'profileButton',
      'input',
      'toggle',
      'dropdown',
      'badge',
      'tooltip',
      'moodBar',
      'focusRing',
      'button',
      'meter',
      'onError',
      'selection',
      'scrollbar',
      'drag',
      'snapshotBanner',
    ),
  },
  {
    id: 'cards',
    label: 'Cards & lists',
    hint: 'Garden cards, snapshot cards, the file tree.',
    match: starts('gardenCard', 'growth', 'fileTree', 'overlayBadge'),
  },
  {
    id: 'surfaces',
    label: 'Pages & overlays',
    hint: 'Gateway, Settings, Console, Command palette, top bars, toolbars.',
    match: starts(
      'gateway',
      'settings',
      'console',
      'commandPalette',
      'publicTopBar',
      'toolbar',
      'panel',
      'surface',
    ),
  },
  {
    id: 'code',
    label: 'Markdown & code',
    hint: 'Rendered markdown, code blocks and syntax colors.',
    match: starts('markdown', 'syntax', 'codeBlock', 'codeLine', 'editor'),
  },
  {
    id: 'status',
    label: 'Status colors',
    hint: 'Error, warning and success variants.',
    match: starts('error', 'warning', 'success'),
  },
  {
    id: 'ambient',
    label: 'Background',
    hint: 'Bloom, stars, flow and drift backgrounds; dim, blur, fit and zoom for an image background.',
    match: (k) => IMAGE_BG_KEYS.has(k) || starts('bloom', 'star', 'flow', 'drift', 'previewBg')(k),
  },
];

const OTHER: TokenGroup = {
  id: 'other',
  label: 'Everything else',
  hint: 'Tokens not yet filed under a group.',
  match: () => true,
};

/** Every palette key filed under its group, in group order. */
export function groupTokens(): { group: TokenGroup; keys: string[] }[] {
  const keys = Object.keys(GARDEN_DARK);
  const taken = new Set<string>();
  const out = TOKEN_GROUPS.map((group) => {
    const mine = keys.filter((k) => !taken.has(k) && group.match(k));
    mine.forEach((k) => taken.add(k));
    return { group, keys: mine };
  });
  const rest = keys.filter((k) => !taken.has(k));
  if (rest.length) out.push({ group: OTHER, keys: rest });
  return out.filter((g) => g.keys.length > 0);
}

export function tokenKind(key: string): TokenKind {
  if (key in TOKEN_CHOICES) return 'choice';
  if (/Texture$/.test(key) || FONT_ASSET_KEYS.has(key)) return 'asset';
  if (/TextureSize$|TextureBlend$/.test(key)) return 'text';
  if (/TextureOpacity$|^grainOpacity$/.test(key)) return 'number';
  if (TEXT_KEYS.test(key)) return 'text';
  if (/Shadow$|^elevation/.test(key)) return 'text';
  if (/Brightness$|^disabledOpacity$/.test(key)) return 'number';
  if (
    /^(density|fontScale|motionScale|lineHeightBody|fontWeight|bgImageDim|bgImageScale)/.test(key)
  )
    return 'number';
  if (/Weight$/.test(key)) return 'number';
  if (/^font(Display|Body|Mono)$|LabelFont$/.test(key)) return 'font';
  if (LAYOUT_KEYS.has(key)) return 'length';
  if (
    /(Radius|RadiusSm|Height|Padding|Width|Gap|Size|Blur|Tracking|Spacing)$|^letterSpacing|^gardenGridGap|Aspect$/.test(
      key,
    )
  )
    return 'length';
  if (/(Opacity|Speed|Density)$/.test(key)) return 'number';
  return 'color';
}

/** "paneWorkshopHeaderText" in the Workshop group → "Header text". */
export function tokenLabel(key: string, group?: TokenGroup): string {
  let k = key;
  if (group?.strip && k.startsWith(group.strip)) {
    k = k.slice(group.strip.length);
    if (!k) return 'Pane color';
  }
  const words = k
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .replace(/\bbg\b/, 'background')
    .replace(/\bsm\b/, 'small')
    .replace(/\blg\b/, 'large');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Does this value reference another token rather than name a color/length? */
export function isDerived(value: string): boolean {
  return /var\(|color-mix\(/.test(value);
}
