import { useState, useEffect } from 'react';
import { PhotoProvider, PhotoView } from 'react-photo-view';
import 'react-photo-view/dist/react-photo-view.css';
import { cn } from '@/lib/cn';
import type { Dimension, Artifact } from '@/api/types';
import { getServices } from '@/services';
import { pathOf, basename } from '@/lib/artifact-path';

interface GrowthCardProps {
  growth: Dimension;
  index: number;
  isActive: boolean;
  isViewing: boolean;
  onClick: () => void;
  onDetailClick: (e: React.MouseEvent) => void;
}

interface PreviewInfo {
  type: 'html' | 'image' | 'markdown' | 'code' | 'text';
  path: string;
  artifactId: string;
  mimeType: string;
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Detect primary artifact from a list — same logic as useGrowthCreation */
function detectPreview(artifacts: Artifact[]): PreviewInfo | null {
  if (artifacts.length === 0) return null;

  const indexHtml = artifacts.find((a) => {
    const p = pathOf(a).toLowerCase();
    return p === 'index.html' || p.endsWith('/index.html');
  });
  if (indexHtml) {
    return { type: 'html', path: pathOf(indexHtml), artifactId: indexHtml.id, mimeType: indexHtml.mimeType };
  }

  const firstImage = artifacts.find((a) => a.mimeType?.startsWith('image/'));
  if (firstImage) {
    return { type: 'image', path: pathOf(firstImage), artifactId: firstImage.id, mimeType: firstImage.mimeType };
  }

  const readme = artifacts.find((a) => {
    const p = pathOf(a).toLowerCase();
    return p === 'readme.md' || p.endsWith('/readme.md');
  });
  if (readme) {
    return { type: 'markdown', path: pathOf(readme), artifactId: readme.id, mimeType: readme.mimeType };
  }

  const firstText = artifacts.find((a) => a.encoding === 'utf-8' && !pathOf(a).endsWith('.keep'));
  if (firstText) {
    const mime = firstText.mimeType || '';
    const isCode = mime.includes('javascript') || mime.includes('python') || mime.includes('css') || mime.includes('json') || mime.includes('xml');
    return { type: isCode ? 'code' : 'text', path: pathOf(firstText), artifactId: firstText.id, mimeType: firstText.mimeType };
  }

  return null;
}

function PreviewIcon({ type }: { type: string }) {
  const props = {
    width: 12, height: 12, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  };

  switch (type) {
    case 'html':
      return <svg {...props}><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></svg>;
    case 'image':
      return <svg {...props}><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>;
    default:
      return <svg {...props}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>;
  }
}

/** Hook to resolve preview info — uses stored meta or lazily discovers from snapshot artifacts */
function usePreview(growth: Dimension): PreviewInfo | null {
  const stored = growth.meta?.preview as PreviewInfo | undefined;
  const [discovered, setDiscovered] = useState<PreviewInfo | null>(null);

  useEffect(() => {
    if (stored) return; // already have it
    let cancelled = false;

    (async () => {
      try {
        const { artifact } = getServices();
        const arts = await artifact.findByResource('crux', growth.targetId);
        if (cancelled) return;
        const p = detectPreview(arts);
        if (p) setDiscovered(p);
      } catch {
        // ignore
      }
    })();

    return () => { cancelled = true; };
  }, [growth.targetId, stored]);

  return stored || discovered;
}

/** Hook to load thumbnail blob URL from a snapshot's thumb.png */
function useThumbnail(growth: Dimension): string | null {
  const thumbnailId = growth.meta?.thumbnailId as string | undefined;
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!thumbnailId) return;
    let cancelled = false;
    let objectUrl: string | null = null;

    (async () => {
      try {
        const { artifact } = getServices();
        const blob = await artifact.downloadBlob(thumbnailId);
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      } catch {
        // ignore — thumbnail not available
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [thumbnailId]);

  return url;
}

export default function GrowthCard({ growth, index, isActive, isViewing, onClick, onDetailClick }: GrowthCardProps) {
  const label = (growth.meta?.label as string) || null;
  const summary = (growth.meta?.summary as string) || null;
  const preview = usePreview(growth);
  const thumbnailUrl = useThumbnail(growth);
  const artifactCount = (growth.meta?.artifactCount as number) || 0;
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      className={cn(
        'w-full text-left rounded-[var(--radius-sm)] px-3 py-2.5 transition-colors duration-150 cursor-pointer',
        'border',
        isViewing
          ? 'bg-growth-card-active border-growth-card-label/50 text-growth-card-text ring-1 ring-growth-card-label/30'
          : isActive
            ? 'bg-growth-card-active border-growth-card-label/30 text-growth-card-text'
            : 'bg-growth-card border-transparent text-growth-card-text-muted hover:bg-growth-card-hover hover:text-growth-card-text',
      )}
    >
      <div className="flex items-start gap-2.5">
        {/* Timeline dot */}
        <div className="flex flex-col items-center pt-1.5 shrink-0">
          <div className={cn(
            'w-2 h-2 rounded-full',
            isViewing ? 'bg-growth-dot-active ring-2 ring-growth-dot-active/40' : isActive ? 'bg-growth-dot-active' : 'bg-growth-dot',
          )} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono text-growth-card-label/70 uppercase">#{index + 1}</span>
              {artifactCount > 0 && (
                <span className="text-[10px] text-text-muted">
                  {artifactCount} file{artifactCount !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-growth-card-text-muted shrink-0">{formatTime(growth.created)}</span>
              <button
                onClick={onDetailClick}
                className="text-growth-card-text-muted hover:text-growth-card-label transition-colors p-0.5 cursor-pointer"
                title="View details"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="1" />
                  <circle cx="19" cy="12" r="1" />
                  <circle cx="5" cy="12" r="1" />
                </svg>
              </button>
            </div>
          </div>

          {/* Label */}
          {label && (
            <p className="text-[12px] font-display font-medium text-growth-card-text mt-1">{label}</p>
          )}

          {/* Summary — click to expand full text */}
          {summary ? (
            <p
              onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
              className={cn(
                'text-[12px] font-body text-growth-card-text mt-1 leading-relaxed cursor-pointer',
                !expanded && 'line-clamp-2',
              )}
              title={expanded ? 'Click to collapse' : 'Click to read full summary'}
            >
              {summary}
            </p>
          ) : (
            <p className="text-[11px] font-body text-growth-card-text-muted mt-1 italic">Summarizing...</p>
          )}

          {/* Thumbnail image — click to view full size */}
          {thumbnailUrl && (
            <PhotoProvider>
              <PhotoView src={thumbnailUrl}>
                <img
                  src={thumbnailUrl}
                  alt="Snapshot thumbnail"
                  onClick={(e) => e.stopPropagation()}
                  className="w-full h-auto rounded-[var(--radius-sm)] border border-border/50 mt-1.5 object-cover max-h-24 cursor-zoom-in"
                />
              </PhotoView>
            </PhotoProvider>
          )}

          {/* Preview file indicator */}
          {!thumbnailUrl && preview && (
            <span className="flex items-center gap-1 text-[10px] text-growth-card-text-muted mt-1">
              <PreviewIcon type={preview.type} />
              <span className="truncate">{basename(preview.path)}</span>
            </span>
          )}

          {isViewing && (
            <span className="text-[10px] font-mono text-growth-card-label mt-1 block">VIEWING</span>
          )}
        </div>
      </div>
    </div>
  );
}
