/**
 * Media transcoding (ffmpeg in the Electron main process) — renderer side.
 * The one consumer module for the ffmpeg bridge namespace; components gate on
 * Capability.Transcode and never touch window.electronAPI directly.
 */

import { Capability, can, type FfmpegBridge, type TranscodeOutput } from '@/lib/platform';

function ffmpegBridge(): FfmpegBridge | null {
  if (!can(Capability.Transcode)) return null;
  return window.electronAPI?.ffmpeg ?? null;
}

export type { TranscodeOutput };

export interface TranscodeInput {
  inputData: Uint8Array;
  inputName: string;
  isAudio: boolean;
}

/** Transcode media to streaming-ready outputs. Throws off-desktop — gate with Capability.Transcode. */
export async function transcode(
  input: TranscodeInput,
  onProgress?: (progress: number) => void,
): Promise<TranscodeOutput[]> {
  const api = ffmpegBridge();
  if (!api) throw new Error('Transcoding is not available on this platform');
  const unsubscribe = onProgress ? api.onProgress(onProgress) : null;
  try {
    return await api.transcode(input);
  } finally {
    unsubscribe?.();
  }
}
