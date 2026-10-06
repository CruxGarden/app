/** A URL-safe slug from a title: lower case, ASCII letters and digits, dashes between, 64 at most. */
export function slugify(text: string, fallback = 'untitled', max = 64): string {
  return (
    text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, max) || fallback
  );
}

/** A slug that will not collide with an earlier one for the same title: the moment, base 36. */
export function uniqueSlug(text: string, fallback = 'untitled'): string {
  return `${slugify(text, fallback)}-${Date.now().toString(36)}`;
}
