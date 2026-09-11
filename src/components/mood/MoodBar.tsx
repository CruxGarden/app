import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { useAudioStore } from '@/stores/audioStore';
import { useUIStore } from '@/stores/uiStore';
import { getDockState, setDockState } from '@/services/sound';
import { getThemePreview, onThemePreviewChange } from '@/lib/moods/active';
import { isPublicSite } from '@/lib/site';
import { useShallow } from 'zustand/react/shallow';
import { PauseIcon, PlayIcon as PlayIconGlyph, SlidersIcon } from '@/components/ui/icons';

/**
 * The Mood Bar, a control in the top bar: the Mood's track — play/pause,
 * volume, what's playing — and a way into the Mood modal and the Sound
 * section. Collapsed it is one small button with live level bars; expanded it
 * shows the track name, play/pause, volume and the sound settings. The
 * collapsed state persists. Every part is a Mood token (moodBar*), so a theme
 * can restyle it.
 *
 * On the public website (crux.garden) there is no Mood modal and no /mood
 * route: the level button scrolls to the landing page's Moods section and the
 * settings button is not shown.
 */

const BARS = [
  { k: 0.35, ms: 1900, delay: 0 },
  { k: 0.7, ms: 2300, delay: 300 },
  { k: 1, ms: 1700, delay: 150 },
  { k: 0.55, ms: 2600, delay: 500 },
];

function LevelBars({ playing }: { playing: boolean }) {
  // Four bars that sway, subtly, while the track plays. The analyser's level sets how
  // tall they reach (a quiet passage, lower bars); when the analyser has
  // nothing to say — some sources give it silence — they still move, so the
  // bar always shows that sound is on.
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    // The analyser updates every animation frame. A React external-store
    // subscription here schedules urgent root work each frame and can starve
    // a large workspace's initial Suspense render. Only the meter needs painting.
    const paint = (state: { level: number; playing: boolean }) => {
      const reach = state.playing ? 0.55 + Math.min(1, Math.sqrt(state.level) * 1.6) * 0.45 : 0.15;
      BARS.forEach((bar, i) => {
        const el = ref.current?.children[i] as HTMLElement | undefined;
        if (el) el.style.height = `${Math.max(2, reach * bar.k * 14)}px`;
      });
    };
    paint(useAudioStore.getState());
    return useAudioStore.subscribe((state, previous) => {
      if (state.level !== previous.level || state.playing !== previous.playing) paint(state);
    });
  }, []);
  return (
    <span
      ref={ref}
      className="flex items-end gap-[2px] h-3.5 w-3.5 motion-ambient react-accent-bars"
      aria-hidden
    >
      {BARS.map((b, i) => (
        <span
          key={i}
          className={cn(
            'w-[2.5px] rounded-sm bg-mood-bar-accent origin-bottom transition-[height] [transition-duration:var(--motion-ms-fast)]',
            playing && 'mood-bar-dance',
          )}
          style={{
            height: '2px',
            animationDuration: `${b.ms}ms`,
            animationDelay: `${b.delay}ms`,
          }}
        />
      ))}
    </span>
  );
}

export default function MoodBar({
  className,
  gateway = false,
}: {
  className?: string;
  /** On the Gateway: no garden yet, so no Mood modal and no sound settings — just the player. */
  gateway?: boolean;
}) {
  const navigate = useNavigate();
  const publicSite = isPublicSite();
  const { track, enabled, playing, volume, init, toggle, setVolume } = useAudioStore(
    useShallow((s) => ({
      track: s.track,
      enabled: s.enabled,
      playing: s.playing,
      volume: s.volume,
      init: s.init,
      toggle: s.toggle,
      setVolume: s.setVolume,
    })),
  );
  const canPlay = !!track && enabled;
  const [collapsed, setCollapsed] = useState(() => getDockState()?.collapsed ?? false);
  const [aiPreview, setAiPreview] = useState(() => Object.keys(getThemePreview()).length);
  useEffect(
    () => onThemePreviewChange(() => setAiPreview(Object.keys(getThemePreview()).length)),
    [],
  );
  useEffect(() => init(), [init]);

  const openMood = useCallback(() => {
    if (gateway) return;
    if (publicSite) {
      document.getElementById('mood')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    useUIStore.getState().toggleMoodPanel();
  }, [publicSite, gateway]);

  const setCollapsedPersist = useCallback((c: boolean) => {
    setCollapsed(c);
    const prev = getDockState() ?? { x: -1, y: -1, collapsed: c };
    setDockState({ ...prev, collapsed: c });
  }, []);

  const PlayIcon = playing ? <PauseIcon size={11} /> : <PlayIconGlyph size={11} />;

  return (
    <div
      role="region"
      aria-label="Mood Bar"
      className={cn(
        'flex items-center gap-1 h-7 pl-1 pr-1 select-none',
        'bg-mood-bar border border-mood-bar-border text-mood-bar-text rounded-[var(--mood-bar-radius)] shadow-mood-bar',
        className,
      )}
    >
      {/* Level button: expand when collapsed, open Mood when expanded */}
      <button
        type="button"
        onClick={() => (collapsed ? setCollapsedPersist(false) : openMood())}
        title={
          collapsed ? (track ? `${track.name}${playing ? ' — playing' : ''}` : 'Mood') : 'Mood'
        }
        aria-label={collapsed ? 'Expand Mood Bar' : publicSite ? 'Go to Moods' : 'Open Mood'}
        className="relative w-5 h-5 rounded-[var(--mood-bar-radius)] flex items-center justify-center cursor-pointer shrink-0 hover:bg-mood-bar-hover"
      >
        <LevelBars playing={playing} />
        {aiPreview > 0 && (
          <span
            aria-label={`Theme preview: ${aiPreview} tokens`}
            title={`Theme preview: ${aiPreview} tokens`}
            className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-warning border border-mood-bar"
          />
        )}
      </button>

      {!collapsed && (
        <span
          className="min-w-0 max-w-[9rem] text-left px-1 block text-xxs font-body truncate leading-tight"
          title={track ? track.name : 'This Mood has no track'}
          data-testid="mood-bar-track"
        >
          {track ? track.name : enabled ? 'No track' : 'Sound off'}
        </span>
      )}

      <button
        type="button"
        onClick={() => void toggle()}
        disabled={!canPlay}
        aria-label={playing ? 'Pause soundscape' : 'Play soundscape'}
        title={!track ? 'This Mood has no track — add one under Mood → Sound' : undefined}
        className="w-5 h-5 rounded-[var(--mood-bar-radius)] bg-mood-bar-button text-mood-bar-accent-text flex items-center justify-center cursor-pointer shrink-0 hover-bright motion-press react-accent disabled:opacity-40 disabled:cursor-default"
      >
        {PlayIcon}
      </button>

      {!collapsed && (
        <>
          <input
            type="range"
            aria-label="Soundscape volume"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className="w-14 accent-mood-bar-accent cursor-pointer"
          />
          {!publicSite && !gateway && (
            <button
              type="button"
              onClick={() => navigate('/mood?tab=sound')}
              title="Sound"
              aria-label="Open sound settings"
              className="w-5 h-5 rounded-[var(--mood-bar-radius)] text-mood-bar-text-muted hover:text-mood-bar-accent flex items-center justify-center cursor-pointer shrink-0"
            >
              <SlidersIcon size={12} />
            </button>
          )}
          <button
            type="button"
            onClick={() => setCollapsedPersist(true)}
            aria-label="Collapse Mood Bar"
            title="Collapse"
            className="w-4 h-5 text-mood-bar-text-muted hover:text-mood-bar-text flex items-center justify-center cursor-pointer shrink-0 text-xs"
          >
            ‹
          </button>
        </>
      )}
    </div>
  );
}
