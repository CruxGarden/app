import { useEffect, useRef, useState } from 'react';
import { Plasma } from '@cruxgarden/plasma-ui';

/**
 * The teaser's track. Streamed, never autoplayed, and never fetched until
 * someone asks for it: the file is ~32MB, so preload="none" is the whole
 * difference between a page that costs nothing to open and one that does not.
 *
 * Play/pause resumes where it left off; stop rewinds. Volume is remembered
 * per browser, because being handed the same loud surprise on every visit is
 * the thing people mind about music on a page.
 *
 * Its own surface under the panel, and draggable anywhere. It fuses: it sits
 * inside the provider's blend distance, so the two bulge toward each other
 * without joining, and dragging it against the panel merges them properly.
 */
const TRACK_SRC = 'https://s3.us-east-1.amazonaws.com/publish.crux.garden/sagittarius-a-star.m4a';
/** Not shown - it names the controls for anyone using a screen reader. */
const TRACK_NAME = 'Sagittarius A*';
const VOLUME_KEY = 'crux-garden-volume';

const DEFAULT_VOLUME = 0.6;

function storedVolume(): number {
  try {
    // Number(null) is 0, which passes a 0..1 range check - so an absent key
    // has to be caught before the parse, or a first visit plays silently.
    const raw = localStorage.getItem(VOLUME_KEY);
    if (raw === null) return DEFAULT_VOLUME;
    const v = Number(raw);
    return Number.isFinite(v) && v >= 0 && v <= 1 ? v : DEFAULT_VOLUME;
  } catch {
    return DEFAULT_VOLUME;
  }
}

export default function TeaserTrack() {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [volume, setVolume] = useState(storedVolume);
  const [failed, setFailed] = useState(false);

  // The element is the source of truth: it also pauses for reasons of its own
  // (another tab taking audio focus, the track ending).
  useEffect(() => {
    const el = audio.current;
    if (!el) return;
    const sync = () => setPlaying(!el.paused && !el.ended);
    const onError = () => {
      setFailed(true);
      setPlaying(false);
    };
    el.addEventListener('play', sync);
    el.addEventListener('pause', sync);
    el.addEventListener('ended', sync);
    el.addEventListener('error', onError);
    return () => {
      el.removeEventListener('play', sync);
      el.removeEventListener('pause', sync);
      el.removeEventListener('ended', sync);
      el.removeEventListener('error', onError);
    };
  }, []);

  useEffect(() => {
    if (audio.current) audio.current.volume = volume;
  }, [volume]);

  // Leaving the page silences the track; coming back resumes it, but only if
  // this is what paused it. A track the person paused themselves stays paused.
  useEffect(() => {
    const el = audio.current;
    if (!el) return;
    let pausedByUs = false;
    const away = () => {
      if (el.paused) return;
      pausedByUs = true;
      el.pause();
    };
    const back = () => {
      if (!pausedByUs) return;
      pausedByUs = false;
      if (document.visibilityState !== 'visible') return;
      void el.play().catch(() => setPlaying(false));
    };
    const onVisibility = () => (document.hidden ? away() : back());
    document.addEventListener('visibilitychange', onVisibility);
    // Switching apps or windows does not always change visibility, so listen
    // for focus too; `back` is idempotent when both fire.
    addEventListener('blur', away);
    addEventListener('focus', back);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      removeEventListener('blur', away);
      removeEventListener('focus', back);
    };
  }, []);

  const toggle = async () => {
    const el = audio.current;
    if (!el) return;
    if (el.paused) {
      setStarted(true);
      try {
        await el.play();
      } catch {
        // Autoplay policy, a codec the browser will not take, or a failed
        // fetch. The element's own error event covers the last of those.
        setPlaying(false);
      }
    } else {
      el.pause();
    }
  };

  const stop = () => {
    const el = audio.current;
    if (!el) return;
    el.pause();
    el.currentTime = 0;
    setStarted(false);
  };

  return (
    <Plasma
      className="teaser-track"
      radius={14}
      tint="#061016"
      opacity={0.55}
      frost={0.5}
      lean={false}
      draggable
    >
      {/* preload="none": nothing is fetched until the first play. It loops, so
          the page keeps its soundtrack until someone stops it - the browser
          caches the file after the first pass rather than re-fetching it. */}
      <audio ref={audio} src={TRACK_SRC} preload="none" loop />

      {/* Something to hold. Every other pixel of this panel is a button or a
          slider, and those suppress dragging - without a grip the panel is
          draggable in principle and immovable in practice. */}
      <span className="teaser-grip" aria-hidden="true">
        <svg viewBox="0 0 6 16" width="6" height="16">
          <g fill="currentColor">
            <circle cx="1.5" cy="4" r="1.1" />
            <circle cx="4.5" cy="4" r="1.1" />
            <circle cx="1.5" cy="8" r="1.1" />
            <circle cx="4.5" cy="8" r="1.1" />
            <circle cx="1.5" cy="12" r="1.1" />
            <circle cx="4.5" cy="12" r="1.1" />
          </g>
        </svg>
      </span>

      <button
        type="button"
        className="teaser-track-btn"
        onClick={toggle}
        disabled={failed}
        aria-label={playing ? `Pause ${TRACK_NAME}` : `Play ${TRACK_NAME}`}
      >
        {playing ? (
          <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
            <path fill="currentColor" d="M4.5 2.5h3v11h-3zM8.5 2.5h3v11h-3z" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
            <path fill="currentColor" d="M4.5 2.3l9 5.7-9 5.7z" />
          </svg>
        )}
      </button>

      <button
        type="button"
        className="teaser-track-btn"
        onClick={stop}
        disabled={failed || !started}
        aria-label={`Stop ${TRACK_NAME}`}
      >
        <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
          <rect fill="currentColor" x="3.5" y="3.5" width="9" height="9" rx="1" />
        </svg>
      </button>

      {failed && (
        <span className="teaser-hidden" role="status">
          {TRACK_NAME} is unavailable
        </span>
      )}

      <input
        className="teaser-volume"
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={volume}
        disabled={failed}
        aria-label={`${TRACK_NAME} volume`}
        onChange={(e) => {
          const v = Number(e.target.value);
          setVolume(v);
          try {
            localStorage.setItem(VOLUME_KEY, String(v));
          } catch {
            // Private windows throw; the slider still works for this visit.
          }
        }}
      />
    </Plasma>
  );
}
