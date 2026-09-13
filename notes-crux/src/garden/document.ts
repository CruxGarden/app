// Documents in Tigrana (V1-GAPS-PLAN.md §2.1): a Word document becomes a note
// (mammoth: DOCX → HTML, Tigrana's own HTML → Markdown), and a note becomes a
// Word document (Tigrana's Markdown → HTML, then `docx`). Fidelity is "read it
// and hand it back": headings, paragraphs, emphasis, links, lists, quotes,
// code, tables and images. Nothing here touches upstream's files.
import * as mammoth from 'mammoth';
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type IParagraphOptions,
  type ParagraphChild,
} from 'docx';
import { htmlToMarkdown, markdownToHtml } from '../lib/markdown';

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const IMAGE_TYPES: Record<string, 'png' | 'jpg' | 'gif' | 'bmp'> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
};

export const documentStem = (name: string) =>
  (name.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim() ||
    'Document').slice(0, 80);

/** DOCX bytes → the files a notebook import takes: the note and its images beside it. */
export async function docxToNotebookFiles(name: string, data: ArrayBuffer) {
  const stem = documentStem(name);
  const converted = await mammoth.convertToHtml(
    { arrayBuffer: data },
    {
      convertImage: mammoth.images.imgElement((image) =>
        image.read('base64').then((b64: string) => ({ src: `data:${image.contentType};base64,${b64}` })),
      ),
    },
  );
  const doc = new DOMParser().parseFromString(`<main>${converted.value}</main>`, 'text/html');
  const files: { path: string; content: string }[] = [];
  let n = 0;
  doc.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('src') || '';
    const match = src.match(/^data:image\/(png|jpeg|gif|webp);base64,/);
    if (!match) {
      img.remove();
      return;
    }
    n += 1;
    const path = `.assets/${stem} ${n}.${match[1] === 'jpeg' ? 'jpg' : match[1]}`;
    files.push({ path, content: src });
    img.setAttribute('src', path);
    if (!img.getAttribute('alt')) img.setAttribute('alt', `${stem} ${n}`);
  });
  const markdown = htmlToMarkdown(doc.body.firstElementChild!.innerHTML).trim() + '\n';
  files.unshift({ path: `${stem}.md`, content: markdown });
  return { stem, files, messages: converted.messages.map((m) => m.message) };
}

const stripFrontmatter = (markdown: string) => {
  if (!markdown.startsWith('---\n')) return markdown;
  const end = markdown.indexOf('\n---\n', 4);
  return end === -1 ? markdown : markdown.slice(end + 5);
};

type Inline = { bold?: boolean; italics?: boolean; strike?: boolean; underline?: boolean; code?: boolean };

function inlineRuns(node: Node, style: Inline = {}): ParagraphChild[] {
  const runs: ParagraphChild[] = [];
  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent ?? '';
      if (!text) return;
      runs.push(
        new TextRun({
          text,
          bold: style.bold,
          italics: style.italics,
          strike: style.strike,
          underline: style.underline ? {} : undefined,
          font: style.code ? 'Courier New' : undefined,
          shading: style.code ? { type: ShadingType.CLEAR, fill: 'F2F2F2' } : undefined,
        }),
      );
      return;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) return;
    const el = child as HTMLElement;
    const tag = el.tagName.toLowerCase();
    if (tag === 'br') {
      runs.push(new TextRun({ break: 1 }));
      return;
    }
    if (tag === 'a') {
      const href = el.getAttribute('href') || '';
      const children = inlineRuns(el, { ...style, underline: true }).filter(
        (r): r is TextRun => r instanceof TextRun,
      );
      if (/^https?:/i.test(href)) runs.push(new ExternalHyperlink({ children, link: href }));
      else runs.push(...children);
      return;
    }
    if (tag === 'img') return; // block images are handled by the paragraph walker
    const next: Inline = { ...style };
    if (tag === 'strong' || tag === 'b') next.bold = true;
    if (tag === 'em' || tag === 'i') next.italics = true;
    if (tag === 's' || tag === 'del' || tag === 'strike') next.strike = true;
    if (tag === 'u') next.underline = true;
    if (tag === 'code') next.code = true;
    runs.push(...inlineRuns(el, next));
  });
  return runs;
}

/** Pixel size of an image blob: the fast decoder first, the element decoder for files it refuses. */
async function imageSize(blob: Blob): Promise<{ width: number; height: number } | null> {
  const bitmap = await createImageBitmap(blob).catch(() => null);
  if (bitmap) return { width: bitmap.width, height: bitmap.height };
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth || 1, height: img.naturalHeight || 1 });
      img.onerror = () => resolve(null);
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function imageParagraph(img: HTMLImageElement, load: (src: string) => Promise<Blob | null>) {
  const src = img.getAttribute('data-markdown-src') || img.getAttribute('src') || '';
  const blob = await load(src);
  if (!blob) return null;
  const type = IMAGE_TYPES[blob.type];
  if (!type) return null;
  const size = await imageSize(blob);
  if (!size) return null;
  const scale = Math.min(1, 600 / size.width);
  const data = new Uint8Array(await blob.arrayBuffer());
  return new Paragraph({
    children: [
      new ImageRun({
        type,
        data,
        transformation: { width: Math.round(size.width * scale), height: Math.round(size.height * scale) },
        altText: { title: img.alt || 'Image', description: img.alt || 'Image', name: img.alt || 'Image' },
      }),
    ],
  });
}

const HEADINGS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
];

async function blocks(
  parent: Element,
  load: (src: string) => Promise<Blob | null>,
  list: { level: number; reference: 'bullets' | 'ordered' } | null = null,
): Promise<(Paragraph | Table)[]> {
  const out: (Paragraph | Table)[] = [];
  for (const el of Array.from(parent.children)) {
    const tag = el.tagName.toLowerCase();
    const heading = /^h([1-6])$/.exec(tag);
    if (heading) {
      out.push(new Paragraph({ heading: HEADINGS[Number(heading[1]) - 1], children: inlineRuns(el) }));
      continue;
    }
    if (tag === 'p') {
      const image = el.querySelector('img');
      if (image && !el.textContent?.trim()) {
        const paragraph = await imageParagraph(image, load);
        if (paragraph) out.push(paragraph);
        continue;
      }
      const options: IParagraphOptions = { children: inlineRuns(el) };
      out.push(new Paragraph(list ? { ...options, numbering: { reference: list.reference, level: list.level } } : options));
      continue;
    }
    if (tag === 'img') {
      const paragraph = await imageParagraph(el as HTMLImageElement, load);
      if (paragraph) out.push(paragraph);
      continue;
    }
    if (tag === 'ul' || tag === 'ol') {
      const reference = tag === 'ol' ? 'ordered' : 'bullets';
      const level = list ? Math.min(list.level + 1, 2) : 0;
      for (const li of Array.from(el.children)) {
        if (li.tagName.toLowerCase() !== 'li') continue;
        const checkbox = li.querySelector('input[type=checkbox]');
        const prefix = checkbox ? ((checkbox as HTMLInputElement).checked ? '☑ ' : '☐ ') : '';
        const own = Array.from(li.childNodes).filter(
          (n) => !(n instanceof Element && /^(ul|ol)$/i.test(n.tagName)),
        );
        const holder = li.ownerDocument.createElement('span');
        own.forEach((n) => holder.append(n.cloneNode(true)));
        holder.querySelectorAll('input').forEach((i) => i.remove());
        out.push(
          new Paragraph({
            children: [...(prefix ? [new TextRun(prefix)] : []), ...inlineRuns(holder)],
            numbering: { reference, level },
          }),
        );
        for (const nested of Array.from(li.children).filter((c) => /^(ul|ol)$/i.test(c.tagName))) {
          const wrapper = li.ownerDocument.createElement('div');
          wrapper.append(nested.cloneNode(true));
          out.push(...(await blocks(wrapper, load, { level, reference })));
        }
      }
      continue;
    }
    if (tag === 'blockquote') {
      const parts = el.children.length ? Array.from(el.children) : [el];
      for (const part of parts)
        out.push(
          new Paragraph({
            children: inlineRuns(part, { italics: true }),
            indent: { left: 720 },
            border: { left: { style: BorderStyle.SINGLE, size: 12, color: 'BBBBBB', space: 8 } },
          }),
        );
      continue;
    }
    if (tag === 'pre') {
      const lines = (el.textContent ?? '').replace(/\n$/, '').split('\n');
      for (const line of lines)
        out.push(
          new Paragraph({
            children: [new TextRun({ text: line || ' ', font: 'Courier New', size: 20 })],
            shading: { type: ShadingType.CLEAR, fill: 'F2F2F2' },
          }),
        );
      continue;
    }
    if (tag === 'table') {
      const rows = Array.from(el.querySelectorAll('tr')).map(
        (tr) =>
          new TableRow({
            children: Array.from(tr.children).map(
              (cell) =>
                new TableCell({
                  children: [
                    new Paragraph({
                      children: inlineRuns(cell, { bold: cell.tagName.toLowerCase() === 'th' }),
                    }),
                  ],
                }),
            ),
          }),
      );
      if (rows.length) out.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }));
      continue;
    }
    if (tag === 'hr') {
      out.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '999999' } } }));
      continue;
    }
    if (el.children.length) out.push(...(await blocks(el, load, list)));
    else if (el.textContent?.trim()) out.push(new Paragraph({ children: inlineRuns(el) }));
  }
  return out;
}

/** A note's Markdown → DOCX bytes. `load` fetches an image by the path the note uses. */
export async function noteToDocx(
  title: string,
  markdown: string,
  load: (src: string) => Promise<Blob | null>,
): Promise<ArrayBuffer> {
  const html = markdownToHtml(stripFrontmatter(markdown));
  const doc = new DOMParser().parseFromString(`<main>${html}</main>`, 'text/html');
  const body = await blocks(doc.body.firstElementChild!, load);
  const numbering = (reference: string, format: (typeof LevelFormat)[keyof typeof LevelFormat], text: (l: number) => string) => ({
    reference,
    levels: [0, 1, 2].map((level) => ({
      level,
      format,
      text: text(level),
      alignment: AlignmentType.START,
      style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
    })),
  });
  const document = new Document({
    creator: 'Crux Garden',
    title,
    numbering: {
      config: [
        numbering('bullets', LevelFormat.BULLET, () => '•'),
        numbering('ordered', LevelFormat.DECIMAL, (l) => `%${l + 1}.`),
      ],
    },
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    sections: [{ children: [new Paragraph({ text: title, heading: HeadingLevel.TITLE }), ...body] }],
  });
  const blob = await Packer.toBlob(document);
  return blob.arrayBuffer();
}
