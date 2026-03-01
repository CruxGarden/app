import { useEffect, useMemo, useState } from 'react';
import type { Attachment } from '@/api/types';
import { publicApi } from '@/api';
import { usePublicPreviewUrl } from '@/hooks/usePublicPreviewUrl';
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
  const images = attachments.filter((a) => a.mimeType?.startsWith('image/'));
  if (images.length === 1) return { attachment: images[0]!, mode: 'image' };

  // 7. Fallback: listing
  return null;
}

/**
 * HTML renderer using the preview service worker.
 *
 * All attachments are cached at /__preview/ paths and the iframe loads via src=.
 * The browser handles all relative path resolution natively — linked CSS,
 * images, multi-page <a href> navigation all just work.
 *
 * External links open in new tabs via sandbox="allow-popups".
 */
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
  const previewUrl = usePublicPreviewUrl(attachments, attachment.id, username, slug);

  if (!previewUrl) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted text-sm animate-pulse">
        Loading...
      </div>
    );
  }

  return (
    <iframe
      key={previewUrl}
      src={previewUrl}
      sandbox="allow-scripts allow-same-origin allow-popups"
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
      return <MarkdownRendererView attachment={main.attachment} username={username} slug={slug} />;
    case 'image':
      return <ImageRenderer attachment={main.attachment} username={username} slug={slug} />;
    default:
      return <FileListing attachments={attachments} username={username} slug={slug} />;
  }
}
