import { useEffect, useState, useMemo } from 'react';
import { getDownloadUrl } from '@/api/public';
import hljs from 'highlight.js/lib/core';
import typescript from 'highlight.js/lib/languages/typescript';
import javascript from 'highlight.js/lib/languages/javascript';
import css from 'highlight.js/lib/languages/css';
import xml from 'highlight.js/lib/languages/xml';
import json from 'highlight.js/lib/languages/json';
import markdown from 'highlight.js/lib/languages/markdown';
import python from 'highlight.js/lib/languages/python';
import bash from 'highlight.js/lib/languages/bash';
import { cn } from '@/lib/cn';
import type { Attachment } from '@/api/types';
import { cruxes } from '@/api';
import MarkdownRenderer from '@/components/chat/MarkdownRenderer';

hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('css', css);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('json', json);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('python', python);
hljs.registerLanguage('bash', bash);

const EXT_TO_LANG: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  css: 'css',
  html: 'xml',
  htm: 'xml',
  xml: 'xml',
  svg: 'xml',
  json: 'json',
  md: 'markdown',
  mdx: 'markdown',
  py: 'python',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
};

const IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/x-icon',
]);

const TEXT_PREFIXES = [
  'text/',
  'application/json',
  'application/javascript',
  'application/typescript',
  'application/xml',
  'image/svg+xml',
];

const TEXT_EXTENSIONS = new Set([
  'md', 'mdx', 'txt', 'csv', 'log',
  'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx',
  'json', 'jsonc', 'json5',
  'html', 'htm', 'xml', 'svg', 'css', 'scss', 'less',
  'py', 'rb', 'rs', 'go', 'java', 'c', 'cpp', 'h', 'hpp',
  'sh', 'bash', 'zsh', 'fish',
  'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'env',
  'sql', 'graphql', 'gql',
  'vue', 'svelte', 'astro',
  'makefile', 'dockerfile',
]);

function isTextMime(mime: string, filename?: string): boolean {
  if (TEXT_PREFIXES.some((t) => mime.startsWith(t))) return true;
  if (filename) {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    if (TEXT_EXTENSIONS.has(ext)) return true;
    const base = filename.split('/').pop()?.toLowerCase() || '';
    if (TEXT_EXTENSIONS.has(base)) return true;
  }
  return false;
}

function isImageMime(mime: string): boolean {
  return IMAGE_TYPES.has(mime) || mime === 'image/svg+xml';
}

type ViewMode = 'source' | 'preview';

const PREVIEWABLE_EXTS = new Set(['html', 'htm', 'svg', 'md', 'mdx']);

/**
 * Rewrite relative src/href in HTML to point at the public attachment download endpoint.
 * Uses the same URL pattern as published display mode (no auth required).
 */
function rewriteUrls(
  html: string,
  username: string,
  slug: string,
  attachments: Attachment[],
  cacheBust?: number,
): string {
  if (attachments.length === 0 || !username || !slug) return html;

  const pathMap = new Map<string, string>();
  for (const a of attachments) {
    const path = a.meta?.path || a.filename || a.id;
    pathMap.set(path, a.id);
    if (path.startsWith('/')) pathMap.set(path.slice(1), a.id);
    const filename = path.split('/').pop();
    if (filename && !pathMap.has(filename)) pathMap.set(filename, a.id);
  }

  const suffix = cacheBust ? `?v=${cacheBust}` : '';
  return html.replace(
    /(src|href)=(["'])([^"']+)\2/gi,
    (match, attr: string, quote: string, value: string) => {
      if (
        value.startsWith('http://') ||
        value.startsWith('https://') ||
        value.startsWith('data:') ||
        value.startsWith('#') ||
        value.startsWith('//')
      ) {
        return match;
      }
      const cleaned = value.startsWith('./') ? value.slice(2) : value;
      const id = pathMap.get(cleaned) || pathMap.get(value);
      if (id) {
        return `${attr}=${quote}${getDownloadUrl(username, slug, id)}${suffix}${quote}`;
      }
      return match;
    },
  );
}

interface FileContentProps {
  artifact: Attachment;
  cruxId: string;
  artifacts?: Attachment[];
  username?: string;
  slug?: string;
}

export default function FileContent({
  artifact,
  cruxId,
  artifacts = [],
  username = '',
  slug = '',
}: FileContentProps) {
  const [content, setContent] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const path = artifact.meta?.path || artifact.filename || artifact.id;
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const mime = artifact.mimeType || 'text/plain';
  const hasPreview = PREVIEWABLE_EXTS.has(ext);

  const [viewMode, setViewMode] = useState<ViewMode>(hasPreview ? 'preview' : 'source');

  // Reset view mode when switching files
  useEffect(() => {
    setViewMode(hasPreview ? 'preview' : 'source');
  }, [artifact.id, hasPreview]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    cruxes
      .downloadAttachment(cruxId, artifact.id)
      .then((blob) => {
        if (cancelled) return;

        if (isTextMime(mime, path)) {
          blob.text().then((text) => {
            if (!cancelled) {
              setContent(text);
              setBlobUrl(null);
              setLoading(false);
            }
          });
        } else {
          const url = URL.createObjectURL(blob);
          setBlobUrl(url);
          setContent(null);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setContent('// Error loading file');
          setBlobUrl(null);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [artifact.id, artifact.updated, cruxId, mime]);

  const highlighted = useMemo(() => {
    if (!content) return null;
    const lang = EXT_TO_LANG[ext];
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(content, { language: lang }).value;
      } catch {
        return null;
      }
    }
    return null;
  }, [content, ext]);

  // Create SVG blob URL from text content for preview
  const svgPreviewUrl = useMemo(() => {
    if (ext === 'svg' && content) {
      return URL.createObjectURL(new Blob([content], { type: 'image/svg+xml' }));
    }
    return null;
  }, [content, ext]);

  useEffect(() => {
    return () => {
      if (svgPreviewUrl) URL.revokeObjectURL(svgPreviewUrl);
    };
  }, [svgPreviewUrl]);

  if (loading) {
    return <div className="p-4 text-sm text-text-muted animate-pulse">Loading...</div>;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border gap-2">
        <span className="text-xs font-mono text-text-muted truncate flex-1">{path}</span>
        <div className="flex items-center gap-2 shrink-0">
          {hasPreview && content !== null && (
            <div className="flex bg-bg rounded-[var(--radius-sm)] p-0.5">
              <button
                onClick={() => setViewMode('preview')}
                className={cn(
                  'px-2 py-0.5 text-[10px] font-mono rounded-[var(--radius-sm)] transition-colors cursor-pointer',
                  viewMode === 'preview'
                    ? 'bg-accent-muted text-accent'
                    : 'text-text-muted hover:text-text',
                )}
              >
                Preview
              </button>
              <button
                onClick={() => setViewMode('source')}
                className={cn(
                  'px-2 py-0.5 text-[10px] font-mono rounded-[var(--radius-sm)] transition-colors cursor-pointer',
                  viewMode === 'source'
                    ? 'bg-accent-muted text-accent'
                    : 'text-text-muted hover:text-text',
                )}
              >
                Source
              </button>
            </div>
          )}
          <span className="text-[10px] font-mono text-text-muted uppercase">{ext}</span>
        </div>
      </div>

      {/* HTML preview */}
      {content !== null && viewMode === 'preview' && (ext === 'html' || ext === 'htm') && (
        <iframe
          srcDoc={rewriteUrls(content, username, slug, artifacts, Date.now())}
          sandbox="allow-scripts"
          className="flex-1 w-full bg-contrast rounded-b-[var(--radius-sm)]"
          title={path}
        />
      )}

      {/* SVG preview */}
      {content !== null && viewMode === 'preview' && ext === 'svg' && svgPreviewUrl && (
        <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-preview-bg">
          <img src={svgPreviewUrl} alt={path} className="max-w-full max-h-full object-contain" />
        </div>
      )}

      {/* Markdown preview */}
      {content !== null && viewMode === 'preview' && (ext === 'md' || ext === 'mdx') && (
        <div className="flex-1 overflow-auto p-4">
          <div className="max-w-prose mx-auto text-sm">
            <MarkdownRenderer content={content} />
          </div>
        </div>
      )}

      {/* Source view with syntax highlighting */}
      {content !== null && (viewMode === 'source' || !hasPreview) && (
        <div className="flex-1 overflow-auto">
          <pre className="p-3 text-xs leading-relaxed font-mono">
            <code
              className={highlighted ? `hljs language-${EXT_TO_LANG[ext]}` : 'text-text'}
              dangerouslySetInnerHTML={highlighted ? { __html: highlighted } : undefined}
            >
              {highlighted ? undefined : content}
            </code>
          </pre>
        </div>
      )}

      {/* Image preview (raster) */}
      {blobUrl && isImageMime(mime) && (
        <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-preview-bg">
          <img src={blobUrl} alt={path} className="max-w-full max-h-full object-contain rounded" />
        </div>
      )}

      {/* Binary download */}
      {blobUrl && !isImageMime(mime) && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6">
          <div className="text-text-muted text-sm">
            Binary file ({mime}, {formatSize(artifact.size)})
          </div>
          <a
            href={blobUrl}
            download={path.split('/').pop() || 'file'}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-[var(--radius-sm)] bg-accent-muted text-accent border border-accent/20 hover:border-accent transition-all"
          >
            <DownloadIcon />
            Download
          </a>
        </div>
      )}
    </div>
  );
}

function formatSize(bytes?: number): string {
  if (!bytes) return 'unknown size';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DownloadIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}
