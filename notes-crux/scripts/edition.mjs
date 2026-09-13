// The public edition of a Notes Crux (ADR 0028): the notes chosen in
// notebook/publish.json rendered to static HTML under dist/, images inlined,
// links between chosen notes kept, everything else private. Single-page keeps
// one searchable page; separate-pages writes one HTML page per note (usable
// without JavaScript). No framework: remark renders the Markdown.
import { readFileSync, realpathSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, relative, sep, posix, join, dirname } from 'node:path';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkHtml from 'remark-html';

/** Keep frontmatter byte-for-byte out of the public edition. */
export function splitNote(markdown) {
  if (!/^﻿?---\r?\n/.test(markdown)) return { header: '', body: markdown };
  const match = /^﻿?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.exec(markdown);
  if (!match)
    throw new Error(
      'This note has unclosed frontmatter. Fix it in Advanced view before publishing.',
    );
  return { header: match[0], body: markdown.slice(match[0].length) };
}
function safeRead(root, path) {
  if (
    typeof path !== 'string' ||
    /[\\\x00-\x1f:%?#]/.test(path) ||
    path
      .split('/')
      .some((p) => !p || p === '.' || p === '..' || (p.startsWith('.') && p !== '.assets'))
  )
    throw new Error('Invalid notebook path.');
  const realRoot = realpathSync(root);
  const full = realpathSync(resolve(root, path));
  const rel = relative(realRoot, full);
  if (rel === '..' || rel.startsWith('..' + sep) || rel.startsWith(sep))
    throw new Error('Notebook file escapes its folder.');
  return readFileSync(full);
}
export function resolveNotePath(from, link) {
  if (/^[a-z]+:/i.test(link) || link.startsWith('/')) return null;
  let decoded;
  try {
    decoded = decodeURIComponent(link.split('#')[0]);
  } catch {
    return null;
  }
  if (!decoded) return from;
  const parts = from.split('/').slice(0, -1);
  for (const part of decoded.split('/')) {
    if (part === '..') {
      if (!parts.length) return null;
      parts.pop();
    } else if (part && part !== '.') parts.push(part);
  }
  return parts.join('/');
}
export function readEdition(folder, { allowEmpty = false } = {}) {
  const root = resolve(folder, 'notebook');
  const config = JSON.parse(safeRead(root, 'publish.json').toString('utf8'));
  if (
    typeof config.title !== 'string' ||
    !Array.isArray(config.pages) ||
    (!allowEmpty && !config.pages.length)
  )
    throw new Error('Select at least one note with “Include in public edition” before publishing.');
  const layout = config.layout ?? 'single-page';
  if (!['single-page', 'separate-pages'].includes(layout))
    throw new Error('Choose single-page or separate-pages for the public notebook layout.');
  const images = {};
  const pages = [...new Set(config.pages)].map((path) => {
    if (typeof path !== 'string' || !/\.md$/i.test(path))
      throw new Error('Public pages must be Markdown notes.');
    const markdown = splitNote(safeRead(root, path).toString('utf8')).body;
    const tree = unified().use(remarkParse).parse(markdown);
    const definitions = new Map();
    const scan = (node, visit) => {
      visit(node);
      for (const child of node.children ?? []) scan(child, visit);
    };
    scan(tree, (node) => {
      if (node.type === 'definition') definitions.set(node.identifier, node.url);
    });
    scan(tree, (node) => {
      const url =
        node.type === 'image'
          ? node.url
          : node.type === 'imageReference'
            ? definitions.get(node.identifier)
            : null;
      if (!url || /^[a-z]+:/i.test(url)) return;
      const target = posix.normalize(posix.join(posix.dirname(path), decodeURIComponent(url)));
      if (!/\.(png|jpe?g|gif|webp)$/i.test(target))
        throw new Error(`Image in ${path} must be a raster image inside the notebook.`);
      const bytes = safeRead(root, target);
      if (bytes.length > 5_000_000) throw new Error('Notebook images must be smaller than 5 MB.');
      const extension = target.split('.').pop().toLowerCase();
      images[target] =
        `data:image/${extension === 'jpg' ? 'jpeg' : extension};base64,${bytes.toString('base64')}`;
    });
    return { path, markdown };
  });
  return { title: config.title, layout, pages, images };
}

const escape = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const noteUrl = (path) => '/notes/' + path.split('/').map(encodeURIComponent).join('/') + '/';
const stem = (path) => path.split('/').pop().replace(/\.md$/i, '');
const CSS = `:root{--bg:#f7f6f2;--text:#1f2a24;--panel:#ffffff;--border:#d8d5cc;--accent:#2f6f4e;--muted:#6b7570;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--bg:#171a18;--text:#e6e4dc;--panel:#212623;--border:#3a403c;--accent:#7fc8a0;--muted:#9aa39e}}
html[data-theme=dark]{--bg:#171a18;--text:#e6e4dc;--panel:#212623;--border:#3a403c;--accent:#7fc8a0;--muted:#9aa39e}
body{margin:0;font:16px/1.6 system-ui,sans-serif;background:var(--bg);color:var(--text)}
.reader{display:grid;grid-template-columns:240px 1fr;min-height:100vh}.reader aside{padding:32px 20px;border-right:1px solid var(--border)}
.reader nav a{display:block;color:var(--accent);padding:8px 0;text-decoration:none}.reader nav a[aria-current]{font-weight:600}
.reader article{padding:45px 8%;max-width:950px}.reader img{max-width:100%}.reader a{color:var(--accent)}.reader h1{font-family:Georgia,serif;font-size:22px}
.reader pre{overflow:auto;background:var(--panel);padding:15px}.reader small{color:var(--muted)}.reader input{width:100%;box-sizing:border-box;padding:6px 8px;margin:8px 0;border:1px solid var(--border);border-radius:4px;background:var(--panel);color:var(--text)}
.reader article[hidden]{display:none}@media (max-width:650px){.reader{grid-template-columns:1fr}.reader aside{border-right:0;border-bottom:1px solid var(--border)}}`;

/** Render one note's Markdown to HTML with links and images resolved against the edition. */
async function renderPage(edition, page, hrefFor) {
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkHtml, { sanitize: false })
    .process(page.markdown);
  let html = String(file);
  html = html.replace(/<a href="([^"]*)"/g, (m, href) => {
    const target = resolveNotePath(page.path, href);
    if (target === null) return `<a rel="noreferrer" href="${href}"`;
    return edition.pages.some((p) => p.path === target)
      ? `<a href="${escape(hrefFor(target))}"`
      : `<a data-private="true"`;
  });
  html = html.replace(/<img src="([^"]*)"/g, (m, src) => {
    const target = resolveNotePath(page.path, src);
    const image = target ? edition.images[target] : undefined;
    return image ? `<img src="${image}"` : `<img alt="" src=""`;
  });
  return html;
}
function shell({ title, headTitle, aside, article, script = '' }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/><title>${escape(headTitle)}</title><style>${CSS}</style></head><body><div class="reader"><aside><small>PUBLIC NOTEBOOK</small><h1>${escape(title)}</h1>${aside}<small>Grown in Crux Garden<br/>A read-only edition</small></aside>${article}</div>${script}</body></html>`;
}
export async function buildEdition(folder, outDir = join(folder, 'dist')) {
  const edition = readEdition(folder);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  if (edition.layout === 'separate-pages') {
    for (const page of edition.pages) {
      const nav = edition.pages
        .map(
          (p) =>
            `<a href="${escape(noteUrl(p.path))}"${p.path === page.path ? ' aria-current="page"' : ''}>${escape(p.path.replace(/\.md$/i, ''))}</a>`,
        )
        .join('');
      const html = shell({
        title: edition.title,
        headTitle: `${stem(page.path)} — ${edition.title}`,
        aside: `<nav>${nav}</nav>`,
        article: `<article><h2>${escape(stem(page.path))}</h2>${await renderPage(edition, page, noteUrl)}</article>`,
      });
      const target = join(outDir, 'notes', ...page.path.split('/'), 'index.html');
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, html);
      if (page === edition.pages[0]) writeFileSync(join(outDir, 'index.html'), html);
    }
    return edition;
  }
  const hrefFor = (path) => '#' + encodeURIComponent(path);
  const nav = edition.pages
    .map(
      (p) =>
        `<a href="${escape(hrefFor(p.path))}" data-page="${escape(p.path)}" data-text="${escape((p.path + ' ' + p.markdown).toLowerCase())}">${escape(p.path.replace(/\.md$/i, ''))}</a>`,
    )
    .join('');
  const articles = [];
  for (const page of edition.pages)
    articles.push(
      `<article data-page="${escape(page.path)}"${page === edition.pages[0] ? '' : ' hidden'}><h2>${escape(stem(page.path))}</h2>${await renderPage(edition, page, hrefFor)}</article>`,
    );
  const script = `<script>(function(){var pages=[].slice.call(document.querySelectorAll('article[data-page]'));var links=[].slice.call(document.querySelectorAll('nav a[data-page]'));function select(path){var found=false;pages.forEach(function(a){var on=a.getAttribute('data-page')===path;a.hidden=!on;if(on)found=true});links.forEach(function(l){if(l.getAttribute('data-page')===path)l.setAttribute('aria-current','page');else l.removeAttribute('aria-current')});if(!found&&pages[0]){pages[0].hidden=false}}function navigate(){var path='';try{path=decodeURIComponent(location.hash.slice(1))}catch(e){}if(path)select(path)}window.addEventListener('hashchange',navigate);navigate();var search=document.querySelector('input[aria-label="Search notebook"]');if(search)search.addEventListener('input',function(){var q=search.value.toLowerCase();links.forEach(function(l){l.hidden=q&&l.getAttribute('data-text').indexOf(q)<0})})})();</script>`;
  const html = shell({
    title: edition.title,
    headTitle: edition.title,
    aside: `<input aria-label="Search notebook" placeholder="Search pages…"/><nav>${nav}</nav>`,
    article: articles.join(''),
    script,
  });
  writeFileSync(join(outDir, 'index.html'), html);
  return edition;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  const edition = await buildEdition(process.cwd());
  console.log(`Public edition: ${edition.pages.length} page(s), ${edition.layout}.`);
}
