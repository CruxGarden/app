import { mkdtemp, writeFile, stat, readFile, rm } from 'node:fs/promises';
import * as path from 'node:path';
import { MAX_TRANSCODE_BYTES, type TranscodeRequest, type TranscodeOutput } from './bridge';
import { planFfmpegRun } from './ffmpeg-command';
import { runNativeProcess } from './native-process';

const active = new Set<string>();
let activeBytes = 0;

/** Imports own private scratch files. Nothing is published until conversion succeeds.
 * The two-job/aggregate-input budget bounds admitted work, not IPC's earlier copies.
 */
export async function transcodeMedia(
  binary: string,
  tempRoot: string,
  input: TranscodeRequest,
  onProgress?: (progress: number) => void,
  limits = { outputBytes: MAX_TRANSCODE_BYTES, timeoutMs: 10 * 60_000 },
): Promise<TranscodeOutput[]> {
  if (
    !input ||
    typeof input.requestId !== 'string' ||
    !/^[a-zA-Z0-9-]{1,64}$/.test(input.requestId)
  )
    throw new Error('Give this conversion a unique request ID.');
  if (
    !(input.inputData instanceof Uint8Array) ||
    !input.inputData.byteLength ||
    input.inputData.byteLength > MAX_TRANSCODE_BYTES
  )
    throw new Error('Choose a nonempty media file of at most 500 MiB.');
  if (
    typeof input.inputName !== 'string' ||
    !input.inputName ||
    input.inputName.length > 255 ||
    Array.from(input.inputName).some((character) => character.charCodeAt(0) < 32) ||
    typeof input.isAudio !== 'boolean'
  )
    throw new Error('Choose a media filename and conversion type.');
  if (
    !Number.isSafeInteger(limits.outputBytes) ||
    limits.outputBytes < 1 ||
    limits.outputBytes > MAX_TRANSCODE_BYTES
  )
    throw new Error('Choose an output limit of at most 500 MiB.');
  if (active.has(input.requestId)) throw new Error('This conversion is already running.');
  if (active.size >= 2 || activeBytes + input.inputData.byteLength > MAX_TRANSCODE_BYTES)
    throw new Error('Media conversion is busy. Wait for an import to finish, then try again.');

  const bytes = input.inputData.byteLength;
  active.add(input.requestId);
  activeBytes += bytes;
  let directory: string | undefined;
  try {
    directory = await mkdtemp(path.join(tempRoot, 'crux-transcode-'));
    // The caller's filename never selects a host path or input format.
    await writeFile(path.join(directory, 'input'), input.inputData);
    const extension = input.isAudio ? '.m4a' : '.mp4';
    const output = 'output' + extension;
    const recipe = input.isAudio
      ? ['-vn', '-c:a', 'aac', '-b:a', '192k']
      : [
          '-c:v',
          'libx264',
          '-preset',
          'fast',
          '-crf',
          '28',
          '-c:a',
          'aac',
          '-b:a',
          '128k',
          '-movflags',
          '+faststart',
        ];
    const plan = planFfmpegRun(directory, [
      '-i',
      'input',
      ...recipe,
      '-fs',
      String(limits.outputBytes),
      '-y',
      output,
    ]);
    const result = await runNativeProcess(binary, plan.args, {
      cwd: directory,
      timeoutMs: limits.timeoutMs,
      onProgress,
    });
    if (result.code !== 0) throw new Error(`Media conversion failed: ${result.stderrTail}`);
    const file = path.join(directory, output);
    const info = await stat(file);
    // FFmpeg can exit successfully on -fs truncation. Never import that partial file.
    if (!info.size || info.size >= limits.outputBytes)
      throw new Error('Converted media reached its output size limit. Choose a smaller source.');
    const basename = path.posix.basename(input.inputName.replace(/\\/g, '/'));
    const name =
      path
        .parse(basename)
        .name.replace(/[<>:"/\\|?*]/g, '-')
        .replace(/[. ]+$/, '') || 'media';
    return [
      {
        name: name + extension,
        data: new Uint8Array(await readFile(file)),
        mimeType: input.isAudio ? 'audio/mp4' : 'video/mp4',
      },
    ];
  } finally {
    try {
      if (directory) await rm(directory, { recursive: true, force: true });
    } finally {
      active.delete(input.requestId);
      activeBytes -= bytes;
    }
  }
}
