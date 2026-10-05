import { describe, expect, it } from 'vitest';
import { applyPageMeta, metaDescription, type MetaDocument, type MetaElement } from './page-meta';

/** A head that answers the few selectors the helper asks for. */
function fakeDocument(initial: { tag: string; attrs: Record<string, string> }[] = []) {
  type Node = MetaElement & { tag: string; attrs: Record<string, string> };
  const make = (tag: string, attrs: Record<string, string> = {}): Node => ({
    tag,
    attrs,
    getAttribute: (name) => attrs[name] ?? null,
    setAttribute: (name, value) => {
      attrs[name] = value;
    },
  });
  const nodes: Node[] = initial.map((node) => make(node.tag, { ...node.attrs }));
  const doc: MetaDocument = {
    title: 'Crux Garden',
    head: {
      querySelector: (selector) => {
        const [, tag, key = '', value] = /^(\w+)\[(\w+)="([^"]+)"\]$/.exec(selector)!;
        return nodes.find((node) => node.tag === tag && node.attrs[key] === value) ?? null;
      },
      appendChild: (node) => nodes.push(node as Node),
      removeChild: (node) => nodes.splice(nodes.indexOf(node as Node), 1),
    },
    createElement: (tag) => make(tag),
  };
  const read = (key: string, value: string) =>
    nodes.find((node) => node.attrs[key] === value)?.attrs[key === 'rel' ? 'href' : 'content'];
  return { doc, nodes, read };
}

const STATIC: { tag: string; attrs: Record<string, string> }[] = [
  { tag: 'meta', attrs: { name: 'description', content: 'Site description' } },
  { tag: 'meta', attrs: { property: 'og:title', content: 'Crux Garden — You can grow anything' } },
  { tag: 'meta', attrs: { property: 'og:url', content: 'https://crux.garden/' } },
  { tag: 'meta', attrs: { property: 'og:image', content: 'https://crux.garden/icon.png' } },
  { tag: 'meta', attrs: { name: 'twitter:card', content: 'summary' } },
];

describe('applyPageMeta', () => {
  it('writes title, description, canonical, Open Graph and Twitter tags', () => {
    const { doc, read } = fakeDocument(STATIC);
    applyPageMeta(doc, {
      title: 'Garden Notes — Crux Garden',
      description: 'A small published page',
      canonical: 'https://crux.garden/alice/garden-notes',
      image: 'https://id.publish.crux.garden/cover.png',
    });
    expect(doc.title).toBe('Garden Notes — Crux Garden');
    expect(read('name', 'description')).toBe('A small published page');
    expect(read('rel', 'canonical')).toBe('https://crux.garden/alice/garden-notes');
    expect(read('property', 'og:title')).toBe('Garden Notes — Crux Garden');
    expect(read('property', 'og:description')).toBe('A small published page');
    expect(read('property', 'og:url')).toBe('https://crux.garden/alice/garden-notes');
    expect(read('property', 'og:image')).toBe('https://id.publish.crux.garden/cover.png');
    expect(read('name', 'twitter:card')).toBe('summary_large_image');
    expect(read('name', 'twitter:title')).toBe('Garden Notes — Crux Garden');
    expect(read('name', 'twitter:image')).toBe('https://id.publish.crux.garden/cover.png');
  });

  it('restores the site defaults and removes what it added', () => {
    const { doc, nodes, read } = fakeDocument(STATIC);
    const before = JSON.stringify(nodes.map((node) => node.attrs));
    const restore = applyPageMeta(doc, {
      title: 'Terms — Crux Garden',
      description: 'The terms',
      canonical: 'https://crux.garden/terms',
      image: 'https://example.invalid/a.png',
    });
    expect(nodes.length).toBeGreaterThan(STATIC.length);
    restore();
    expect(doc.title).toBe('Crux Garden');
    expect(JSON.stringify(nodes.map((node) => node.attrs))).toBe(before);
    expect(read('rel', 'canonical')).toBeUndefined();
  });

  it('leaves the site image and description alone when a page has none', () => {
    const { doc, read } = fakeDocument(STATIC);
    applyPageMeta(doc, { title: 'Explore — Crux Garden' });
    expect(read('property', 'og:image')).toBe('https://crux.garden/icon.png');
    expect(read('name', 'description')).toBe('Site description');
    expect(read('name', 'twitter:card')).toBe('summary');
    expect(read('name', 'twitter:image')).toBeUndefined();
  });

  it('a later page restores to the earlier page, then to the defaults', () => {
    const { doc, read } = fakeDocument(STATIC);
    const first = applyPageMeta(doc, { title: 'A', description: 'first' });
    const second = applyPageMeta(doc, { title: 'B', description: 'second' });
    second();
    expect(doc.title).toBe('A');
    expect(read('name', 'description')).toBe('first');
    first();
    expect(read('name', 'description')).toBe('Site description');
  });
});

describe('metaDescription', () => {
  it('collapses whitespace, drops empties and cuts long text at a word', () => {
    expect(metaDescription('  two\n\nlines  ')).toBe('two lines');
    expect(metaDescription('   ')).toBeUndefined();
    expect(metaDescription(null)).toBeUndefined();
    const long = metaDescription('word '.repeat(100))!;
    expect(long.length).toBeLessThanOrEqual(200);
    expect(long.endsWith('word…')).toBe(true);
  });
});
