/**
 * Fold the built website into one HTML file that can be dropped anywhere.
 *
 * Vite emits a page plus hashed assets; this inlines all of them - script,
 * stylesheet, both fonts and the favicon - so the result has no relative
 * references and needs nothing else uploaded alongside it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const out = path.join(dist, 'index.html');

let html = fs.readFileSync(out, 'utf8');
const dataUri = (file, type) =>
  `data:${type};base64,${fs.readFileSync(path.join(root, file)).toString('base64')}`;

// Fonts first: they are referenced from inside the stylesheet, so they have to
// be embedded before the stylesheet itself is inlined.
const cssHref = html.match(/<link rel="stylesheet"[^>]*href="\/?([^"]+)"/)?.[1];
let css = fs.readFileSync(path.join(dist, cssHref), 'utf8');
for (const font of ['CormorantGaramond-Latin', 'Outfit-Regular']) {
  css = css.replace(
    new RegExp(`url\\(["']?/fonts/${font}\\.woff2["']?\\)`, 'g'),
    `url(${dataUri(`public/fonts/${font}.woff2`, 'font/woff2')})`,
  );
}
html = html.replace(/<link rel="stylesheet"[^>]*>/, () => `<style>${css}</style>`);

// `</script>` can legally appear inside a JS string literal, and would end the
// tag early once inlined.
const jsSrc = html.match(/<script type="module"[^>]*src="\/?([^"]+)"/)?.[1];
const js = fs.readFileSync(path.join(dist, jsSrc), 'utf8').replace(/<\/script>/g, '<\\/script>');
html = html.replace(/<script type="module"[^>]*><\/script>/, () => `<script type="module">${js}</script>`);

// Icons: one inline SVG replaces the three files the app page linked to.
html = html
  .replace(/\s*<link rel="icon"[^>]*>/g, '')
  .replace(/\s*<link rel="apple-touch-icon"[^>]*>/g, '')
  .replace(/\s*<link\s+rel="preload"[\s\S]*?\/>/g, '')
  .replace(
    '<title>',
    `<link rel="icon" href="${dataUri('public/favicon.svg', 'image/svg+xml')}" />\n    <title>`,
  );

fs.rmSync(path.join(dist, 'assets'), { recursive: true, force: true });
for (const entry of fs.readdirSync(dist)) {
  if (entry !== 'index.html') fs.rmSync(path.join(dist, entry), { recursive: true, force: true });
}
fs.writeFileSync(out, html);

// Check the markup only: the bundle's own text mentions asset paths in
// strings (Vite's modulepreload polyfill among them) and those are inert.
const markup = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
const dangling = markup.match(/(?:src|href)="\/[^"]*/g);
if (dangling) throw new Error(`references left pointing outside the file: ${dangling.join(', ')}`);
console.log(`single file: dist/index.html  ${(html.length / 1024).toFixed(0)} kB`);
