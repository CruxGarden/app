/** What a media file is, from its MIME type (or extension when the browser gives none). */
export type MediaKind = 'audio' | 'video' | null;

const AUDIO_EXT = /\.(mp3|wav|ogg|oga|flac|aac|m4a|aiff?|wma|opus)$/i;
const VIDEO_EXT = /\.(mp4|m4v|mov|webm|avi|mkv|mpe?g|ogv|3gp|wmv)$/i;

export function mediaKindFor(mime: string, name = ''): MediaKind {
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  if (AUDIO_EXT.test(name)) return 'audio';
  if (VIDEO_EXT.test(name)) return 'video';
  return null;
}

/** Browsers play these everywhere; anything else goes through ffmpeg first. */
const STREAMING_READY = new Set([
  'video/mp4',
  'video/webm',
  'audio/mp4',
  'audio/webm',
  'audio/aac',
  'audio/mpeg',
]);

export function isStreamingReady(mime: string, name = ''): boolean {
  if (STREAMING_READY.has(mime)) return true;
  return /\.(mp4|m4v|webm|m4a|aac|mp3)$/i.test(name);
}

/** A safe public filename: spaces → dashes, odd characters dropped. */
export function mediaFileName(name: string): string {
  return name
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9._-]/g, '')
    .replace(/-+/g, '-');
}
