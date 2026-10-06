import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { useAudioStore } from '@/stores/audioStore';
import { useUIStore, useWorkspaceUIStore } from '@/stores/uiStore';
import { getThemePreview, onThemePreviewChange } from '@/lib/moods/active';
import { isPublicSite } from '@/lib/site';
import { useShallow } from 'zustand/react/shallow';
import { MoodIcon, PauseIcon, PlayIcon as PlayIconGlyph, SlidersIcon } from '@/components/ui/icons';

/**
 * The Mood chip in the top bar: the Mood and its sound as one control (UX pass
 * 2, 2026-09-27). At rest it is the Mood — the button that opens the Mood
 * pane, with live level bars — and play/pause; hovered or focused it also shows
 * what is playing, the volume and the way into the Sound section. Every part
 * is a Mood token (moodBar*), so a theme can restyle it.
 *
 * On the public website (crux.garden) there is no Mood pane: the level button
 * scrolls to the landing page's Moods section and the settings button is not
 * shown. On the Gateway it is just the player.
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
  /** On the Gateway: no garden yet, so no Mood pane and no sound settings — just the player. */
  gateway?: boolean;
}) {
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
  const canPlay = (!publicSite || !!track) && enabled;
  const soundName = publicSite ? (track?.name ?? 'No track') : 'Crux Synth';
  // In the app the chip is the Mood's one control: the Mood pane and its sound.
  const inApp = !publicSite && !gateway;
  const moodOpen = useWorkspaceUIStore((s) => !!s.paneVisibility.mood);
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
    useUIStore.getState().toggleMoodPane();
  }, [publicSite, gateway]);

  const PlayIcon = playing ? <PauseIcon size={11} /> : <PlayIconGlyph size={11} />;
  const trackName = (
    <span
      className="min-w-0 max-w-[9rem] text-left block text-xxs font-body truncate leading-tight px-1"
      title={soundName}
      data-testid="mood-bar-track"
    >
      {enabled ? soundName : 'Sound off'}
    </span>
  );
  const volumeSlider = (
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
  );

  return (
    <div
      role="region"
      aria-label="Mood Bar"
      className={cn(
        'group/mood relative flex items-center gap-2 h-8 px-1 select-none text-mood-bar-text rounded-[var(--mood-bar-radius)] shadow-mood-bar',
        className,
      )}
    >
      <button
        type="button"
        onClick={openMood}
        disabled={gateway}
        aria-label={publicSite ? 'Go to Moods' : 'Mood'}
        aria-pressed={inApp ? moodOpen : undefined}
        // No tooltip: hovering the chip opens its flyout in the same place.
        aria-keyshortcuts={inApp ? 'Meta+M Control+M' : undefined}
        className={cn(
          'relative h-6 px-1.5 rounded-[var(--mood-bar-radius)] flex items-center gap-1.5 shrink-0',
          'transition-colors disabled:cursor-default',
          inApp && 'cursor-pointer hover:bg-mood-bar-hover motion-press',
          inApp &&
            (moodOpen
              ? 'bg-mood-bar-hover text-mood-bar-accent'
              : 'text-mood-bar-text-muted hover:text-mood-bar-text'),
        )}
      >
        {inApp && <MoodIcon size={14} />}
        <LevelBars playing={playing} />
        {aiPreview > 0 && (
          <span
            aria-label={`Theme preview: ${aiPreview} tokens`}
            title={`Theme preview: ${aiPreview} tokens`}
            className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-warning border border-mood-bar"
          />
        )}
      </button>

      {!inApp && trackName}

      <button
        type="button"
        onClick={() => void toggle()}
        disabled={!canPlay}
        aria-label={playing ? 'Pause soundscape' : 'Play soundscape'}
        title={publicSite && !track ? 'This Mood has no track' : undefined}
        className="w-5 h-5 rounded-[var(--mood-bar-radius)] bg-mood-bar-button text-mood-bar-accent-text flex items-center justify-center cursor-pointer shrink-0 hover-bright motion-press react-accent disabled:cursor-default"
      >
        {PlayIcon}
      </button>

      {inApp ? (
        // What plays, its volume and the way into Sound open under the chip on
        // hover or focus, so the bar itself never changes width (UX pass 2).
        <div
          className={cn(
            'absolute top-full right-0 z-50 pt-1.5',
            'opacity-0 pointer-events-none -translate-y-0.5',
            'transition-[opacity,translate] [transition-duration:var(--motion-ms-fast)]',
            'group-hover/mood:opacity-100 group-hover/mood:pointer-events-auto group-hover/mood:translate-y-0',
            'group-focus-within/mood:opacity-100 group-focus-within/mood:pointer-events-auto group-focus-within/mood:translate-y-0',
          )}
        >
          <div className="flex items-center gap-2 h-9 pl-2 pr-1.5 whitespace-nowrap bg-dropdown border border-dropdown-border rounded-dropdown shadow-dropdown text-text">
            {trackName}
            {volumeSlider}
            <button
              type="button"
              onClick={() => useUIStore.getState().openMood('sound')}
              title="Sound"
              aria-label="Open sound settings"
              className="w-6 h-6 rounded-[var(--radius-sm)] text-text-muted hover:text-text hover:bg-action-button-hover flex items-center justify-center cursor-pointer shrink-0 transition-colors"
            >
              <SlidersIcon size={12} />
            </button>
          </div>
        </div>
      ) : (
        volumeSlider
      )}
    </div>
  );
}
