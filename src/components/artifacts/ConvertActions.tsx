import { useEffect, useMemo, useState } from 'react';
import type { Artifact } from '@/api/types';
import { basename, parentPath, pathOf } from '@/lib/artifact-path';
import {
  mediaTools,
  nativeToolsAvailable,
  onNativeProgress,
  runMediaTool,
  type MediaToolInfo,
  type MediaToolName,
} from '@/services/native-tools';
import { useCruxStore } from '@/stores/cruxStore';
import { cn } from '@/lib/cn';

/**
 * Contextual conversion (Daniel, 2026-09-21: "you drop or insert files into
 * the workspace and it brings up a tool that lets you convert them, media
 * contextual — if you upload a video or audio it might offer to transcode
 * them for streaming … whereas a doc might be converting to another format").
 *
 * What the selected Artifact *is* decides what is offered: a video offers a
 * streaming version, a still, a GIF; audio offers a streaming version and an
 * evened-out one; a picture offers web-ready sizes; a document offers the
 * other formats it can become. Each button is the same call the collaborator
 * makes (`run_ffmpeg`, `run_magick`, `run_pandoc`); the output lands beside
 * the source, never over it, and reaches Artifacts through the watcher. An
 * offer whose tool this machine lacks says so instead of failing halfway.
 */
const VIDEO = /\.(webm|mov|mkv|avi|m4v|mp4|gif)$/i;
const AUDIO = /\.(wav|aiff?|flac|ogg|oga|opus|m4a|mp3|aac)$/i;
const IMAGE = /\.(png|jpe?g|webp|gif|bmp|tiff?|avif|heic)$/i;
const DOC = /\.(md|markdown|docx|odt|rtf|html?|tex|epub|rst|org|txt)$/i;

interface Action {
  label: string;
  title: string;
  tool: MediaToolName;
  args: (path: string) => string[];
}

const stem = (path: string): string => path.replace(/\.[^.]+$/, '');
const ext = (path: string): string => (path.match(/\.[^.]+$/)?.[0] ?? '').toLowerCase();

/** What this file could become, in the order a person would want it. */
// eslint-disable-next-line react-refresh/only-export-components
export function actionsFor(path: string): Action[] {
  const out: Action[] = [];
  if (VIDEO.test(path)) {
    out.push({
      label: 'For streaming',
      title: 'H.264 720p with the index at the front, so it plays while it downloads',
      tool: 'ffmpeg',
      args: (p) => [
        '-y',
        '-i',
        p,
        '-vf',
        'scale=-2:720',
        '-c:v',
        'libx264',
        '-profile:v',
        'high',
        '-pix_fmt',
        'yuv420p',
        '-crf',
        '23',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-movflags',
        '+faststart',
        `${stem(p)}-web.mp4`,
      ],
    });
    if (!/\.mp4$/i.test(path))
      out.push({
        label: 'To MP4',
        title: 'H.264 MP4 at full size, plays anywhere',
        tool: 'ffmpeg',
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
    if (!/\.webm$/i.test(path))
      out.push({
        label: 'To WebM',
        title: 'VP9 WebM, smaller for the web',
        tool: 'ffmpeg',
        args: (p) => [
          '-y',
          '-i',
          p,
          '-c:v',
          'libvpx-vp9',
          '-crf',
          '32',
          '-b:v',
          '0',
          `${stem(p)}.webm`,
        ],
      });
    if (!/\.gif$/i.test(path))
      out.push({
        label: 'To GIF',
        title: 'A 12 fps GIF, 640 px wide, with its own palette',
        tool: 'ffmpeg',
        args: (p) => [
          '-y',
          '-i',
          p,
          '-vf',
          'fps=12,scale=640:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse',
          `${stem(p)}.gif`,
        ],
      });
    out.push({
      label: 'Poster',
      title: 'A still from one second in',
      tool: 'ffmpeg',
      args: (p) => [
        '-y',
        '-i',
        p,
        '-ss',
        '00:00:01',
        '-frames:v',
        '1',
        '-q:v',
        '3',
        `${stem(p)}-poster.jpg`,
      ],
    });
    out.push({
      label: 'Frames',
      title: 'One PNG per second into a frames folder beside the file',
      tool: 'ffmpeg',
      args: (p) => ['-y', '-i', p, '-vf', 'fps=1', `${stem(p)}-frames/f%04d.png`],
    });
    out.push({
      label: 'Contact sheet',
      title: 'A 3×3 sheet of frames',
      tool: 'ffmpeg',
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
    out.push({
      label: 'Take the audio out',
      title: 'The sound on its own, as AAC',
      tool: 'ffmpeg',
      args: (p) => ['-y', '-i', p, '-vn', '-c:a', 'aac', '-b:a', '192k', `${stem(p)}.m4a`],
    });
    return out;
  }

  if (AUDIO.test(path)) {
    out.push({
      label: 'For streaming',
      title: 'AAC at 128k with the index at the front',
      tool: 'ffmpeg',
      args: (p) => [
        '-y',
        '-i',
        p,
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-movflags',
        '+faststart',
        `${stem(p)}-web.m4a`,
      ],
    });
    if (!/\.mp3$/i.test(path))
      out.push({
        label: 'To MP3',
        title: 'MP3, for anything that will not take AAC',
        tool: 'ffmpeg',
        args: (p) => ['-y', '-i', p, '-c:a', 'libmp3lame', '-q:a', '2', `${stem(p)}.mp3`],
      });
    if (!/\.wav$/i.test(path))
      out.push({
        label: 'To WAV',
        title: 'Uncompressed, for editing',
        tool: 'ffmpeg',
        args: (p) => ['-y', '-i', p, '-c:a', 'pcm_s16le', `${stem(p)}.wav`],
      });
    out.push({
      label: 'Even out the loudness',
      title: 'Broadcast loudness (−16 LUFS), so tracks sit together',
      tool: 'ffmpeg',
      args: (p) => [
        '-y',
        '-i',
        p,
        '-af',
        'loudnorm=I=-16:TP=-1.5:LRA=11',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        `${stem(p)}-level.m4a`,
      ],
    });
    return out;
  }

  if (IMAGE.test(path)) {
    out.push({
      label: 'Web ready',
      title: '1600 px wide WebP, the size a page actually needs',
      tool: 'magick',
      args: (p) => [p, '-resize', '1600x>', '-quality', '82', `${stem(p)}-web.webp`],
    });
    if (!/\.jpe?g$/i.test(path))
      out.push({
        label: 'To JPEG',
        title: 'JPEG at quality 85, on white where the source was transparent',
        tool: 'magick',
        args: (p) => [
          p,
          '-background',
          'white',
          '-alpha',
          'remove',
          '-alpha',
          'off',
          '-quality',
          '85',
          `${stem(p)}.jpg`,
        ],
      });
    if (!/\.png$/i.test(path))
      out.push({
        label: 'To PNG',
        title: 'PNG, keeping transparency',
        tool: 'magick',
        args: (p) => [p, `${stem(p)}.png`],
      });
    out.push({
      label: 'Thumbnail',
      title: 'A 512 px square, cropped from the middle',
      tool: 'magick',
      args: (p) => [
        p,
        '-resize',
        '512x512^',
        '-gravity',
        'center',
        '-extent',
        '512x512',
        '-quality',
        '85',
        `${stem(p)}-thumb.jpg`,
      ],
    });
    out.push({
      label: 'Favicon',
      title: 'An .ico carrying four sizes',
      tool: 'magick',
      args: (p) => [p, '-define', 'icon:auto-resize=16,32,48,64', `${stem(p)}.ico`],
    });
    const folder = parentPath(path) ?? '';
    const sourceExt = ext(path);
    out.push({
      label: 'Folder to video',
      title: `Every ${sourceExt} in this folder, in name order, at 30 fps`,
      tool: 'ffmpeg',
      args: () => [
        '-y',
        '-framerate',
        '30',
        '-pattern_type',
        'glob',
        '-i',
        `${folder ? folder + '/' : ''}*${sourceExt}`,
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        `exports/${basename(folder || 'frames')}.mp4`,
      ],
    });
    return out;
  }

  if (DOC.test(path)) {
    const targets: [string, string, string][] = [
      ['.md', 'To Markdown', 'Plain Markdown, the format the rest of the Crux reads'],
      ['.docx', 'To Word', 'A .docx anyone can open'],
      ['.html', 'To HTML', 'A standalone page'],
      ['.epub', 'To EPUB', 'A book file for a reader'],
      ['.pdf', 'To PDF', 'Needs a LaTeX engine on this machine'],
      ['.txt', 'To plain text', 'Everything, without the markup'],
    ];
    for (const [target, label, title] of targets) {
      if (ext(path) === target) continue;
      out.push({
        label,
        title,
        tool: 'pandoc',
        args: (p) =>
          target === '.html' || target === '.epub'
            ? [p, '--standalone', '-o', `${stem(p)}${target}`]
            : [p, '-o', `${stem(p)}${target}`],
      });
    }
    return out;
  }
  return out;
}

const TOOL_NAMES: Record<MediaToolName, string> = {
  ffmpeg: 'FFmpeg',
  ffprobe: 'ffprobe',
  magick: 'ImageMagick',
  pandoc: 'Pandoc',
  typst: 'Typst',
};
const INSTALL: Partial<Record<MediaToolName, string>> = {
  magick: 'brew install imagemagick',
  pandoc: 'brew install pandoc',
};

export default function ConvertActions({ artifact }: { artifact: Artifact }) {
  const cruxId = useCruxStore((s) => s.crux?.id);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const [tools, setTools] = useState<MediaToolInfo[] | null>(null);
  useEffect(
    () => onNativeProgress((e) => e.cruxId === cruxId && setProgress(e.progress)),
    [cruxId],
  );
  useEffect(() => {
    let live = true;
    void mediaTools().then((t) => live && setTools(t));
    return () => {
      live = false;
    };
  }, []);
  const path = pathOf(artifact);
  const actions = useMemo(() => actionsFor(path), [path]);
  if (!nativeToolsAvailable() || !cruxId || actions.length === 0) return null;

  const has = (tool: MediaToolName) => !tools || tools.some((t) => t.tool === tool && !!t.path); // before the probe answers, offer them

  const run = async (a: Action) => {
    if (!has(a.tool)) {
      const install = INSTALL[a.tool];
      setNote(`${TOOL_NAMES[a.tool]} is not on this machine${install ? ` — ${install}` : ''}.`);
      return;
    }
    setBusy(a.label);
    setProgress(0);
    setNote(null);
    try {
      const r = await runMediaTool(cruxId, a.tool, a.args(path));
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
            title={has(a.tool) ? a.title : `${a.title} — needs ${TOOL_NAMES[a.tool]}`}
            disabled={busy !== null}
            onClick={() => void run(a)}
            className={cn(
              'px-2 py-0.5 text-xxs font-mono rounded-[var(--radius-sm)] border border-border',
              has(a.tool) ? 'text-text-muted' : 'text-text-muted/50 border-dashed',
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
