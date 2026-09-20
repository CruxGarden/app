/**
 * Documents to PDF, without a LaTeX install.
 *
 * Pandoc cannot make a PDF on its own — it hands the job to a PDF engine, and
 * its default is a full LaTeX distribution, gigabytes of it. There are two
 * better engines here, and the app tries them in order:
 *
 *   **Typst**, when the machine has it: a single binary that really typesets,
 *   so the PDF gets proper page breaks, page numbers and a table of contents.
 *   Pandoc's Typst template insists on a named font, and a font that exists on
 *   one machine may not on another, so the app asks Typst what it has.
 *
 *   **The browser**, always: Pandoc writes a standalone HTML page and Crux
 *   Garden prints it. No typesetting, but it is always there and it handles
 *   anything a page can show.
 *
 * The page is printed in a hidden window that is locked down harder than the
 * capture window, because the source is a document someone may have been sent:
 *
 *   · its own empty session, no cache, no cookies, nothing shared;
 *   · JavaScript off — a printed document has no need of it;
 *   · every request refused unless it is a file inside this Crux's folder, so
 *     a document cannot phone home, and a tracking pixel cannot report that it
 *     was opened;
 *   · no navigation, no new windows.
 */
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';

const { BrowserWindow, session } = require('electron');

const LOAD_TIMEOUT_MS = 30_000;
const SETTLE_MS = 400;

/**
 * A font Typst can actually use on this machine, best first. Pandoc's Typst
 * template fails outright with an empty font list, and the names differ by
 * platform, so the answer comes from Typst itself.
 */
let fontCache: string | null | undefined;
export async function typstFont(typstBinary: string): Promise<string | null> {
  if (fontCache !== undefined) return fontCache;
  const listed: string = await new Promise((resolve) => {
    execFile(typstBinary, ['fonts'], { timeout: 15_000 }, (_error, stdout) =>
      resolve(String(stdout || '')),
    );
  });
  const available = new Set(
    listed
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean),
  );
  const preferred = [
    'Helvetica',
    'Arial',
    'Liberation Sans',
    'DejaVu Sans',
    'Noto Sans',
    'Libertinus Serif',
    'Times New Roman',
  ];
  fontCache = preferred.find((name) => available.has(name)) ?? [...available][0] ?? null;
  return fontCache;
}

export function clearTypstFontCache(): void {
  fontCache = undefined;
}

export interface PrintOptions {
  /** Paper size: anything Chromium names, e.g. A4 or Letter. */
  pageSize?: string;
  landscape?: boolean;
  /** Print background colours and images, as a document usually wants. */
  background?: boolean;
}

/** Whether a URL points at a file inside this Crux's folder. */
function insideFolder(url: string, folder: string): boolean {
  if (!url.startsWith('file://')) return false;
  try {
    const at = path.resolve(decodeURIComponent(new URL(url).pathname));
    return at === folder || at.startsWith(folder + path.sep);
  } catch {
    return false;
  }
}

/**
 * Print one HTML file from a Crux folder to a PDF beside it. Both paths are
 * resolved inside the folder by the caller; this refuses anything else.
 */
export async function printHtmlToPdf(
  folder: string,
  htmlPath: string,
  pdfPath: string,
  options: PrintOptions = {},
): Promise<{ bytes: number }> {
  const root = path.resolve(folder);
  const source = path.resolve(root, htmlPath);
  const target = path.resolve(root, pdfPath);
  for (const at of [source, target])
    if (at !== root && !at.startsWith(root + path.sep))
      throw new Error(`Use paths relative to the crux folder: ${path.relative(root, at)}`);
  if (!fs.existsSync(source)) throw new Error(`There is no ${htmlPath} to print.`);

  const printSession = session.fromPartition(`crux-print-${Date.now()}`, { cache: false });
  printSession.webRequest.onBeforeRequest(
    (details: { url: string }, callback: (response: { cancel: boolean }) => void) => {
      callback({ cancel: !insideFolder(details.url, root) });
    },
  );

  const win = new BrowserWindow({
    width: 1240,
    height: 1754,
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      javascript: false,
      webSecurity: true,
      backgroundThrottling: false,
      session: printSession,
    },
  });
  win.webContents.on('will-navigate', (event: { preventDefault(): void }) =>
    event.preventDefault(),
  );
  win.webContents.on('will-redirect', (event: { preventDefault(): void }) =>
    event.preventDefault(),
  );
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('the document took too long to lay out')), LOAD_TIMEOUT_MS),
  );
  try {
    await Promise.race([win.loadURL(pathToFileURL(source).toString()), timeout]);
    await Promise.race([new Promise((resolve) => setTimeout(resolve, SETTLE_MS)), timeout]);
    const pdf: Buffer = await win.webContents.printToPDF({
      pageSize: options.pageSize ?? 'A4',
      landscape: !!options.landscape,
      printBackground: options.background !== false,
      margins: { marginType: 'default' },
    });
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, pdf);
    return { bytes: pdf.length };
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}
