/**
 * How the Mood Builder presents the palette: every GARDEN_DARK key belongs to
 * exactly one group, has a kind (which control edits it) and a short label.
 * Pure data + string functions — no DOM, no React.
 */
import { GARDEN_DARK } from './garden-dark';

export type TokenKind = 'color' | 'length' | 'number' | 'font';

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
  'paneGap',
  'paneRadius',
  'paneBorderWidth',
  'paneHeaderHeight',
  'paneHeaderRadius',
  'paneHeaderPadding',
  'workspacePadding',
]);

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
  'highlight',
  'contrast',
  'overlay',
  'link',
  'linkHover',
  'linkVisited',
  'linkActive',
  'title',
  'heading',
  'paragraph',
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
    hint: 'Corner radii, the gutter between workspace panes, header height.',
    match: (k) => LAYOUT_KEYS.has(k),
  },
  {
    id: 'typography',
    label: 'Typography',
    hint: 'Font stacks for display, body and code.',
    match: starts('font'),
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
      'iconButton',
      'dangerButton',
      'profileButton',
      'input',
      'toggle',
      'dropdown',
      'badge',
      'tooltip',
      'avatar',
      'spinner',
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
      'overlay',
      'toolbar',
      'panel',
      'surface',
    ),
  },
  {
    id: 'code',
    label: 'Markdown & code',
    hint: 'Rendered markdown, code blocks and syntax colors.',
    match: starts('markdown', 'syntax', 'codeBlock', 'codeLine'),
  },
  {
    id: 'status',
    label: 'Status colors',
    hint: 'Error, warning and success variants.',
    match: starts('error', 'warning', 'success'),
  },
  {
    id: 'ambient',
    label: 'Ambient background',
    hint: 'Bloom, stars, flow and drift backgrounds.',
    match: starts('bloom', 'star', 'flow', 'drift', 'previewBg'),
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
  if (LAYOUT_KEYS.has(key)) return 'length';
  if (/(Radius|RadiusSm|Height|Padding|Width|Gap)$/.test(key)) return 'length';
  if (/(Opacity|Speed|Density)$/.test(key)) return 'number';
  if (key.startsWith('font')) return 'font';
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
