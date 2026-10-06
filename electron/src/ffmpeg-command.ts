import * as path from 'node:path';
import { mediaPath, nativeArguments } from './media-paths';

// Contents, not extensions, choose the input demuxer. Playlists and scripting
// formats (concat, HLS, DASH, lavfi, SVG, …) must never be available to sniffing.
const formats =
  'mov,matroska,avi,wav,aiff,mp3,aac,flac,ogg,gif,image2,png_pipe,jpeg_pipe,webp_pipe,bmp_pipe,tiff_pipe,ppm_pipe';
// FFmpeg checks decoder implementation names here (for example mp3float).
const codecs =
  'h264,hevc,vp8,vp9,av1,libaom-av1,mpeg4,mpeg2video,mjpeg,png,webp,tiff,bmp,gif,ppm,pgm,pbm,pam,aac,mp3,mp3float,flac,opus,vorbis,pcm_s16le,pcm_s24le,pcm_s32le,pcm_f32le,pcm_f64le,pcm_s16be,pcm_s24be,pcm_s32be,alac';
const inputPolicy = [
  '-protocol_whitelist',
  'file',
  '-format_whitelist',
  formats,
  '-codec_whitelist',
  codecs,
];
const muxers: Record<string, string> = {
  mp4: 'mp4',
  m4v: 'mp4',
  m4a: 'ipod',
  mov: 'mov',
  webm: 'webm',
  mkv: 'matroska',
  avi: 'avi',
  wav: 'wav',
  aif: 'aiff',
  aiff: 'aiff',
  mp3: 'mp3',
  aac: 'adts',
  flac: 'flac',
  ogg: 'ogg',
  oga: 'ogg',
  opus: 'opus',
  gif: 'gif',
  png: 'image2',
  jpg: 'image2',
  jpeg: 'image2',
  webp: 'webp',
  bmp: 'image2',
  tif: 'image2',
  tiff: 'image2',
  avif: 'avif',
};
const switches = new Set(['-y', '-n', '-an', '-vn', '-sn', '-dn', '-shortest']);
const choices: Record<string, string[]> = {
  '-c:v': [
    'copy',
    'libx264',
    'libx265',
    'libvpx',
    'libvpx-vp9',
    'libaom-av1',
    'mpeg4',
    'png',
    'mjpeg',
    'gif',
    'libwebp',
  ],
  '-c:a': [
    'copy',
    'aac',
    'libmp3lame',
    'libopus',
    'libvorbis',
    'flac',
    'pcm_s16le',
    'pcm_s24le',
    'pcm_f32le',
  ],
  '-preset': ['fast'],
  '-profile:v': ['baseline', 'main', 'high'],
  '-pix_fmt': ['yuv420p', 'yuv422p', 'yuv444p', 'rgb24', 'rgba', 'gray'],
  '-movflags': ['+faststart', 'faststart'],
  '-loglevel': ['quiet', 'error', 'warning', 'info'],
};
const numbers: Record<string, [number, number]> = {
  '-crf': [0, 63],
  '-q:v': [0, 100],
  '-q:a': [0, 10],
  '-quality': [0, 100],
  '-ac': [1, 8],
  '-frames:v': [1, 100_000],
  '-framerate': [0.01, 240],
  '-r': [0.01, 240],
  '-start_number': [0, 100_000],
};

/** Recipe grammar, not a general filtergraph parser. Some FFmpeg filter options
 * load files even within harmless filters (`scale=/w=/path`). Keep literals and
 * numeric expressions explicit so adding a recipe means reviewing its effects. */
export function allowedMediaFilter(filter: string, audio: boolean): boolean {
  if (audio)
    return /^loudnorm=I=-(?:[5-9]|[1-6]\d|70)(?:\.\d+)?:TP=-?[0-9](?:\.\d+)?:LRA=(?:[1-9]|[12]\d|30)$/.test(
      filter,
    );
  if (
    filter === 'fps=12,scale=640:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse' ||
    filter === 'fps=12,scale=480:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse' ||
    filter === 'scale=512:512:force_original_aspect_ratio=increase,crop=512:512' ||
    filter === 'format=gray' ||
    filter === "select='not(mod(n\\,60))',scale=480:-1,tile=3x3"
  )
    return true;
  return filter.split(',').every((part) => {
    if (/^fps=\d{1,3}(?:\.\d{1,3})?$/.test(part))
      return Number(part.slice(4)) > 0 && Number(part.slice(4)) <= 240;
    const scale =
      /^scale=(-?[0-9]{1,5}):(-?[0-9]{1,5})(?::flags=(?:lanczos|bicubic|bilinear))?$/.exec(part);
    return (
      !!scale && [Number(scale[1]), Number(scale[2])].every((n) => n >= -2 && n <= 8192 && n !== 0)
    );
  });
}

function optionValue(option: string, value: string): boolean {
  if (option === '-fs') return /^[1-9]\d{0,8}$/.test(value) && Number(value) <= 500 * 1024 * 1024;
  if (choices[option]) return choices[option].includes(value);
  if (numbers[option]) {
    const [min, max] = numbers[option];
    return /^\d+(?:\.\d+)?$/.test(value) && Number(value) >= min && Number(value) <= max;
  }
  if (option === '-b:v' || option === '-b:a') return /^(?:0|[1-9]\d{0,5}[kKmM]?)$/.test(value);
  if (['-ss', '-t', '-to'].includes(option))
    return /^(?:\d{1,5}(?:\.\d{1,6})?|\d{1,2}:[0-5]\d:[0-5]\d(?:\.\d{1,6})?)$/.test(value);
  if (option === '-map') return /^\d{1,2}:(?:v|a)(?::\d{1,2})?\??$/.test(value);
  if (option === '-vf' || option === '-af') return allowedMediaFilter(value, option === '-af');
  return false;
}

export function planFfmpegRun(
  folder: string,
  input: unknown,
): { args: string[]; outputs: string[] } {
  const raw = nativeArguments(input);
  if (raw.length === 1 && raw[0] === '-version') return { args: raw, outputs: [] };
  const args = ['-nostdin', '-hide_banner'];
  let inputs = 0;
  let glob = false;
  let output: string | undefined;
  for (let i = 0; i < raw.length; i++) {
    const arg = raw[i]!;
    if (arg === '-i') {
      const value = raw[++i];
      if (!value || ++inputs > 8) throw new Error('Choose one to eight local media inputs.');
      args.push(...inputPolicy, '-i', mediaPath(folder, value, 'input', glob));
      glob = false;
    } else if (arg === '-pattern_type') {
      if (glob || raw[++i] !== 'glob') throw new Error('Only an image glob is supported.');
      glob = true;
      args.push('-pattern_type', 'glob');
    } else if (switches.has(arg)) args.push(arg);
    else if (arg.startsWith('-')) {
      const value = raw[++i];
      if (!value || !optionValue(arg, value))
        throw new Error(`Unsupported FFmpeg option or value: ${arg}`);
      args.push(arg, value);
    } else {
      if (i !== raw.length - 1 || output) throw new Error('Choose one final media output.');
      output = mediaPath(folder, arg, 'output');
      const format = muxers[path.extname(output).slice(1).toLowerCase()];
      if (!format || (output.includes('%') && format !== 'image2'))
        throw new Error('Choose a supported media output format.');
      args.push('-protocol_whitelist', 'file', '-f', format, output);
    }
  }
  if (!inputs || !output || glob) throw new Error('Choose local media input and output files.');
  return { args, outputs: [output] };
}

export function planFfprobeRun(
  folder: string,
  input: unknown,
): { args: string[]; outputs: string[] } {
  const raw = nativeArguments(input);
  const args = ['-hide_banner', ...inputPolicy];
  let source = '';
  for (let i = 0; i < raw.length; i++) {
    const arg = raw[i]!;
    if (['-show_format', '-show_streams'].includes(arg)) args.push(arg);
    else if (arg === '-v' && raw[i + 1] === 'error') {
      args.push(arg, raw[++i]!);
    } else if (['-print_format', '-of'].includes(arg) && raw[i + 1] === 'json') {
      args.push(arg, raw[++i]!);
    } else if (!arg.startsWith('-') && i === raw.length - 1)
      source = mediaPath(folder, arg, 'input');
    else throw new Error(`Unsupported ffprobe option: ${arg}`);
  }
  if (!source || source.includes('%')) throw new Error('Choose one local file to inspect.');
  return { args: [...args, source], outputs: [] };
}
