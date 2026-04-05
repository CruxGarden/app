import type * as Monaco from 'monaco-editor';

/** Read a CSS custom property value, fully resolved to a computed color.
 *  Uses a temporary element to force the browser to resolve var() chains. */
function cssVar(name: string): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  // If it's already a concrete value (hex, rgb), return as-is
  if (raw && !raw.startsWith('var(') && !raw.startsWith('color-mix(')) return raw;
  // Force resolution by applying as a color and reading back
  const el = document.createElement('div');
  el.style.color = `var(${name})`;
  document.body.appendChild(el);
  const resolved = getComputedStyle(el).color;
  el.remove();
  return resolved || raw || '';
}

/** Convert any CSS color value to a 6-digit hex string (RRGGBB, no alpha).
 *  Alpha is stripped because Monaco theme colors add their own alpha suffixes. */
function toHex(value: string): string {
  if (!value) return '000000';
  // Already hex — strip # and take only the first 6 chars (drop alpha if present)
  if (value.startsWith('#')) return value.replace('#', '').slice(0, 6);
  // Parse rgba/rgb — ignore alpha channel
  const match = value.match(
    /rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/,
  );
  if (match) {
    const r = parseInt(match[1]!).toString(16).padStart(2, '0');
    const g = parseInt(match[2]!).toString(16).padStart(2, '0');
    const b = parseInt(match[3]!).toString(16).padStart(2, '0');
    return `${r}${g}${b}`;
  }
  return '000000';
}

/** Read a CSS var and return as hex (without #) for Monaco token rules */
function tokenHex(name: string): string {
  return toHex(cssVar(name));
}

/** Read a CSS var and return as #hex for Monaco editor colors */
function colorHex(name: string): string {
  return `#${toHex(cssVar(name))}`;
}

/**
 * Build and register the Monaco theme from current CSS variable values.
 * Call this on mount and again whenever the palette changes.
 */
export function registerCruxGardenThemes(monaco: typeof Monaco): void {
  const bg = colorHex('--bg');
  const text = colorHex('--text');
  const textMuted = colorHex('--text-muted');
  const accent = colorHex('--accent');
  const surfaceSolid = colorHex('--surface-solid');
  const border = colorHex('--border');

  const comment = tokenHex('--syntax-comment');
  const keyword = tokenHex('--syntax-keyword');
  const string = tokenHex('--syntax-string');
  const number = tokenHex('--syntax-number');
  const type = tokenHex('--syntax-type');
  const func = tokenHex('--syntax-function');
  const punct = tokenHex('--syntax-punctuation');
  const variable = tokenHex('--text');

  // Determine base from actual bg luminance — mood system controls dark/light
  const bgR = parseInt(bg.slice(1, 3), 16);
  const bgG = parseInt(bg.slice(3, 5), 16);
  const bgB = parseInt(bg.slice(5, 7), 16);
  const bgLum = (0.299 * bgR + 0.587 * bgG + 0.114 * bgB) / 255;
  const isDark = bgLum < 0.5;

  const rules: Monaco.editor.ITokenThemeRule[] = [
    // Default — prevents base vs/vs-dark colors from bleeding through
    { token: '', foreground: variable },

    { token: 'comment', foreground: comment, fontStyle: 'italic' },
    { token: 'keyword', foreground: keyword },
    { token: 'keyword.control', foreground: keyword },
    { token: 'keyword.operator', foreground: punct },
    { token: 'string', foreground: string },
    { token: 'string.key', foreground: string },
    { token: 'string.value', foreground: string },
    { token: 'string.escape', foreground: number },
    { token: 'number', foreground: number },
    { token: 'number.float', foreground: number },
    { token: 'number.hex', foreground: number },
    { token: 'type', foreground: type },
    { token: 'type.identifier', foreground: type },
    { token: 'function', foreground: func },
    { token: 'variable', foreground: variable },
    { token: 'variable.predefined', foreground: type },
    { token: 'identifier', foreground: variable },
    { token: 'constant', foreground: number },
    { token: 'tag', foreground: keyword },
    { token: 'tag.id', foreground: keyword },
    { token: 'tag.class', foreground: keyword },
    { token: 'attribute.name', foreground: type },
    { token: 'attribute.value', foreground: string },
    { token: 'delimiter', foreground: punct },
    { token: 'delimiter.bracket', foreground: punct },
    { token: 'delimiter.parenthesis', foreground: punct },
    { token: 'delimiter.square', foreground: punct },
    { token: 'delimiter.angle', foreground: punct },
    { token: 'delimiter.html', foreground: punct },
    { token: 'delimiter.css', foreground: punct },
    { token: 'delimiter.ts', foreground: punct },
    { token: 'delimiter.js', foreground: punct },
    { token: 'metatag', foreground: keyword },
    { token: 'metatag.html', foreground: keyword },
    { token: 'metatag.content.html', foreground: keyword },
    { token: 'operator', foreground: punct },
    { token: 'regexp', foreground: number },
    { token: 'annotation', foreground: type },
    { token: 'meta', foreground: comment },
    { token: 'meta.content', foreground: variable },
    { token: 'predefined', foreground: type },
    { token: 'support', foreground: type },
    // Catch-all: prevent VS Dark/VS Light default blues from bleeding through
    { token: 'key', foreground: string },
    { token: 'string.key.json', foreground: keyword },
    { token: 'string.value.json', foreground: string },
    { token: 'entity', foreground: keyword },
    { token: 'entity.name', foreground: keyword },
    { token: 'entity.other', foreground: type },
    { token: 'storage', foreground: keyword },
    { token: 'storage.type', foreground: keyword },
  ];

  monaco.editor.defineTheme('crux-garden-dark', {
    base: isDark ? 'vs-dark' : 'vs',
    inherit: true,
    rules,
    colors: {
      'editor.background': bg,
      'editor.foreground': text,
      'editor.lineHighlightBackground': `${surfaceSolid}12`,
      'editor.selectionBackground': `${accent}26`,
      'editor.inactiveSelectionBackground': `${accent}12`,
      'editorCursor.foreground': accent,
      'editorLineNumber.foreground': `${border}80`,
      'editorLineNumber.activeForeground': textMuted,
      'editorIndentGuide.background': `${border}18`,
      'editorIndentGuide.activeBackground': `${border}30`,
      'editorWidget.background': surfaceSolid,
      'editorWidget.border': `${border}30`,
      'editor.wordHighlightBackground': `${accent}12`,
      'editorBracketMatch.background': `${accent}20`,
      'editorBracketMatch.border': `${accent}40`,
      'scrollbar.shadow': '#00000000',
      'scrollbarSlider.background': `${border}30`,
      'scrollbarSlider.hoverBackground': `${textMuted}50`,
      'scrollbarSlider.activeBackground': `${textMuted}70`,
      'editorGutter.background': bg,
      'editorOverviewRuler.border': '#00000000',
      'minimap.background': bg,
      'input.background': surfaceSolid,
      'input.border': `${border}30`,
      'input.foreground': text,
      focusBorder: `${accent}50`,
    },
  });

  // Light theme — same as dark but reads from the same CSS vars
  // The mood system sets appropriate colors for light/dark
  monaco.editor.defineTheme('crux-garden-light', {
    base: isDark ? 'vs-dark' : 'vs',
    inherit: true,
    rules,
    colors: {
      'editor.background': bg,
      'editor.foreground': text,
      'editor.lineHighlightBackground': `${surfaceSolid}12`,
      'editor.selectionBackground': `${accent}26`,
      'editor.inactiveSelectionBackground': `${accent}12`,
      'editorCursor.foreground': accent,
      'editorLineNumber.foreground': `${border}80`,
      'editorLineNumber.activeForeground': textMuted,
      'editorIndentGuide.background': `${border}18`,
      'editorIndentGuide.activeBackground': `${border}30`,
      'editorWidget.background': surfaceSolid,
      'editorWidget.border': `${border}30`,
      'editor.wordHighlightBackground': `${accent}12`,
      'editorBracketMatch.background': `${accent}20`,
      'editorBracketMatch.border': `${accent}40`,
      'scrollbar.shadow': '#00000000',
      'scrollbarSlider.background': `${border}30`,
      'scrollbarSlider.hoverBackground': `${textMuted}50`,
      'scrollbarSlider.activeBackground': `${textMuted}70`,
      'editorGutter.background': bg,
      'editorOverviewRuler.border': '#00000000',
      'minimap.background': bg,
      'input.background': surfaceSolid,
      'input.border': `${border}30`,
      'input.foreground': text,
      focusBorder: `${accent}50`,
    },
  });
}
