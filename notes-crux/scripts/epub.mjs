// The book edition of a Notes Crux: the same chosen notes as the web edition,
// packaged as an EPUB 3 (a ZIP with a stored `mimetype` first, a package
// document, a navigation document, one XHTML chapter per note, the notebook's
// images as files). No dependency: the ZIP writer is below, remark renders the
// Markdown in edition.mjs. Readers: Apple Books, Calibre, KOReader, Thorium.
import { deflateRawSync } from 'node:zlib';
import { randomUUID } from 'node:crypto';

const CRC_TABLE = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c;
}
export function crc32(bytes) {
  let crc = -1;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

/** Write a ZIP: entries in order, `store` keeps one uncompressed (EPUB wants mimetype so). */
export function zip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data, 'utf8');
    const method = entry.store ? 0 : 8;
    const packed = entry.store ? data : deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10); // time
    local.writeUInt16LE(0x21, 12); // 1980-01-01
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, packed);
    centrals.push(central, name);
    offset += local.length + name.length + packed.length;
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, ...centrals, end]);
}

const escape = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
/** remark's HTML is XML-safe except for void tags and bare boolean attributes. */
export function toXhtml(html) {
  return html.replace(/<(br|hr|img|input|source|wbr)\b([^>]*?)\s*\/?>/g, (m, tag, attrs) => {
    const fixed = attrs.replace(/(?<=\s)(disabled|checked|hidden)(?=\s|$)/g, '$1="$1"');
    return `<${tag}${fixed} />`;
  });
}
export const slugOf = (title) =>
  String(title)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'notebook';
const CSS =
  'body{font-family:Georgia,serif;line-height:1.5;margin:1em}h1,h2,h3{font-family:sans-serif;line-height:1.2}img{max-width:100%}pre{white-space:pre-wrap;font-size:.9em;background:#f3f3f0;padding:.6em}code{font-size:.95em}blockquote{margin:1em 0;padding-left:1em;border-left:3px solid #999}table{border-collapse:collapse}td,th{border:1px solid #bbb;padding:.2em .5em}a{color:#2f6f4e}';
const xhtml = ({ title, body, lang = 'en', nav = false }) =>
  `<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${lang}" lang="${lang}"><head><meta charset="utf-8" /><title>${escape(title)}</title><link rel="stylesheet" type="text/css" href="${nav ? '' : '../'}style.css" /></head><body>${body}</body></html>`;

/**
 * Build the EPUB from a read edition. `chapters` are `{ path, title, html }`
 * with links already pointing at chapter files and images at `../images/…`;
 * `images` are `{ name, data }` files under OEBPS/images.
 */
export function buildEpubBytes({
  title,
  chapters,
  images,
  identifier = `urn:uuid:${randomUUID()}`,
}) {
  const modified = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const items = chapters.map((c, i) => ({ id: `ch${i + 1}`, href: `text/ch${i + 1}.xhtml`, ...c }));
  const manifest = [
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav" />',
    '<item id="css" href="style.css" media-type="text/css" />',
    ...items.map(
      (i) => `<item id="${i.id}" href="${i.href}" media-type="application/xhtml+xml" />`,
    ),
    ...images.map(
      (img, n) =>
        `<item id="img${n + 1}" href="images/${escape(img.name)}" media-type="${img.type}" />`,
    ),
  ].join('');
  const spine = items.map((i) => `<itemref idref="${i.id}" />`).join('');
  const opf = `<?xml version="1.0" encoding="utf-8"?>\n<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id" xml:lang="en"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="pub-id">${escape(identifier)}</dc:identifier><dc:title>${escape(title)}</dc:title><dc:language>en</dc:language><dc:publisher>Crux Garden</dc:publisher><meta property="dcterms:modified">${modified}</meta></metadata><manifest>${manifest}</manifest><spine>${spine}</spine></package>`;
  const nav = xhtml({
    title,
    nav: true,
    body: `<nav epub:type="toc" id="toc"><h1>${escape(title)}</h1><ol>${items.map((i) => `<li><a href="${i.href}">${escape(i.title)}</a></li>`).join('')}</ol></nav>`,
  });
  return zip([
    { name: 'mimetype', data: 'application/epub+zip', store: true },
    {
      name: 'META-INF/container.xml',
      data: '<?xml version="1.0" encoding="utf-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/package.opf" media-type="application/oebps-package+xml" /></rootfiles></container>',
    },
    { name: 'OEBPS/package.opf', data: opf },
    { name: 'OEBPS/nav.xhtml', data: nav },
    { name: 'OEBPS/style.css', data: CSS },
    ...items.map((i) => ({
      name: `OEBPS/${i.href}`,
      data: xhtml({ title: i.title, body: `<h1>${escape(i.title)}</h1>${toXhtml(i.html)}` }),
    })),
    ...images.map((img) => ({ name: `OEBPS/images/${img.name}`, data: img.data })),
  ]);
}
