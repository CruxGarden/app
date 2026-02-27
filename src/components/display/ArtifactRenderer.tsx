import { useEffect, useMemo, useState } from 'react';
import type { Attachment } from '@/api/types';
import { publicApi } from '@/api';
import MarkdownRenderer from '@/components/chat/MarkdownRenderer';
import { getFileIcon } from '@/components/artifacts/fileIcons';

interface ArtifactRendererProps {
  attachments: Attachment[];
  username: string;
  slug: string;
}

type RenderMode = 'html' | 'markdown' | 'image' | 'listing';

interface MainFile {
  attachment: Attachment;
  mode: RenderMode;
}

function resolveMain(attachments: Attachment[]): MainFile | null {
  if (attachments.length === 0) return null;

  const byPath = (a: Attachment) => a.meta?.path || a.filename || a.id;
  const ext = (a: Attachment) => byPath(a).split('.').pop()?.toLowerCase() || '';

  // 1. index.html at root
  const indexHtml = attachments.find((a) => {
    const p = byPath(a).toLowerCase();
    return p === 'index.html' || p === '/index.html';
  });
  if (indexHtml) return { attachment: indexHtml, mode: 'html' };

  // 2. Any root-level .html
  const rootHtml = attachments.find((a) => {
    const p = byPath(a);
    const parts = p.split('/').filter(Boolean);
    return parts.length === 1 && (ext(a) === 'html' || ext(a) === 'htm');
  });
  if (rootHtml) return { attachment: rootHtml, mode: 'html' };

  // 3. Any .html file
  const anyHtml = attachments.find((a) => ext(a) === 'html' || ext(a) === 'htm');
  if (anyHtml) return { attachment: anyHtml, mode: 'html' };

  // 4. README.md at root
  const readme = attachments.find((a) => {
    const p = byPath(a).toLowerCase();
    return p === 'readme.md' || p === '/readme.md';
  });
  if (readme) return { attachment: readme, mode: 'markdown' };

  // 5. Any .md file
  const anyMd = attachments.find((a) => ext(a) === 'md' || ext(a) === 'mdx');
  if (anyMd) return { attachment: anyMd, mode: 'markdown' };

  // 6. Single image
  const images = attachments.filter((a) =>
    a.mimeType?.startsWith('image/'),
  );
  if (images.length === 1) return { attachment: images[0]!, mode: 'image' };

  // 7. Fallback: listing
  return null;
}

/**
 * Rewrite relative src/href attributes in HTML to point at public download URLs.
 */
function rewriteUrls(
  html: string,
  attachments: Attachment[],
  getUrl: (id: string) => string,
): string {
  // Build a map of path → attachmentId
  const pathMap = new Map<string, string>();
  for (const a of attachments) {
    const path = a.meta?.path || a.filename || a.id;
    pathMap.set(path, a.id);
    // Also map without leading slash
    if (path.startsWith('/')) pathMap.set(path.slice(1), a.id);
    // Map just the filename portion
    const filename = path.split('/').pop();
    if (filename && !pathMap.has(filename)) pathMap.set(filename, a.id);
  }

  return html.replace(
    /(src|href)=(["'])([^"']+)\2/gi,
    (_match, attr: string, quote: string, value: string) => {
      // Skip absolute URLs, data URLs, fragment-only, and protocol-relative
      if (
        value.startsWith('http://') ||
        value.startsWith('https://') ||
        value.startsWith('data:') ||
        value.startsWith('#') ||
        value.startsWith('//')
      ) {
        return `${attr}=${quote}${value}${quote}`;
      }

      // Strip leading ./ for matching
      const cleaned = value.startsWith('./') ? value.slice(2) : value;
      const id = pathMap.get(cleaned) || pathMap.get(value);

      if (id) {
        return `${attr}=${quote}${getUrl(id)}${quote}`;
      }

      return `${attr}=${quote}${value}${quote}`;
    },
  );
}

/**
 * Navigation script injected into every HTML page rendered in the iframe.
 * Intercepts link clicks:
 *  - Internal links (matching a known attachment path) → postMessage to parent for client-side nav
 *  - External links (http/https) → open in new tab
 *  - Hash links → handle normally
 */
const NAV_SCRIPT = `<script>(function(){
document.addEventListener("click",function(e){
  var a=e.target.closest?e.target.closest("a"):null;
  if(!a)return;
  var h=a.getAttribute("href");
  if(!h)return;
  if(h.startsWith("http://")||h.startsWith("https://")||h.startsWith("//")||h.startsWith("data:"))
    {e.preventDefault();window.open(h,"_blank");return;}
  if(h.startsWith("#"))return;
  e.preventDefault();
  var c=h.startsWith("./")?h.substring(2):h;
  window.parent.postMessage({type:"crux-navigate",path:c},"*");
});
})();<\/script>`;

function injectNavScript(html: string): string {
  if (html.includes('</body>')) {
    return html.replace('</body>', NAV_SCRIPT + '</body>');
  }
  return html + NAV_SCRIPT;
}

function HtmlRenderer({
  attachment,
  attachments,
  username,
  slug,
}: {
  attachment: Attachment;
  attachments: Attachment[];
  username: string;
  slug: string;
}) {
  const [currentId, setCurrentId] = useState(attachment.id);
  const [html, setHtml] = useState<string | null>(null);

  // Reset when the main attachment changes (e.g. navigating to a different crux)
  useEffect(() => {
    setCurrentId(attachment.id);
  }, [attachment.id]);

  // Build path → attachment ID lookup
  const pathMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of attachments) {
      const path = a.meta?.path || a.filename || a.id;
      map.set(path, a.id);
      if (path.startsWith('/')) map.set(path.slice(1), a.id);
      const filename = path.split('/').pop();
      if (filename && !map.has(filename)) map.set(filename, a.id);
    }
    return map;
  }, [attachments]);

  // Fetch current page content
  useEffect(() => {
    let cancelled = false;
    setHtml(null);
    publicApi
      .downloadAttachment(username, slug, currentId)
      .then((blob) => blob.text())
      .then((text) => {
        if (!cancelled) setHtml(text);
      })
      .catch(() => {
        if (!cancelled) setHtml('<p>Error loading content</p>');
      });
    return () => {
      cancelled = true;
    };
  }, [currentId, username, slug]);

  // Listen for navigation messages from the iframe
  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (e.data?.type === 'crux-navigate') {
        const path: string = e.data.path;
        const id = pathMap.get(path) || pathMap.get(path.replace(/^\.\//, ''));
        if (id) {
          setCurrentId(id);
        }
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [pathMap]);

  // Rewrite URLs and inject navigation script
  const rewritten = useMemo(() => {
    if (!html) return null;
    const urlRewritten = rewriteUrls(html, attachments, (id) =>
      publicApi.getDownloadUrl(username, slug, id),
    );
    return injectNavScript(urlRewritten);
  }, [html, attachments, username, slug]);

  if (!rewritten) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted text-sm animate-pulse">
        Loading...
      </div>
    );
  }

  return (
    <iframe
      srcDoc={rewritten}
      sandbox="allow-scripts allow-popups"
      className="w-full h-full border-0 bg-white"
      title="Published creation"
    />
  );
}

function MarkdownRendererView({
  attachment,
  username,
  slug,
}: {
  attachment: Attachment;
  username: string;
  slug: string;
}) {
  const [content, setContent] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    publicApi
      .downloadAttachment(username, slug, attachment.id)
      .then((blob) => blob.text())
      .then((text) => {
        if (!cancelled) setContent(text);
      })
      .catch(() => {
        if (!cancelled) setContent('Error loading content');
      });
    return () => {
      cancelled = true;
    };
  }, [attachment.id, username, slug]);

  if (!content) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted text-sm animate-pulse">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-6 md:p-12">
      <div className="max-w-prose mx-auto text-base leading-relaxed">
        <MarkdownRenderer content={content} />
      </div>
    </div>
  );
}

function ImageRenderer({
  attachment,
  username,
  slug,
}: {
  attachment: Attachment;
  username: string;
  slug: string;
}) {
  const url = publicApi.getDownloadUrl(username, slug, attachment.id);
  const path = attachment.meta?.path || attachment.filename || attachment.id;

  return (
    <div className="flex items-center justify-center h-full p-8">
      <img
        src={url}
        alt={path}
        className="max-w-full max-h-full object-contain rounded-[var(--radius)]"
      />
    </div>
  );
}

function FileListing({
  attachments,
  username,
  slug,
}: {
  attachments: Attachment[];
  username: string;
  slug: string;
}) {
  const sorted = [...attachments].sort((a, b) => {
    const pa = a.meta?.path || a.filename || a.id;
    const pb = b.meta?.path || b.filename || b.id;
    return pa.localeCompare(pb);
  });

  return (
    <div className="flex-1 overflow-auto p-6 md:p-12">
      <div className="max-w-2xl mx-auto">
        <h2 className="text-lg font-display font-medium text-text mb-4">Artifacts</h2>
        <div className="space-y-1">
          {sorted.map((a) => {
            const path = a.meta?.path || a.filename || a.id;
            const name = path.split('/').pop() || path;
            const url = publicApi.getDownloadUrl(username, slug, a.id);
            return (
              <a
                key={a.id}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 rounded-[var(--radius-sm)] hover:bg-surface/50 transition-colors group"
              >
                <span className="text-text-muted shrink-0">{getFileIcon(name)}</span>
                <span className="text-sm font-mono text-text group-hover:text-accent truncate">
                  {path}
                </span>
                <span className="text-xs text-text-muted ml-auto shrink-0">
                  {formatSize(a.size)}
                </span>
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function formatSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ArtifactRenderer({ attachments, username, slug }: ArtifactRendererProps) {
  const main = useMemo(() => resolveMain(attachments), [attachments]);

  if (!main) {
    return <FileListing attachments={attachments} username={username} slug={slug} />;
  }

  switch (main.mode) {
    case 'html':
      return (
        <HtmlRenderer
          attachment={main.attachment}
          attachments={attachments}
          username={username}
          slug={slug}
        />
      );
    case 'markdown':
      return (
        <MarkdownRendererView
          attachment={main.attachment}
          username={username}
          slug={slug}
        />
      );
    case 'image':
      return (
        <ImageRenderer
          attachment={main.attachment}
          username={username}
          slug={slug}
        />
      );
    default:
      return <FileListing attachments={attachments} username={username} slug={slug} />;
  }
}
