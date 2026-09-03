import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Artifact } from '@/api/types';
import { publicApi } from '@/api';
import { usePublicPreviewUrl } from '@/hooks/usePublicPreviewUrl';
import { useAppStore } from '@/stores/appStore';
import { useAuthStore } from '@/stores/authStore';
import MarkdownRenderer from '@/components/chat/MarkdownRenderer';
import { getFileIcon } from '@/components/artifacts/fileIcons';
import { LoadingPanel } from '@/components/ui';
import { pathOf, basename, extensionOf } from '@/lib/artifact-path';
import { publishOriginFor, publishBaseUrlFor, hasRemotePublishOrigin } from '@/lib/public-url';


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

  const ext = (a: Artifact) => extensionOf(pathOf(a));

  // 1. index.html at root
  const indexHtml = artifacts.find((a) => {
    const p = pathOf(a).toLowerCase();
    return p === 'index.html' || p === '/index.html';
  });
  if (indexHtml) return { artifact: indexHtml, mode: 'html' };

  // 2. Any root-level .html
  const rootHtml = artifacts.find((a) => {
    const parts = pathOf(a).split('/').filter(Boolean);
    return parts.length === 1 && (ext(a) === 'html' || ext(a) === 'htm');
  });
  if (rootHtml) return { artifact: rootHtml, mode: 'html' };

  // 3. Any .html file
  const anyHtml = artifacts.find((a) => ext(a) === 'html' || ext(a) === 'htm');
  if (anyHtml) return { artifact: anyHtml, mode: 'html' };

  // 4. README.md at root
  const readme = artifacts.find((a) => {
    const p = pathOf(a).toLowerCase();
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
  // The only origin allowed to exchange postMessages with this viewer.
  const iframeOrigin = publishOriginFor(cruxId);

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
      const author = useAppStore.getState().author;
      const apiBase = import.meta.env.VITE_API_URL || '';
      // SECURITY: the published page is someone else's code running on its own
      // origin. The visitor's crux.garden access token must never cross into
      // it — a malicious crux could read it from the message and act as the
      // visitor. Store calls therefore go through the parent-side proxy
      // (useStoreApiProxy on the public page), which holds the credentials.
      return {
        type: 'crux:session',
        token: null,
        mode: 'local',
        cruxId,
        apiBase,
        visitorId: author?.id ?? null,
        visitorName: author?.displayName ?? null,
      };
    }

    const pendingUnsubs = new Set<() => void>();
    function sendWhenReady(source: Window) {
      // If auth is still initializing (token refresh in progress), wait for it
      const { isLoading } = useAuthStore.getState();
      if (isLoading) {
        const unsub = useAuthStore.subscribe((state) => {
          if (!state.isLoading) {
            unsub();
            pendingUnsubs.delete(unsub);
            source.postMessage(buildSession(), iframeOrigin);
          }
        });
        pendingUnsubs.add(unsub); // released on unmount — no posting to a dead frame
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
    return () => {
      window.removeEventListener('message', handler);
      for (const unsub of pendingUnsubs) unsub();
      pendingUnsubs.clear();
    };
  }, [cruxId, iframeOrigin]);

  if (hasRemotePublishOrigin()) {
    // Deep links pass straight through; the edge router resolves directory
    // paths to their index.html.
    const entryPath = subPath || pathOf(artifact) || 'index.html';
    const src = `${publishBaseUrlFor(cruxId)}/${entryPath}`;

    return (
      <div className="w-full h-full relative">
        {!iframeLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-bg">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        <iframe
          src={src}
          sandbox="allow-scripts allow-same-origin allow-popups allow-modals allow-downloads allow-forms"
          allow="geolocation; camera; microphone; accelerometer; gyroscope; autoplay; fullscreen"
          className={`w-full h-full border-0 transition-opacity duration-150 ${iframeLoaded ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setIframeLoaded(true)}
          title="Published creation"
        />
      </div>
    );
  }

  // Fallback: service worker approach (local dev without S3)
  return (
    <ServiceWorkerHtmlRenderer
      artifact={artifact}
      artifacts={artifacts}
      username={username}
      slug={slug}
      cruxId={cruxId}
      downloadBlob={downloadBlob}
    />
  );
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
      sandbox="allow-scripts allow-same-origin allow-popups allow-modals allow-downloads allow-forms"
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

  if (content === null) {
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
  const [failed, setFailed] = useState(false);
  const path = pathOf(artifact) || artifact.id;

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    setObjectUrl(null);
    setFailed(false);
    downloadBlob(artifact.id)
      .then((blob) => {
        if (cancelled) return; // a late blob for a previous artifact must not leak a URL
        url = URL.createObjectURL(blob);
        setObjectUrl(url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [artifact.id, downloadBlob]);

  if (failed) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-text-muted">
        Couldn't load {path}
      </div>
    );
  }
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
    const pa = pathOf(a) || a.id;
    const pb = pathOf(b) || b.id;
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
            const path = pathOf(a) || a.id;
            const name = basename(path);
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

export default function ArtifactRenderer({
  artifacts,
  username,
  slug,
  cruxId,
  subPath,
  downloadBlob,
}: ArtifactRendererProps) {
  const main = useMemo(() => resolveMain(artifacts), [artifacts]);

  // Default download function uses publicApi. Stable identity: it is an effect
  // dependency downstream, so a fresh closure per render refetched on every
  // parent re-render.
  const fallbackDl = useCallback(
    (id: string) => publicApi.downloadArtifact(username, slug, id),
    [username, slug],
  );
  const dl = downloadBlob ?? fallbackDl;

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
      return (
        <FileListing artifacts={artifacts} username={username} slug={slug} downloadBlob={dl} />
      );
  }
}
