import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { useAudioStore } from '@/stores/audioStore';
import { useUIStore } from '@/stores/uiStore';
import { getDockState, setDockState } from '@/services/resonance';
import { getThemePreview, onThemePreviewChange } from '@/lib/moods/active';
import { isPublicSite } from '@/lib/site';
import { useShallow } from 'zustand/react/shallow';
import { PauseIcon, PlayIcon as PlayIconGlyph, SlidersIcon } from '@/components/ui/icons';

/**
 * The Mood Bar, now a control in the top bar: the active soundscape's
 * transport and volume, what's playing, a way into the Mood modal and the
 * Mixer. Collapsed it is one small button with live level bars; expanded it
 * shows the mix name, play/pause, volume and the mixer. The collapsed state
 * persists. Every part is a Mood token (moodBar*), so a theme can restyle it.
 *
 * On the public website (crux.garden) there is no Mood modal and no /mood
 * route: the level button scrolls to the landing page's Moods section and the
 * Mixer button is not shown.
 */

function LevelBars({ level, playing }: { level: number; playing: boolean }) {
  const bars = [0.35, 0.7, 1, 0.55];
  return (
    <span
      className="flex items-end gap-[2px] h-3.5 w-3.5 motion-ambient react-accent-bars"
      aria-hidden
    >
      {bars.map((k, i) => (
        <span
          key={i}
          className="w-[2.5px] rounded-sm bg-mood-bar-accent transition-[height] [transition-duration:var(--motion-ms-fast)]"
          style={{
            height: `${Math.max(2, (playing ? Math.min(1, Math.sqrt(level) * 1.6) : 0.15) * k * 14)}px`,
          }}
        />
      ))}
    </span>
  );
}

export default function MoodBar({ className }: { className?: string }) {
  const navigate = useNavigate();
  const publicSite = isPublicSite();
  const { mixes, activeMixId, playing, volume, level, init, toggle, next, setVolume } =
    useAudioStore(
      useShallow((s) => ({
        mixes: s.mixes,
        activeMixId: s.activeMixId,
        playing: s.playing,
        volume: s.volume,
        level: s.level,
        init: s.init,
        toggle: s.toggle,
        next: s.next,
        setVolume: s.setVolume,
      })),
    );
  const mix = mixes.find((m) => m.id === activeMixId);
  const [collapsed, setCollapsed] = useState(() => getDockState()?.collapsed ?? false);
  const [aiPreview, setAiPreview] = useState(() => Object.keys(getThemePreview()).length);
  useEffect(
    () => onThemePreviewChange(() => setAiPreview(Object.keys(getThemePreview()).length)),
    [],
  );
  useEffect(() => init(), [init]);

  const openMood = useCallback(() => {
    if (publicSite) {
      document.getElementById('mood')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    useUIStore.getState().toggleMoodPanel();
  }, [publicSite]);

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
        title={collapsed ? (mix ? `${mix.name}${playing ? ' — playing' : ''}` : 'Mood') : 'Mood'}
        aria-label={collapsed ? 'Expand Mood Bar' : publicSite ? 'Go to Moods' : 'Open Mood'}
        className="relative w-5 h-5 rounded-[var(--mood-bar-radius)] flex items-center justify-center cursor-pointer shrink-0 hover:bg-mood-bar-hover"
      >
        <LevelBars level={level} playing={playing} />
        {aiPreview > 0 && (
          <span
            aria-label={`Theme preview: ${aiPreview} tokens`}
            title={`Theme preview: ${aiPreview} tokens`}
            className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-warning border border-mood-bar"
          />
        )}
      </button>

      {!collapsed && (
        <button
          type="button"
          onClick={() => void next()}
          title="Next mix"
          className="min-w-0 max-w-[9rem] text-left cursor-pointer px-1 hover:text-mood-bar-accent"
        >
          <span className="block text-xxs font-body truncate leading-tight">
            {mix?.name ?? 'No mix'}
          </span>
        </button>
      )}

      <button
        type="button"
        onClick={() => void toggle()}
        aria-label={playing ? 'Pause soundscape' : 'Play soundscape'}
        className="w-5 h-5 rounded-[var(--mood-bar-radius)] bg-mood-bar-accent text-mood-bar-accent-text flex items-center justify-center cursor-pointer shrink-0 hover-bright motion-press react-accent"
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
          {!publicSite && (
            <button
              type="button"
              onClick={() => navigate('/mood?tab=resonance')}
              title="Mixer"
              aria-label="Open the mixer"
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
