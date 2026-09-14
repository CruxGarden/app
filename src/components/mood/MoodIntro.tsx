import { useEffect, useRef, useState } from 'react';
import { moodTimeline, setPieceAllowed } from '@/lib/set-piece';

/**
 * The Mood intro (a set piece, ADR 0041): when a person wears a Mood, a wash
 * in its accent sweeps the screen and its name rises, holds and dissolves —
 * a GSAP timeline on the Mood's own durations and curve. Nothing under
 * intensity off or subtle, and nothing when a Mood is merely restored at
 * startup (only `mood-worn` events, sent by the wear paths, play it). The
 * overlay never takes pointer events.
 */
export default function MoodIntro() {
  const [name, setName] = useState<string | null>(null);
  const wash = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLDivElement>(null);
  const [seq, setSeq] = useState(0);

  useEffect(() => {
    const onWorn = (e: Event) => {
      const worn = (e as CustomEvent<{ name?: string }>).detail?.name;
      if (!worn || !setPieceAllowed()) return;
      setName(worn);
      setSeq((n) => n + 1);
    };
    document.addEventListener('mood-worn', onWorn);
    return () => document.removeEventListener('mood-worn', onWorn);
  }, []);

  useEffect(() => {
    if (!name || !wash.current || !title.current) return;
    const { timeline, tokens } = moodTimeline({ onComplete: () => setName(null) });
    const base = tokens.base / 1000;
    const slow = tokens.slow / 1000;
    timeline
      .fromTo(wash.current, { scaleX: 0, opacity: 0.9 }, { scaleX: 1, duration: slow })
      .fromTo(title.current, { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: base }, '<40%')
      .to({}, { duration: slow * 1.5 })
      .to(title.current, { y: -10, opacity: 0, duration: base })
      .to(wash.current, { opacity: 0, duration: slow }, '<');
    return () => {
      timeline.kill();
    };
  }, [name, seq]);

  if (!name) return null;
  return (
    <div
      data-testid="mood-intro"
      aria-hidden
      className="fixed inset-0 z-[80] pointer-events-none flex items-center justify-center"
    >
      <div
        ref={wash}
        className="absolute inset-0 origin-left"
        style={{
          background:
            'linear-gradient(100deg, var(--accent) 0%, color-mix(in srgb, var(--accent) 45%, var(--bg)) 100%)',
        }}
      />
      <div
        ref={title}
        className="relative font-display text-4xl font-medium tracking-tight text-center px-6"
        style={{ color: 'var(--action-button-text, var(--bg))' }}
      >
        {name}
      </div>
    </div>
  );
}
