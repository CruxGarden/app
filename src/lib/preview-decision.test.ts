import { describe, it, expect } from 'vitest';
import {
  previewFor,
  mountedIframeSrc,
  isHtmlPath,
  isConfigJsonPath,
  isPreviewJpgPath,
  type PreviewInput,
  type SitePreviewInput,
} from './preview-decision';
import { scaleToFit, CAPTURE_SIZE } from './thumbnail-capture';

// ── Fixtures ──

function site(over: Partial<SitePreviewInput> = {}): SitePreviewInput {
  return { isSite: false, url: null, phase: 'idle', detail: '', ...over };
}

function input(over: Partial<PreviewInput> = {}): PreviewInput {
  return {
    path: 'index.html',
    viewMode: 'preview',
    mimeType: 'text/html',
    hasFormSchema: false,
    hasContent: true,
    hasBlob: false,
    site: site(),
    previewUrl: null,
    desktopServed: false,
    ...over,
  };
}

const DEV_URL = 'http://127.0.0.1:4321/about';
const LOCAL_URL = 'http://127.0.0.1:52345/index.html?v=3';
const WEB_URL = '/__preview/crux-1/index.html?v=2';

// ── Predicates ──

describe('path predicates', () => {
  it('isHtmlPath matches html/htm case-insensitively, nothing else', () => {
    expect(isHtmlPath('index.html')).toBe(true);
    expect(isHtmlPath('pages/about.htm')).toBe(true);
    expect(isHtmlPath('INDEX.HTML')).toBe(true);
    expect(isHtmlPath('page.astro')).toBe(false);
    expect(isHtmlPath('style.css')).toBe(false);
  });

  it('isConfigJsonPath matches config.json by basename, case-insensitively', () => {
    expect(isConfigJsonPath('config.json')).toBe(true);
    expect(isConfigJsonPath('Config.JSON')).toBe(true);
    expect(isConfigJsonPath('sub/config.json')).toBe(true);
    expect(isConfigJsonPath('myconfig.json')).toBe(false);
    expect(isConfigJsonPath('config.json.bak')).toBe(false);
  });

  it('isPreviewJpgPath matches only the root preview.jpg (full path)', () => {
    expect(isPreviewJpgPath('preview.jpg')).toBe(true);
    expect(isPreviewJpgPath('Preview.JPG')).toBe(true);
    expect(isPreviewJpgPath('images/preview.jpg')).toBe(false);
  });
});

// ── previewFor ──

describe('previewFor: form mode', () => {
  it('config.json with a form schema in form mode → form', () => {
    expect(
      previewFor(input({ path: 'config.json', viewMode: 'form', mimeType: 'application/json', hasFormSchema: true })),
    ).toEqual({ kind: 'form' });
  });

  it('form mode without a schema falls through past source and preview arms', () => {
    // viewMode is neither 'source' nor 'preview', so a text file lands on unavailable
    expect(
      previewFor(input({ path: 'config.json', viewMode: 'form', mimeType: 'application/json', hasFormSchema: false })),
    ).toEqual({ kind: 'unavailable' });
  });

  it('form mode on a non-config file falls through even with a schema', () => {
    expect(
      previewFor(input({ path: 'data.json', viewMode: 'form', mimeType: 'application/json', hasFormSchema: true })),
    ).toEqual({ kind: 'unavailable' });
  });

  it('form mode without loaded content falls through', () => {
    expect(
      previewFor(input({ path: 'config.json', viewMode: 'form', hasFormSchema: true, hasContent: false })),
    ).toEqual({ kind: 'unavailable' });
  });
});

describe('previewFor: source mode', () => {
  it('any text file in source mode → source', () => {
    expect(previewFor(input({ viewMode: 'source' }))).toEqual({ kind: 'source' });
    expect(previewFor(input({ path: 'main.ts', viewMode: 'source', mimeType: 'text/typescript' }))).toEqual({ kind: 'source' });
  });

  it('source mode wins over html preview machinery', () => {
    expect(
      previewFor(input({ viewMode: 'source', previewUrl: WEB_URL })),
    ).toEqual({ kind: 'source' });
  });

  it('source mode in a site crux still shows Monaco', () => {
    expect(
      previewFor(input({ path: 'src/pages/index.astro', viewMode: 'source', site: site({ isSite: true, url: DEV_URL, phase: 'ready' }) })),
    ).toEqual({ kind: 'source' });
  });

  it('source mode with no text content falls through to binary views', () => {
    expect(
      previewFor(input({ path: 'photo.png', viewMode: 'source', mimeType: 'image/png', hasContent: false, hasBlob: true })),
    ).toEqual({ kind: 'image' });
  });
});

describe('previewFor: html preview', () => {
  it('html file in preview mode with a URL → iframe', () => {
    expect(previewFor(input({ previewUrl: WEB_URL }))).toEqual({
      kind: 'iframe',
      url: WEB_URL,
      localBase: null,
    });
  });

  it('html file in preview mode without a URL → loading', () => {
    expect(previewFor(input({ previewUrl: null }))).toEqual({ kind: 'loading' });
  });

  it('preview mode with content but a non-previewable extension falls through', () => {
    expect(
      previewFor(input({ path: 'main.ts', mimeType: 'text/typescript' })),
    ).toEqual({ kind: 'unavailable' });
  });

  it('preview mode without loaded content skips the preview arms', () => {
    expect(previewFor(input({ hasContent: false }))).toEqual({ kind: 'unavailable' });
  });
});

describe('previewFor: localBase (Copy/Open URL bar)', () => {
  it('present only when served by the desktop preview server', () => {
    const desktop = previewFor(input({ previewUrl: LOCAL_URL, desktopServed: true }));
    expect(desktop).toEqual({
      kind: 'iframe',
      url: LOCAL_URL,
      localBase: 'http://127.0.0.1:52345/index.html',
    });

    const web = previewFor(input({ previewUrl: WEB_URL, desktopServed: false }));
    expect(web).toEqual({ kind: 'iframe', url: WEB_URL, localBase: null });
  });

  it('strips the ?v= cache-busting query from localBase', () => {
    const target = previewFor(input({ previewUrl: 'http://127.0.0.1:9000/a/b.html?v=17', desktopServed: true }));
    expect(target).toMatchObject({ localBase: 'http://127.0.0.1:9000/a/b.html' });
  });

  it('leaves query-less URLs untouched', () => {
    const target = previewFor(input({ site: site({ isSite: true, url: DEV_URL, phase: 'ready' }), path: 'src/pages/about.astro', desktopServed: true }));
    expect(target).toMatchObject({ kind: 'iframe', url: DEV_URL, localBase: DEV_URL });
  });
});

describe('previewFor: site cruxes', () => {
  const readySite = site({ isSite: true, url: DEV_URL, phase: 'ready' });

  it('site crux in preview mode with a dev-server URL → iframe', () => {
    expect(
      previewFor(input({ path: 'src/pages/index.astro', site: readySite, desktopServed: true })),
    ).toEqual({ kind: 'iframe', url: DEV_URL, localBase: DEV_URL });
  });

  it('site crux wins over the plain html arm (html file inside a site)', () => {
    expect(
      previewFor(input({ path: 'public/legacy.html', site: readySite, previewUrl: null, desktopServed: true })),
    ).toEqual({ kind: 'iframe', url: DEV_URL, localBase: DEV_URL });
  });

  it('site crux in preview mode without a URL → site-status with phase/detail', () => {
    expect(
      previewFor(input({
        path: 'src/pages/index.astro',
        site: site({ isSite: true, phase: 'installing', detail: 'pnpm install…' }),
      })),
    ).toEqual({ kind: 'site-status', phase: 'installing', detail: 'pnpm install…' });
  });

  it('site crux dev-server failure surfaces the error phase and detail', () => {
    expect(
      previewFor(input({
        path: 'src/pages/index.astro',
        site: site({ isSite: true, phase: 'error', detail: 'EADDRINUSE' }),
      })),
    ).toEqual({ kind: 'site-status', phase: 'error', detail: 'EADDRINUSE' });
  });
});

describe('previewFor: svg / markdown / empty arms', () => {
  it('svg in preview mode → svg', () => {
    expect(previewFor(input({ path: 'logo.svg', mimeType: 'image/svg+xml' }))).toEqual({ kind: 'svg' });
  });

  it('md and mdx in preview mode → markdown', () => {
    expect(previewFor(input({ path: 'README.md', mimeType: 'text/markdown' }))).toEqual({ kind: 'markdown' });
    expect(previewFor(input({ path: 'post.mdx', mimeType: 'text/markdown' }))).toEqual({ kind: 'markdown' });
  });

  it('previewable extension with no renderer (astro off-desktop) → empty', () => {
    expect(previewFor(input({ path: 'src/pages/index.astro', mimeType: 'text/plain' }))).toEqual({ kind: 'empty' });
  });
});

describe('previewFor: binary views', () => {
  it('image blob → image', () => {
    expect(
      previewFor(input({ path: 'photo.png', viewMode: 'source', mimeType: 'image/png', hasContent: false, hasBlob: true })),
    ).toEqual({ kind: 'image' });
  });

  it('image mime without a blob → unavailable (never a broken viewer)', () => {
    expect(
      previewFor(input({ path: 'photo.png', viewMode: 'source', mimeType: 'image/png', hasContent: false, hasBlob: false })),
    ).toEqual({ kind: 'unavailable' });
  });

  it('video blob → video', () => {
    expect(
      previewFor(input({ path: 'clip.mp4', viewMode: 'source', mimeType: 'video/mp4', hasContent: false, hasBlob: true })),
    ).toEqual({ kind: 'video' });
  });

  it('other binary blob → blob', () => {
    expect(
      previewFor(input({ path: 'doc.pdf', viewMode: 'source', mimeType: 'application/pdf', hasContent: false, hasBlob: true })),
    ).toEqual({ kind: 'blob' });
  });

  it('nothing loaded at all → unavailable', () => {
    expect(
      previewFor(input({ path: 'mystery.bin', viewMode: 'source', mimeType: 'application/octet-stream', hasContent: false, hasBlob: false })),
    ).toEqual({ kind: 'unavailable' });
  });
});

// ── mountedIframeSrc (the always-on iframe, incl. off-screen auto-capture) ──

describe('mountedIframeSrc', () => {
  it('plain html file: mounted whenever the preview URL exists, any view mode', () => {
    expect(mountedIframeSrc({ path: 'index.html', site: site(), previewUrl: WEB_URL })).toBe(WEB_URL);
  });

  it('plain html file without a preview URL: not mounted', () => {
    expect(mountedIframeSrc({ path: 'index.html', site: site(), previewUrl: null })).toBeNull();
  });

  it('non-html file in a plain crux: never mounted', () => {
    expect(mountedIframeSrc({ path: 'README.md', site: site(), previewUrl: WEB_URL })).toBeNull();
  });

  it('site crux with a running dev server: mounted with the dev-server URL', () => {
    expect(
      mountedIframeSrc({ path: 'src/pages/index.astro', site: site({ isSite: true, url: DEV_URL, phase: 'ready' }), previewUrl: null }),
    ).toBe(DEV_URL);
  });

  it('site crux before the dev server is up: not mounted (even for html files)', () => {
    expect(
      mountedIframeSrc({ path: 'public/legacy.html', site: site({ isSite: true, phase: 'starting' }), previewUrl: WEB_URL }),
    ).toBeNull();
  });
});

// ── scaleToFit (capture geometry) ──

describe('scaleToFit', () => {
  it('passes through dimensions already within the capture bounds', () => {
    expect(scaleToFit(800, 600)).toEqual({ width: 800, height: 600 });
    expect(scaleToFit(CAPTURE_SIZE.width, CAPTURE_SIZE.height)).toEqual({ ...CAPTURE_SIZE });
  });

  it('scales oversized dimensions down preserving aspect ratio', () => {
    expect(scaleToFit(2560, 1440)).toEqual({ width: 1280, height: 720 });
    expect(scaleToFit(1000, 1800)).toEqual({ width: 500, height: 900 });
  });

  it('respects explicit bounds', () => {
    expect(scaleToFit(200, 100, 100, 100)).toEqual({ width: 100, height: 50 });
  });
});
