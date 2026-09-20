import { useEffect, useState } from 'react';
import type { Artifact } from '@/api/types';
import { basename, parentPath, pathOf } from '@/lib/artifact-path';
import { nativeToolsAvailable, onNativeProgress, runFfmpeg } from '@/services/native-tools';
import { useCruxStore } from '@/stores/cruxStore';
import { cn } from '@/lib/cn';

/**
 * The person's half of the first native tool (MAKING-THE-AD-PARITY gap 13,
 * step 1): what the bundled ffmpeg can do with the selected Artifact, as
 * buttons in the Artifacts pane's file info. Each is the same call the
 * collaborator makes with `run_ffmpeg`; the output lands beside the source
 * (never over it) and reaches Artifacts through the watcher.
 */
const VIDEO = /\.(webm|mov|mkv|avi|m4v|mp4|gif)$/i;
const AUDIO = /\.(wav|aiff?|flac|ogg|oga|m4a|mp3)$/i;
const IMAGE = /\.(png|jpe?g|webp)$/i;

interface Action {
  label: string;
  title: string;
  args: (path: string) => string[];
}

function stem(path: string): string {
  return path.replace(/\.[^.]+$/, '');
}

function actionsFor(path: string): Action[] {
  if (VIDEO.test(path)) {
    const out: Action[] = [];
    if (!/\.mp4$/i.test(path))
      out.push({
        label: 'To MP4',
        title: 'H.264 MP4 that plays anywhere',
        args: (p) => [
          '-y',
          '-i',
          p,
          '-c:v',
          'libx264',
          '-pix_fmt',
          'yuv420p',
          '-crf',
          '20',
          '-movflags',
          '+faststart',
          `${stem(p)}.mp4`,
        ],
      });
    if (!/\.gif$/i.test(path))
      out.push({
        label: 'To GIF',
        title: 'A 12 fps GIF, 640 px wide',
        args: (p) => ['-y', '-i', p, '-vf', 'fps=12,scale=640:-1', `${stem(p)}.gif`],
      });
    out.push({
      label: 'Frames',
      title: 'One PNG per second into a frames folder beside the file',
      args: (p) => ['-y', '-i', p, '-vf', 'fps=1', `${stem(p)}-frames/f%04d.png`],
    });
    out.push({
      label: 'Contact sheet',
      title: 'A 3×3 sheet of frames',
      args: (p) => [
        '-y',
        '-i',
        p,
        '-vf',
        "select='not(mod(n\\,60))',scale=480:-1,tile=3x3",
        '-frames:v',
        '1',
        `${stem(p)}-sheet.png`,
      ],
    });
    return out;
  }
  if (AUDIO.test(path)) {
    return [
      {
        label: 'To M4A',
        title: 'AAC audio',
        args: (p) => ['-y', '-i', p, '-c:a', 'aac', '-b:a', '192k', `${stem(p)}.m4a`],
      },
      {
        label: 'To MP3',
        title: 'MP3 audio',
        args: (p) => ['-y', '-i', p, '-c:a', 'libmp3lame', '-q:a', '2', `${stem(p)}.mp3`],
      },
    ];
  }
  if (IMAGE.test(path)) {
    const folder = parentPath(path) ?? '';
    const ext = path.slice(path.lastIndexOf('.'));
    const outName = `${basename(folder || 'frames')}.mp4`;
    return [
      {
        label: 'Folder to video',
        title: `Every ${ext} in this folder, in name order, at 30 fps`,
        args: () => [
          '-y',
          '-framerate',
          '30',
          '-pattern_type',
          'glob',
          '-i',
          `${folder ? folder + '/' : ''}*${ext}`,
          '-c:v',
          'libx264',
          '-pix_fmt',
          'yuv420p',
          `exports/${outName}`,
        ],
      },
    ];
  }
  return [];
}

export default function ConvertActions({ artifact }: { artifact: Artifact }) {
  const cruxId = useCruxStore((s) => s.crux?.id);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  useEffect(
    () => onNativeProgress((e) => e.cruxId === cruxId && setProgress(e.progress)),
    [cruxId],
  );
  if (!nativeToolsAvailable() || !cruxId) return null;
  const path = pathOf(artifact);
  const actions = actionsFor(path);
  if (actions.length === 0) return null;

  const run = async (a: Action) => {
    setBusy(a.label);
    setProgress(0);
    setNote(null);
    try {
      const r = await runFfmpeg(cruxId, a.args(path));
      setNote(
        r.code === 0
          ? `Done in ${(r.ms / 1000).toFixed(1)}s.`
          : (r.stderrTail.trim().split('\n').at(-1) ?? 'Failed.'),
      );
    } catch (err) {
      setNote((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-1" data-testid="convert-actions">
      <span className="text-2xs font-mono uppercase tracking-wider text-text-muted">Convert</span>
      <div className="flex flex-wrap gap-1">
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            title={a.title}
            disabled={busy !== null}
            onClick={() => void run(a)}
            className={cn(
              'px-2 py-0.5 text-xxs font-mono rounded-[var(--radius-sm)] border border-border text-text-muted',
              'hover:text-text hover:border-accent/50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            {busy === a.label ? `${a.label}… ${Math.round(progress * 100)}%` : a.label}
          </button>
        ))}
      </div>
      {note && (
        <span role="status" className="text-xxs text-text-muted break-words">
          {note}
        </span>
      )}
    </div>
  );
}
