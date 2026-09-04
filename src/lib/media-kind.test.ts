import { describe, it, expect } from 'vitest';
import { mediaKindFor, isStreamingReady, mediaFileName } from './media-kind';

describe('media kind', () => {
  it('classifies by mime, then by extension', () => {
    expect(mediaKindFor('audio/wav', 'x.wav')).toBe('audio');
    expect(mediaKindFor('video/quicktime', 'x.mov')).toBe('video');
    expect(mediaKindFor('', 'song.FLAC')).toBe('audio');
    expect(mediaKindFor('', 'clip.mkv')).toBe('video');
    expect(mediaKindFor('image/png', 'x.png')).toBeNull();
  });
  it('knows what needs transcoding', () => {
    expect(isStreamingReady('video/mp4')).toBe(true);
    expect(isStreamingReady('audio/mpeg')).toBe(true);
    expect(isStreamingReady('video/quicktime', 'x.mov')).toBe(false);
    expect(isStreamingReady('audio/wav', 'x.wav')).toBe(false);
    expect(isStreamingReady('', 'x.m4a')).toBe(true);
  });
  it('makes URL-safe filenames', () => {
    expect(mediaFileName('My Song (final) v2.wav')).toBe('My-Song-final-v2.wav');
  });
});
