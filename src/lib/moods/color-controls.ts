/** The native RGB picker and opacity editor share one resolved CSS color. */
export interface EditableColor {
  hex: string;
  alpha: number;
}

export function editableColor(css: string): EditableColor | null {
  const rgb = css.match(/^rgba?\(([^)]+)\)$/);
  const srgb = css.match(/^color\(srgb ([^)]+)\)$/);
  const body = rgb?.[1] ?? srgb?.[1];
  if (!body) return null;
  const parts = body
    .split(/[\s,/]+/)
    .filter(Boolean)
    .map(Number);
  if (parts.length < 3 || parts.some((n) => !Number.isFinite(n))) return null;
  const hex = parts
    .slice(0, 3)
    .map((n) =>
      Math.round(Math.max(0, Math.min(255, srgb ? n * 255 : n)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('');
  return { hex: `#${hex}`, alpha: Math.max(0, Math.min(1, parts[3] ?? 1)) };
}

export function colorWithAlpha(hex: string, alpha: number): string {
  if (alpha >= 1) return hex;
  const rgb = hex
    .slice(1)
    .match(/../g)!
    .map((part) => parseInt(part, 16));
  return `rgba(${rgb.join(', ')}, ${Math.max(0, alpha)})`;
}
