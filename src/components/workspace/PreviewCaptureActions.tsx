import { useEffect, useState } from 'react';
import { captureLocalPreview } from '@/services/preview-capture';
import { nativeToolsAvailable, onNativeProgress, renderVideo } from '@/services/native-tools';
import { getServices } from '@/services';
import { useCruxStore } from '@/stores/cruxStore';
import { confirmDialog } from '@/stores/dialogStore';

/**
 * The person's half of capture_preview and render_video (step 5), in the
 * Workshop's preview bar: Save screenshot → exports/preview.jpg; Export as
 * video → frames from the shell's capture window, then the bundled ffmpeg →
 * exports/render.mp4. The same calls the collaborator makes.
 */
export default function PreviewCaptureActions({
  cruxId,
  base,
  page,
}: {
  cruxId: string;
  base: string;
  page: string;
}) {
  const refreshArtifacts = useCruxStore((s) => s.refreshArtifacts);
  const [busy, setBusy] = useState<'shot' | 'video' | null>(null);
  const [progress, setProgress] = useState<string>('');
  useEffect(
    () =>
      onNativeProgress((e) => {
        if (e.cruxId !== cruxId) return;
        setProgress(
          e.tool === 'record' ? `${e.frames ?? 0} frames` : `${Math.round(e.progress * 100)}%`,
        );
      }),
    [cruxId],
  );
  if (!nativeToolsAvailable()) return null;
  // `base` may already be the entry page; a relative page resolves beside it.
  const pageUrl = () => new URL(page, base);

  const shot = async () => {
    setBusy('shot');
    try {
      const blob = await captureLocalPreview(pageUrl().href);
      await getServices().artifact.upload({
        resourceId: cruxId,
        resourceType: 'crux',
        blob,
        mimeType: 'image/jpeg',
        meta: { path: 'exports/preview.jpg' },
      });
      await refreshArtifacts();
    } catch (err) {
      await confirmDialog({
        title: 'Screenshot failed',
        message: (err as Error).message,
        confirmLabel: 'OK',
      });
    } finally {
      setBusy(null);
    }
  };

  const video = async () => {
    const ok = await confirmDialog({
      title: 'Export as video',
      message:
        'Records the preview at 30 fps until the page says it is done (or 60 seconds), then writes exports/render.mp4. The frames stay beside it.',
      confirmLabel: 'Export',
    });
    if (!ok) return;
    setBusy('video');
    setProgress('');
    try {
      const url = pageUrl();
      url.searchParams.set('auto', '1');
      await renderVideo(cruxId, url.href);
      await refreshArtifacts();
    } catch (err) {
      await confirmDialog({
        title: 'Export failed',
        message: (err as Error).message,
        confirmLabel: 'OK',
      });
    } finally {
      setBusy(null);
      setProgress('');
    }
  };

  const cls =
    'shrink-0 px-1.5 py-0.5 rounded-[var(--radius-sm)] hover:text-text hover:bg-surface-solid transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';
  return (
    <>
      <button
        type="button"
        onClick={() => void shot()}
        disabled={busy !== null}
        className={cls}
        title="Save a screenshot of this page to exports/preview.jpg"
        data-testid="preview-screenshot"
      >
        {busy === 'shot' ? 'Saving…' : 'Screenshot'}
      </button>
      <button
        type="button"
        onClick={() => void video()}
        disabled={busy !== null}
        className={cls}
        title="Record this page and write exports/render.mp4"
        data-testid="preview-export-video"
      >
        {busy === 'video' ? `Recording… ${progress}` : 'Export video'}
      </button>
    </>
  );
}
