/**
 * Minimal frontmatter handling for content-model collections.
 * Supports the flat `key: value` subset the templates use — deliberately not
 * a YAML parser; nested structures pass through untouched in `raw`.
 */

export interface Frontmatter {
  data: Record<string, string>;
  body: string;
  /** True when the file had a frontmatter block at all */
  present: boolean;
}

const FM_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function parseFrontmatter(content: string): Frontmatter {
  const match = content.match(FM_PATTERN);
  if (!match) return { data: {}, body: content, present: false };

  const data: Record<string, string> = {};
  for (const line of match[1]!.split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) continue;
    let value = kv[2]!.trim();
    // Strip simple quoting
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    data[kv[1]!] = value;
  }
  return { data, body: content.slice(match[0].length), present: true };
}

/** Quote a value when YAML would misread it bare. */
function serializeValue(value: string): string {
  if (value === '') return "''";
  if (/[:#[\]{}&*!|>%@`"']/.test(value) || /^\s|\s$/.test(value)) {
    return `'${value.replace(/'/g, "''")}'`;
  }
  return value;
}

export function serializeFrontmatter(data: Record<string, string>, body: string): string {
  const lines = Object.entries(data).map(([key, value]) => `${key}: ${serializeValue(value)}`);
  return `---\n${lines.join('\n')}\n---\n${body}`;
}

/** 'My First Post!' → 'my-first-post' */
export function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'untitled'
  );
}

/** Interpolate a content-model recipe string: {slug}, {title}, {today}. */
export function interpolate(
  template: string,
  vars: { slug: string; title: string; today: string },
): string {
  return template
    .replaceAll('{slug}', vars.slug)
    .replaceAll('{title}', vars.title)
    .replaceAll('{today}', vars.today);
}

/** Convert a single-star glob ('src/pages/posts/*.md') to a path matcher. */
export function globToRegex(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]+');
  return new RegExp(`^${escaped}$`);
}
