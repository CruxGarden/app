/** Keep frontmatter byte-for-byte out of rich-text round trips and public editions. */
export function splitNote(markdown: string): { header: string; body: string } {
  if (!/^\uFEFF?---\r?\n/.test(markdown)) return { header: '', body: markdown };
  const match = /^\uFEFF?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.exec(markdown);
  if (!match)
    throw new Error(
      'This note has unclosed frontmatter. Fix it in Advanced view before rich editing or publishing.',
    );
  return { header: match[0], body: markdown.slice(match[0].length) };
}
