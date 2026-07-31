import { describe, it, expect } from 'vitest';
import { guessMimeType, isImageMime, isBinaryMime, isTextMime, isVideoMime } from './mime';

describe('mime', () => {
  it('guesses common types by extension', () => {
    expect(guessMimeType('index.html')).toBe('text/html');
    expect(guessMimeType('a/b/style.CSS')).toBe('text/css');
    expect(guessMimeType('photo.jpeg')).toBe('image/jpeg');
    expect(guessMimeType('src/pages/index.astro')).toBe('text/plain');
    expect(guessMimeType('unknown.zzz')).toBe('application/octet-stream');
  });

  it('classifies images including svg', () => {
    expect(isImageMime('image/png')).toBe(true);
    expect(isImageMime('image/svg+xml')).toBe(true);
    expect(isImageMime('video/mp4')).toBe(false);
  });

  it('binary and text are complements over the prefix rules', () => {
    expect(isBinaryMime('image/png')).toBe(true);
    expect(isBinaryMime('application/pdf')).toBe(true);
    expect(isBinaryMime('text/html')).toBe(false);
    expect(isBinaryMime('application/json')).toBe(false);
    expect(isBinaryMime('application/javascript')).toBe(false);
    expect(isBinaryMime('image/svg+xml')).toBe(false);
    expect(isBinaryMime('application/xml')).toBe(false);
  });

  it('isTextMime falls back to extension and dotfile names', () => {
    expect(isTextMime('application/octet-stream', 'notes.md')).toBe(true);
    expect(isTextMime('application/octet-stream', 'src/Dockerfile')).toBe(true);
    expect(isTextMime('application/octet-stream', 'photo.png')).toBe(false);
  });

  it('classifies video by prefix', () => {
    expect(isVideoMime('video/webm')).toBe(true);
    expect(isVideoMime('audio/mpeg')).toBe(false);
  });
});
