/**
 * Per-page head tags for the client-rendered public pages: title, description,
 * canonical, Open Graph and Twitter card. `index.html` carries the site-wide
 * defaults, which is all a crawler that does not run scripts will ever see;
 * these are for browsers, share sheets that render, and crawlers that do.
 */
export interface PageMeta {
  title: string;
  description?: string;
  /** Absolute URL of this page; also written as og:url. */
  canonical?: string;
  /** Absolute URL of a preview image. */
  image?: string;
}

/** The subset of Document this needs, so it can be exercised without a browser. */
export interface MetaDocument {
  title: string;
  head: {
    querySelector(selector: string): MetaElement | null;
    appendChild(node: MetaElement): unknown;
    removeChild(node: MetaElement): unknown;
  };
  createElement(tag: string): MetaElement;
}
export interface MetaElement {
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
}

type Tag = { selector: string; create: ['meta' | 'link', string, string]; attribute: string };

const meta = (key: 'name' | 'property', id: string): Tag => ({
  selector: `meta[${key}="${id}"]`,
  create: ['meta', key, id],
  attribute: 'content',
});
const CANONICAL: Tag = {
  selector: 'link[rel="canonical"]',
  create: ['link', 'rel', 'canonical'],
  attribute: 'href',
};

/** Descriptions are one or two sentences in a preview; longer text is cut at a word. */
export function metaDescription(text: string | null | undefined, max = 200): string | undefined {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) return undefined;
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(' ') > max / 2 ? cut.lastIndexOf(' ') : cut.length)}…`;
}

/**
 * Write the page's tags and return the undo. Undo puts back exactly what was
 * there: a tag that existed gets its old value, a tag this call created is removed.
 */
export function applyPageMeta(doc: MetaDocument, page: PageMeta): () => void {
  const undo: (() => void)[] = [];
  const previousTitle = doc.title;
  doc.title = page.title;
  undo.push(() => {
    doc.title = previousTitle;
  });

  const set = (tag: Tag, value: string | undefined) => {
    if (!value) return;
    const existing = doc.head.querySelector(tag.selector);
    if (existing) {
      const before = existing.getAttribute(tag.attribute);
      existing.setAttribute(tag.attribute, value);
      undo.push(() => existing.setAttribute(tag.attribute, before ?? ''));
      return;
    }
    const element = doc.createElement(tag.create[0]);
    element.setAttribute(tag.create[1], tag.create[2]);
    element.setAttribute(tag.attribute, value);
    doc.head.appendChild(element);
    undo.push(() => doc.head.removeChild(element));
  };

  set(meta('name', 'description'), page.description);
  set(CANONICAL, page.canonical);
  set(meta('property', 'og:title'), page.title);
  set(meta('property', 'og:description'), page.description);
  set(meta('property', 'og:url'), page.canonical);
  set(meta('property', 'og:image'), page.image);
  set(meta('name', 'twitter:card'), page.image ? 'summary_large_image' : 'summary');
  set(meta('name', 'twitter:title'), page.title);
  set(meta('name', 'twitter:description'), page.description);
  set(meta('name', 'twitter:image'), page.image);

  return () => {
    for (const step of undo.reverse()) step();
  };
}
