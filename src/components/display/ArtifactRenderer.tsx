import { useEffect, useMemo, useState } from 'react';
import type { Artifact } from '@/api/types';
import { publicApi } from '@/api';
import { usePublicPreviewUrl } from '@/hooks/usePublicPreviewUrl';
import { useAuthStore } from '@/stores/authStore';
import { getStoredTokens } from '@/api/client';
import MarkdownRenderer from '@/components/chat/MarkdownRenderer';
import { getFileIcon } from '@/components/artifacts/fileIcons';
import { LoadingPanel } from '@/components/ui';

// Template for per-crux isolated subdomain: https://{cruxId}.publish.crux.garden
const PUBLISH_ORIGIN_TEMPLATE = import.meta.env.VITE_PUBLISH_ORIGIN_TEMPLATE || '';
// Legacy flat URL fallback (deprecated): https://publish.crux.garden
const PUBLISHED_CONTENT_URL = import.meta.env.VITE_PUBLISHED_CONTENT_URL || '';

/** Fetch a blob by artifact ID — defaults to publicApi if not provided */
type DownloadBlobFn = (artifactId: string) => Promise<Blob>;

interface ArtifactRendererProps {
  artifacts: Artifact[];
  username: string;
  slug: string;
  cruxId: string;
  subPath?: string;
  downloadBlob?: DownloadBlobFn;
}

type RenderMode = 'html' | 'markdown' | 'image' | 'listing';

interface MainFile {
  artifact: Artifact;
  mode: RenderMode;
}

function resolveMain(artifacts: Artifact[]): MainFile | null {
  if (artifacts.length === 0) return null;

  const byPath = (a: Artifact) => a.meta?.path || a.filename || a.id;
  const ext = (a: Artifact) => byPath(a).split('.').pop()?.toLowerCase() || '';

  // 1. index.html at root
  const indexHtml = artifacts.find((a) => {
    const p = byPath(a).toLowerCase();
    return p === 'index.html' || p === '/index.html';
  });
  if (indexHtml) return { artifact: indexHtml, mode: 'html' };

  // 2. Any root-level .html
  const rootHtml = artifacts.find((a) => {
    const p = byPath(a);
    const parts = p.split('/').filter(Boolean);
    return parts.length === 1 && (ext(a) === 'html' || ext(a) === 'htm');
  });
  if (rootHtml) return { artifact: rootHtml, mode: 'html' };

  // 3. Any .html file
  const anyHtml = artifacts.find((a) => ext(a) === 'html' || ext(a) === 'htm');
  if (anyHtml) return { artifact: anyHtml, mode: 'html' };

  // 4. README.md at root
  const readme = artifacts.find((a) => {
    const p = byPath(a).toLowerCase();
    return p === 'readme.md' || p === '/readme.md';
  });
  if (readme) return { artifact: readme, mode: 'markdown' };

  // 5. Any .md file
  const anyMd = artifacts.find((a) => ext(a) === 'md' || ext(a) === 'mdx');
  if (anyMd) return { artifact: anyMd, mode: 'markdown' };

  // 6. Single image
  const images = artifacts.filter((a) => a.mimeType?.startsWith('image/'));
  if (images.length === 1) return { artifact: images[0]!, mode: 'image' };

  // 7. Fallback: listing
  return null;
}

/**
 * HTML renderer using the preview service worker.
 *
 * All artifacts are cached at /__preview/ paths and the iframe loads via src=.
 * The browser handles all relative path resolution natively — linked CSS,
 * images, multi-page <a href> navigation all just work.
 *
 * External links open in new tabs via sandbox="allow-popups".
 */
function HtmlRenderer({
  artifact,
  artifacts,
  cruxId,
  username,
  slug,
  subPath,
  downloadBlob,
}: {
  artifact: Artifact;
  artifacts: Artifact[];
  cruxId: string;
  username: string;
  slug: string;
  subPath?: string;
  downloadBlob: DownloadBlobFn;
}) {
  // Compute the expected iframe origin for postMessage validation.
  // Per-crux subdomain: https://{cruxId}.publish.crux.garden
  // Legacy flat URL: https://publish.crux.garden/{cruxId}/
  // Local dev: same origin
  const iframeOrigin = PUBLISH_ORIGIN_TEMPLATE
    ? PUBLISH_ORIGIN_TEMPLATE.replace('{cruxId}', cruxId)
    : PUBLISHED_CONTENT_URL
      ? new URL(`${PUBLISHED_CONTENT_URL}/${cruxId}/`).origin
      : window.location.origin;

  const [iframeLoaded, setIframeLoaded] = useState(false);

  // Listen for navigation messages from the iframe and update the parent URL
  useEffect(() => {
    const basePath = `/${username}/${slug}`;
    const handler = (e: MessageEvent) => {
      if (e.origin !== iframeOrigin) return;
      if (e.data?.type === 'crux:navigate' && typeof e.data.path === 'string') {
        const newPath = e.data.path === '/' ? basePath : `${basePath}${e.data.path}`;
        if (window.location.pathname !== newPath) {
          window.history.replaceState(null, '', newPath);
        }
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [username, slug, iframeOrigin]);

  // Handshake: iframe sends crux:ready when the store client is initialized,
  // parent responds with crux:session containing auth + crux ID + API base.
  // This guarantees both sides are ready regardless of load order.
  useEffect(() => {
    function buildSession() {
      const { accessToken } = getStoredTokens();
      const author = useAuthStore.getState().author;
      const apiBase = import.meta.env.VITE_API_URL || '';
      // Use local postMessage proxy when API is on localhost — browsers block
      // public origins from fetching private/loopback addresses (Private Network Access).
      const isLocalApi = apiBase.includes('localhost') || apiBase.includes('127.0.0.1');
      return {
        type: 'crux:session',
        token: accessToken ?? null,
        mode: isLocalApi ? 'local' : 'live',
        cruxId,
        apiBase,
        visitorId: author?.id ?? null,
        visitorName: author?.displayName ?? null,
      };
    }

    function sendWhenReady(source: Window) {
      // If auth is still initializing (token refresh in progress), wait for it
      const { isLoading } = useAuthStore.getState();
      if (isLoading) {
        const unsub = useAuthStore.subscribe((state) => {
          if (!state.isLoading) {
            unsub();
            source.postMessage(buildSession(), iframeOrigin);
          }
        });
      } else {
        source.postMessage(buildSession(), iframeOrigin);
      }
    }

    function handler(e: MessageEvent) {
      if (e.origin !== iframeOrigin) return;
      if (e.data?.type === 'crux:ready' && e.source) {
        sendWhenReady(e.source as Window);
      }
    }

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [cruxId, iframeOrigin]);

  if (PUBLISH_ORIGIN_TEMPLATE || PUBLISHED_CONTENT_URL) {
    // If a sub-path is provided (deep link), use it directly — CloudFront Function
    // will rewrite non-file paths to index.html for SPA support
    const entryPath = subPath || artifact.meta?.path || artifact.filename || 'index.html';
    // Per-crux subdomain: https://{cruxId}.publish.crux.garden/{entryPath}
    // Legacy flat URL: https://publish.crux.garden/{cruxId}/{entryPath}
    const src = PUBLISH_ORIGIN_TEMPLATE
      ? `${PUBLISH_ORIGIN_TEMPLATE.replace('{cruxId}', cruxId)}/${entryPath}`
      : `${PUBLISHED_CONTENT_URL}/${cruxId}/${entryPath}`;

    return (
      <div className="w-full h-full relative">
        {!iframeLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-bg">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        <iframe
          src={src}
          sandbox="allow-scripts allow-same-origin allow-popups allow-modals"
          allow="geolocation; camera; microphone; accelerometer; gyroscope; autoplay; fullscreen"
          className={`w-full h-full border-0 transition-opacity duration-150 ${iframeLoaded ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setIframeLoaded(true)}
          title="Published creation"
        />
      </div>
    );
  }

  // Fallback: service worker approach (local dev without S3)
  return <ServiceWorkerHtmlRenderer artifact={artifact} artifacts={artifacts} username={username} slug={slug} cruxId={cruxId} downloadBlob={downloadBlob} />;
}

function ServiceWorkerHtmlRenderer({
  artifact,
  artifacts,
  username,
  slug,
  downloadBlob,
}: {
  artifact: Artifact;
  artifacts: Artifact[];
  username: string;
  slug: string;
  cruxId: string;
  downloadBlob: DownloadBlobFn;
}) {
  const previewUrl = usePublicPreviewUrl(artifacts, artifact.id, username, slug, downloadBlob);

  if (!previewUrl) {
    return (
      <div className="flex items-center justify-center h-full">
        <LoadingPanel />
      </div>
    );
  }

  return (
    <iframe
      key={previewUrl}
      src={previewUrl}
      sandbox="allow-scripts allow-same-origin allow-popups allow-modals"
      allow="geolocation; camera; microphone; accelerometer; gyroscope; autoplay; fullscreen"
      className="w-full h-full border-0 bg-contrast"
      title="Published creation"
    />
  );
}

function MarkdownRendererView({
  artifact,
  downloadBlob,
}: {
  artifact: Artifact;
  downloadBlob: DownloadBlobFn;
}) {
  const [content, setContent] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    downloadBlob(artifact.id)
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
  }, [artifact.id, downloadBlob]);

  if (!content) {
    return (
      <div className="flex items-center justify-center h-full">
        <LoadingPanel />
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
  artifact,
  downloadBlob,
}: {
  artifact: Artifact;
  downloadBlob: DownloadBlobFn;
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const path = artifact.meta?.path || artifact.filename || artifact.id;

  useEffect(() => {
    let url: string | null = null;
    downloadBlob(artifact.id)
      .then((blob) => {
        url = URL.createObjectURL(blob);
        setObjectUrl(url);
      })
      .catch(() => {});
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [artifact.id, downloadBlob]);

  if (!objectUrl) {
    return (
      <div className="flex items-center justify-center h-full">
        <LoadingPanel />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center h-full p-8">
      <img
        src={objectUrl}
        alt={path}
        className="max-w-full max-h-full object-contain rounded-[var(--radius)]"
      />
    </div>
  );
}

function FileListing({
  artifacts,
  downloadBlob,
}: {
  artifacts: Artifact[];
  username: string;
  slug: string;
  downloadBlob: DownloadBlobFn;
}) {
  const sorted = [...artifacts].sort((a, b) => {
    const pa = a.meta?.path || a.filename || a.id;
    const pb = b.meta?.path || b.filename || b.id;
    return pa.localeCompare(pb);
  });

  const handleDownload = async (a: Artifact) => {
    const blob = await downloadBlob(a.id);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = a.filename || a.meta?.path || a.id;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 overflow-auto p-6 md:p-12">
      <div className="max-w-2xl mx-auto">
        <h2 className="text-lg font-display font-medium text-text mb-4">Artifacts</h2>
        <div className="space-y-1">
          {sorted.map((a) => {
            const path = a.meta?.path || a.filename || a.id;
            const name = path.split('/').pop() || path;
            return (
              <button
                key={a.id}
                onClick={() => handleDownload(a)}
                className="flex items-center gap-2 px-3 py-2 rounded-[var(--radius-sm)] hover:bg-surface/50 transition-colors group w-full text-left"
              >
                <span className="text-text-muted shrink-0">{getFileIcon(name)}</span>
                <span className="text-sm font-mono text-text group-hover:text-accent truncate">
                  {path}
                </span>
                <span className="text-xs text-text-muted ml-auto shrink-0">
                  {formatSize(a.size)}
                </span>
              </button>
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

export default function ArtifactRenderer({ artifacts, username, slug, cruxId, subPath, downloadBlob }: ArtifactRendererProps) {
  const main = useMemo(() => resolveMain(artifacts), [artifacts]);

  // Default download function uses publicApi
  const dl = downloadBlob || ((id: string) => publicApi.downloadArtifact(username, slug, id));

  if (!main) {
    return <FileListing artifacts={artifacts} username={username} slug={slug} downloadBlob={dl} />;
  }

  switch (main.mode) {
    case 'html':
      return (
        <HtmlRenderer
          artifact={main.artifact}
          artifacts={artifacts}
          cruxId={cruxId}
          username={username}
          slug={slug}
          subPath={subPath}
          downloadBlob={dl}
        />
      );
    case 'markdown':
      return <MarkdownRendererView artifact={main.artifact} downloadBlob={dl} />;
    case 'image':
      return <ImageRenderer artifact={main.artifact} downloadBlob={dl} />;
    default:
      return <FileListing artifacts={artifacts} username={username} slug={slug} downloadBlob={dl} />;
  }
}
