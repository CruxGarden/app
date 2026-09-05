/**
 * The Round — the play surface of 5Ws, an Astro island (`/play`).
 *
 * Someone is already talking when it opens. The screen is Soft Serve: a blush
 * page (deep navy in dark), one white card with round corners and no border,
 * the voice as the biggest, boldest text in it, the interface smaller and grey
 * (`global.css` says why the spec's serif/sans rule was set aside). The voice
 * *types* — character by character, a breath after punctuation, a coral bar
 * cursor at the end — and nothing else moves while it does; Space or a tap
 * skips to the end. Points, questions left and the clock are a row of soft
 * pills in the card head (`PTS 8 · Q 9 · 4:37`); the points pill goes coral
 * for one beat when a point goes; the clock holds while the voice types, as
 * it pauses while the model composes. A Guess field kept apart from the
 * question because guesses cost and questions don't (a wrong guess nudges it,
 * 2px — the one flourish); Search opens a tab and the clock keeps running;
 * Give up is a shrug. At the end the name decrypts from blocks in coral and
 * settles, the sections type in one after another, and a share block with no
 * spoiler in it is the only trophy. No confetti, no streaks; a dim line says
 * when the next figure comes. Light or dark follows the system unless the
 * toggle in the corner says otherwise.
 *
 * The round runs here, in the visitor's browser, with the AI they connected
 * (first play: "Connect your AI" — one field, one button; the provider is
 * read off the key and the opening line is the validation); the hidden
 * figure lives in client state for the round and goes into every model call
 * as fixed context (ADR 0016). The model calls are whole lines; the typing is
 * the client's pacing over them.
 * Mobile-first: one column, the voice on top, the question/guess bar at the
 * bottom. The same component is the desktop layout with more room.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { hiddenFromEntry, parseShelf, pickEntry, type Shelf, type ShelfEntry } from '../game/shelf';
import {
  MAX_SCORE,
  durationSeconds,
  remainingMs,
  scoreBreakdown,
  scoreOf,
  speedBonusNow,
  type Guess,
  type RoundState,
} from '../game/round';
import { renderTranscriptMarkdown, transcriptOf } from '../game/transcript';
import type { Reveal } from '../game/hidden';
import { RoundSession } from '../lib/session';
import {
  PROVIDERS,
  UNKNOWN_KEY_MESSAGE,
  detectProvider,
  injectedModel,
  modelFor,
  providerInfo,
  refusedMessage,
  temperatureFor,
} from '../lib/model';
import {
  clearAuth,
  clearModelConfig,
  dailyAvailable,
  defaultStorage,
  loadAuth,
  loadModelConfig,
  markDailyPlayed,
  saveAuth,
  saveModelConfig,
  utcDay,
  type KeyValueStorage,
  type ModelConfig,
  type StoredAuth,
} from '../lib/local-state';
import {
  clockOf,
  login,
  markPlayed,
  postScore,
  profile,
  rankOf,
  readBoard,
  readPlayed,
  requestCode,
  siteConfig,
  type Leaderboard,
} from '../lib/leaderboard';
import { storeFor } from '../lib/store';
import { formatClock, isWebUrl, searchUrlFor } from '../lib/format';
import { typeOut, typingUnits } from '../lib/typing';
import { decryptSchedule, letterCount, maskName, splitWho } from '../lib/decrypt';
import { shareResult } from '../lib/share';
import { formatCountdown, msUntilUtcMidnight } from '../lib/countdown';
import {
  DARK_QUERY,
  applyTheme,
  currentThemeChoice,
  loadSound,
  loadTheme,
  nextTheme,
  resolveTheme,
  saveSound,
  saveTheme,
  systemPrefersDark,
  themeToggleLabel,
  type ResolvedTheme,
  type ThemeChoice,
} from '../lib/theme';
import { createSound, type Sound } from '../lib/sound';

export interface RoundProps {
  /** The Shelf, as `shelf.json` (parsed by this component so a bad shelf says why). */
  shelf: unknown;
  /** The site's base URL (`import.meta.env.BASE_URL`), for the share link. */
  base?: string;
  /** The game's name, for the boot line and the share block (the site's tagline, not the shelf). */
  name?: string;
}

/** The screen's two settings, remembered in this browser: the theme and sound. */
interface Prefs {
  /** What was picked: system (the default), light or dark. */
  theme: ThemeChoice;
  /** What is showing. */
  resolved: ResolvedTheme;
  /** One press: system → light → dark → system. */
  cycleTheme: () => void;
  soundOn: boolean;
  setSoundOn: (on: boolean) => void;
  /** The engine while sound is on; null when off. */
  sound: Sound | null;
}

export default function Round({ shelf: shelfJson, base = '/', name }: RoundProps) {
  const storage = useMemo(defaultStorage, []);
  const parsed = useMemo(() => {
    try {
      return { shelf: parseShelf(shelfJson), problem: null as string | null };
    } catch (err) {
      return { shelf: null, problem: (err as Error).message };
    }
  }, [shelfJson]);
  const [config, setConfig] = useState<ModelConfig | null>(() => loadModelConfig(storage));
  // What the Connect step shows when a round hands the visitor back to it: the
  // sentence, and the key that was refused so it can be fixed rather than retyped.
  const [connectProblem, setConnectProblem] = useState<string | null>(null);
  const [refusedKey, setRefusedKey] = useState('');
  const [roundNo, setRoundNo] = useState(1);
  const [lastEntryId, setLastEntryId] = useState<string | null>(null);
  const injected = injectedModel() !== null;
  const prefs = usePrefs(storage);
  // The session below is memoised on this; a fresh fallback object on every render
  // (toggling the theme re-renders the root) would start a new round mid-round.
  const effectiveConfig = useMemo<ModelConfig>(() => config ?? { provider: 'anthropic' }, [config]);

  const connect = useCallback(
    (key: string) => {
      const provider = detectProvider(key);
      if (!provider) {
        setConnectProblem(UNKNOWN_KEY_MESSAGE);
        return;
      }
      const next: ModelConfig = { provider, apiKey: key.trim() };
      try {
        modelFor(next); // throws with a sentence when it cannot be built
      } catch (err) {
        setConnectProblem((err as Error).message);
        return;
      }
      saveModelConfig(storage, next);
      setConfig(next);
      setConnectProblem(null);
      setRefusedKey('');
    },
    [storage],
  );
  // "Change": forget the key and go back to the step, clean.
  const disconnect = useCallback(() => {
    clearModelConfig(storage);
    setConfig(null);
    setConnectProblem(null);
    setRefusedKey('');
  }, [storage]);
  // The round could not use the connection (the provider refused the key, or
  // the model could not be built): back to the step, with the key still there.
  const onModelProblem = useCallback(
    (problem: string, key: string) => {
      setConnectProblem(problem);
      setRefusedKey(key);
      if (!injected) {
        clearModelConfig(storage);
        setConfig(null);
      }
    },
    [injected, storage],
  );

  if (!parsed.shelf) {
    return (
      <div className="round-app" data-layout="narrow">
        <p className="note error">This shelf cannot be read: {parsed.problem}</p>
      </div>
    );
  }

  if (!injected && !config) {
    return (
      <ConnectAi
        shelf={parsed.shelf}
        problem={connectProblem}
        initialKey={refusedKey}
        onConnect={connect}
        prefs={prefs}
      />
    );
  }

  return (
    <Play
      key={roundNo}
      shelf={parsed.shelf}
      name={name ?? parsed.shelf.title}
      config={effectiveConfig}
      storage={storage}
      base={base}
      prefs={prefs}
      boot={roundNo === 1}
      avoidEntryId={lastEntryId}
      onPlayAgain={(entryId) => {
        setLastEntryId(entryId);
        setRoundNo((n) => n + 1);
      }}
      onDisconnect={injected ? null : disconnect}
      onModelProblem={onModelProblem}
    />
  );
}

// ── Screen settings: theme, sound ───────────────────────────────────────────

function usePrefs(storage: KeyValueStorage): Prefs {
  // The head script applied the remembered choice before first paint; start from what it set.
  const [theme, setThemeState] = useState<ThemeChoice>(() =>
    typeof document !== 'undefined'
      ? currentThemeChoice(document.documentElement)
      : loadTheme(storage),
  );
  const [systemDark, setSystemDark] = useState(() => systemPrefersDark());
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia(DARK_QUERY);
    const onChange = () => setSystemDark(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  useEffect(() => {
    if (typeof document !== 'undefined') applyTheme(document.documentElement, theme, systemDark);
  }, [theme, systemDark]);
  const cycleTheme = useCallback(() => {
    setThemeState((t) => {
      const next = nextTheme(t);
      saveTheme(storage, next);
      return next;
    });
  }, [storage]);
  const resolved = resolveTheme(theme, systemDark);
  const [soundOn, setSoundOnState] = useState(() => loadSound(storage));
  const [engine, setEngine] = useState<Sound | null>(null);
  // Built after the toggle's click, so the browser lets it play
  useEffect(() => {
    if (soundOn && !engine) setEngine(createSound());
  }, [soundOn, engine]);
  const setSoundOn = useCallback(
    (on: boolean) => {
      saveSound(storage, on);
      setSoundOnState(on);
    },
    [storage],
  );
  return useMemo(
    () => ({ theme, resolved, cycleTheme, soundOn, setSoundOn, sound: soundOn ? engine : null }),
    [theme, resolved, cycleTheme, soundOn, setSoundOn, engine],
  );
}

/** The corner, top right: a small pill for sound, and the sun/moon that cycles the theme. */
function Corner({ prefs }: { prefs: Prefs }) {
  const label = themeToggleLabel(prefs.theme);
  return (
    <div className="corner">
      <button
        type="button"
        className="pill"
        aria-pressed={prefs.soundOn}
        onClick={() => prefs.setSoundOn(!prefs.soundOn)}
      >
        Sound {prefs.soundOn ? 'on' : 'off'}
      </button>
      <button
        type="button"
        className="theme-toggle"
        aria-label={label}
        title={label}
        data-theme-choice={prefs.theme}
        onClick={prefs.cycleTheme}
      >
        {prefs.resolved === 'dark' ? <MoonGlyph /> : <SunGlyph />}
      </button>
    </div>
  );
}

/* The same two glyphs as Base.astro's toggle (inline, so no request). */
function SunGlyph() {
  return (
    <svg
      className="sun"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}
function MoonGlyph() {
  return (
    <svg className="moon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}

/** True for `ms` after `value` changes (never on mount): the points pill's beat, the guess field's nudge. */
function usePulse(value: number, ms: number): boolean {
  const [on, setOn] = useState(false);
  const prev = useRef(value);
  useEffect(() => {
    if (value === prev.current) return;
    prev.current = value;
    setOn(true);
    const h = setTimeout(() => setOn(false), ms);
    return () => clearTimeout(h);
  }, [value, ms]);
  return on;
}

/** `prefers-reduced-motion`: text appears at once, nothing blinks. */
function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (fn) => {
      if (typeof matchMedia === 'undefined') return () => {};
      const mq = matchMedia('(prefers-reduced-motion: reduce)');
      mq.addEventListener('change', fn);
      return () => mq.removeEventListener('change', fn);
    },
    () =>
      typeof matchMedia === 'undefined'
        ? false
        : matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => false,
  );
}

// ── Connect your AI ─────────────────────────────────────────────────────────

/**
 * The one unavoidable bit of setup for a stranger, so: one field, one button.
 * The provider is read off the key's prefix; Enter or Connect stores it and
 * the round starts at once — the opening line is the validation. A key from
 * nowhere we know gets one line and a button that stays put.
 */
function ConnectAi({
  shelf,
  problem,
  initialKey,
  onConnect,
  prefs,
}: {
  shelf: Shelf;
  /** What the last round said about the connection ("That key was refused by …"). */
  problem: string | null;
  /** The refused key, pre-filled so it can be fixed rather than retyped. */
  initialKey: string;
  onConnect: (key: string) => void;
  prefs: Prefs;
}) {
  const [key, setKey] = useState(initialKey);
  const trimmed = key.trim();
  const provider = detectProvider(trimmed);
  const unknown = trimmed.length > 0 && provider === null;
  // The round's sentence stands until the key is touched
  const showProblem = problem !== null && !unknown && key === initialKey;
  return (
    <div className="round-app connect" data-layout="narrow">
      <header className="round-top">
        <span className="shelf-link">{shelf.title}</span>
        <Corner prefs={prefs} />
      </header>
      <section className="card connect-card">
        <h1 className="question">{shelf.question}</h1>
        <form
          className="connect-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (provider) onConnect(trimmed);
          }}
        >
          <h2>Connect your AI</h2>
          <p className="get-key">
            <span>Get a key:</span>
            {PROVIDERS.map((p) => (
              <a key={p.id} href={p.keysUrl} target="_blank" rel="noopener noreferrer">
                {p.free ? `${p.label} — free` : p.label}
              </a>
            ))}
          </p>
          <div className="row">
            <input
              type="password"
              aria-label="Key"
              placeholder="Paste your key"
              autoComplete="off"
              spellCheck={false}
              autoFocus
              enterKeyHint="go"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
            <button type="submit" className="button primary" disabled={!provider}>
              Connect
            </button>
          </div>
          {unknown && (
            <p className="note error" role="status">
              {UNKNOWN_KEY_MESSAGE}
            </p>
          )}
          {showProblem && (
            <p className="note error" role="alert">
              {problem}
            </p>
          )}
          <p className="note">Your key stays in this browser and is sent only to that provider.</p>
        </form>
      </section>
    </div>
  );
}

/** Which AI the round is talking through, and the way to change it. Quiet. */
function Connected({ config, onChange }: { config: ModelConfig; onChange: () => void }) {
  return (
    <p className="round-foot">
      {providerInfo(config.provider)?.label ?? 'Connected'} ·{' '}
      <button type="button" className="link" onClick={onChange}>
        Change
      </button>
    </p>
  );
}

// ── The round ───────────────────────────────────────────────────────────────

interface PlayProps {
  shelf: Shelf;
  name: string;
  config: ModelConfig;
  storage: KeyValueStorage;
  base: string;
  prefs: Prefs;
  /** First load: the screen boots before the voice speaks. Not on Play again. */
  boot: boolean;
  avoidEntryId: string | null;
  onPlayAgain: (lastEntryId: string) => void;
  onDisconnect: (() => void) | null;
  /** The connection cannot be used: a sentence, and the key it concerned. */
  onModelProblem: (problem: string, key: string) => void;
}

function Play({
  shelf,
  name,
  config,
  storage,
  base,
  prefs,
  boot,
  avoidEntryId,
  onPlayAgain,
  onDisconnect,
  onModelProblem,
}: PlayProps) {
  // The first round of a UTC day on this shelf is the daily — the same figure
  // for everyone (seeded by the day) and the one that counts for the board.
  // This browser remembers having played it; signed in, the visitor's own
  // `played:<day>` record in the crux's store remembers it across browsers,
  // so that is asked first (null until it answers; a store that cannot
  // answer leaves the browser's word standing).
  const store = useMemo(() => storeFor(loadAuth(storage)?.accessToken ?? null), [storage]);
  const [daily, setDaily] = useState<boolean | null>(() => {
    const here = dailyAvailable(storage, shelf.id);
    return here && store && loadAuth(storage) ? null : here;
  });
  useEffect(() => {
    if (daily !== null || !store) return;
    let cancelled = false;
    readPlayed(store, utcDay()).then((played) => {
      if (!cancelled) setDaily(played === null);
    });
    return () => {
      cancelled = true;
    };
  }, [daily, store]);
  const entry = useMemo(
    () =>
      daily === null
        ? null
        : daily
          ? pickEntry(shelf, utcDay())
          : pickPractice(shelf, avoidEntryId),
    [daily, shelf, avoidEntryId],
  );
  const [session, sessionProblem] = useMemo(() => {
    if (!entry) return [null, null] as const;
    try {
      return [
        new RoundSession({
          entry: hiddenFromEntry(entry, shelf),
          shelfId: shelf.id,
          model: modelFor(config),
          temperature: temperatureFor(config),
        }),
        null,
      ] as const;
    } catch (err) {
      return [null, (err as Error).message] as const;
    }
  }, [entry, shelf, config]);

  useEffect(() => {
    if (!session) return;
    session.start();
    return () => session.dispose();
  }, [session]);

  useEffect(() => {
    if (sessionProblem) onModelProblem(sessionProblem, config.apiKey ?? '');
  }, [sessionProblem, onModelProblem, config.apiKey]);

  // The provider refused the key: back to the step, key in hand.
  const onRefused = useCallback(
    () => onModelProblem(refusedMessage(config.provider), config.apiKey ?? ''),
    [onModelProblem, config.provider, config.apiKey],
  );

  if (daily === null) {
    return (
      <div className="round-app" data-layout="narrow">
        <p className="voice">
          <Composing />
        </p>
      </div>
    );
  }
  if (!session || !entry) return null;
  return (
    <LiveRound
      session={session}
      shelf={shelf}
      name={name}
      entry={entry}
      daily={daily}
      storage={storage}
      base={base}
      config={config}
      prefs={prefs}
      boot={boot}
      onPlayAgain={() => onPlayAgain(entry.id)}
      onDisconnect={onDisconnect}
      onRefused={onRefused}
    />
  );
}

/** A practice figure: any entry but the one just played (when the shelf allows). */
function pickPractice(shelf: Shelf, avoidId: string | null): ShelfEntry {
  if (shelf.entries.length < 2 || !avoidId) return pickEntry(shelf);
  for (let i = 0; i < 8; i++) {
    const e = pickEntry(shelf);
    if (e.id !== avoidId) return e;
  }
  return shelf.entries.find((e) => e.id !== avoidId) ?? pickEntry(shelf);
}

// ── Typing: one thing moves at a time ───────────────────────────────────────

/**
 * Shared by everything that types. One typer at a time: `begin` registers
 * the current one's skip (Space or a tap on the voice calls it) and holds
 * the clock; `end` releases both — by token, so a piece that finished long
 * ago cannot release the one speaking now.
 */
interface TypingControl {
  reduced: boolean;
  begin(skip: () => void): number;
  end(token: number): void;
  onChar(): void;
  onResolve(): void;
}

const TypingContext = createContext<TypingControl>({
  reduced: false,
  begin: () => 0,
  end: () => {},
  onChar: () => {},
  onResolve: () => {},
});

const BOOT_DARK_MS = 900;
/** The banner is an entrance, not a line of dialogue: a little slower, so it can be read. */
const BOOT_BANNER_CPS = 20;
type Boot = 'dark' | 'title' | 'done';

function LiveRound({
  session,
  shelf,
  name,
  entry,
  daily,
  storage,
  base,
  config,
  prefs,
  boot: bootWanted,
  onPlayAgain,
  onDisconnect,
  onRefused,
}: {
  session: RoundSession;
  shelf: Shelf;
  name: string;
  entry: ShelfEntry;
  daily: boolean;
  storage: KeyValueStorage;
  base: string;
  config: ModelConfig;
  prefs: Prefs;
  boot: boolean;
  onPlayAgain: () => void;
  onDisconnect: (() => void) | null;
  onRefused: () => void;
}) {
  const snap = useSyncExternalStore(
    (fn) => session.subscribe(fn),
    () => session.get(),
    () => session.get(),
  );
  const { state } = snap;
  const over = state.status !== 'open';
  const reduced = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const layout = useLayout(rootRef);
  const voiceEndRef = useRef<HTMLDivElement>(null);
  const [question, setQuestion] = useState('');
  const [guessText, setGuessText] = useState('');
  const [confirmGiveUp, setConfirmGiveUp] = useState(false);
  const [revealDone, setRevealDone] = useState(false);

  // Boot: a dark screen with one cursor, then the banner types, then the voice.
  const [boot, setBoot] = useState<Boot>(() => (bootWanted && !reduced ? 'dark' : 'done'));
  useEffect(() => {
    if (boot !== 'dark') return;
    const h = setTimeout(() => setBoot('title'), BOOT_DARK_MS);
    return () => clearTimeout(h);
  }, [boot]);

  // The typing control: the current typer's skip, the clock hold, the key clicks.
  const [typing, setTyping] = useState(false);
  const current = useRef<{ token: number; skip: () => void } | null>(null);
  const tokens = useRef(0);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const control = useMemo<TypingControl>(
    () => ({
      reduced,
      begin(skip) {
        const token = ++tokens.current;
        current.current = { token, skip };
        setTyping(true);
        session.hold(true);
        return token;
      },
      end(token) {
        if (current.current?.token !== token) return;
        current.current = null;
        setTyping(false);
        session.hold(false);
      },
      onChar() {
        prefsRef.current.sound?.click();
        voiceEndRef.current?.scrollIntoView({ block: 'nearest' });
      },
      onResolve() {
        prefsRef.current.sound?.tone();
      },
    }),
    [reduced, session],
  );
  const skip = useCallback(() => {
    if (boot === 'dark') {
      setBoot('done');
      return;
    }
    current.current?.skip();
  }, [boot]);

  // Space skips whatever is typing; Enter on the finished reveal starts another round.
  // Neither while the focus is in a field or on a control.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      // After Enter sends a question the focus is still in the (now empty) field: a leading
      // space means nothing there, so Space skips from it too. Anywhere else with text or a
      // control focused, keys are the control's own.
      const emptyField =
        t instanceof HTMLInputElement &&
        (t.type === 'text' || t.type === 'search') &&
        t.value === '';
      if (!emptyField && t?.closest?.('input, textarea, select, button, a, [contenteditable]'))
        return;
      if (e.key === ' ') {
        if (boot === 'dark' || current.current) {
          e.preventDefault();
          skip();
        }
      } else if (!emptyField && e.key === 'Enter' && over && snap.phase === 'done' && revealDone) {
        e.preventDefault();
        onPlayAgain();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [boot, skip, over, snap.phase, revealDone, onPlayAgain]);
  const onVoiceClick = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement | null;
    if (t?.closest?.('a, button, input, textarea, select')) return;
    skip();
  };

  // The voice column follows the conversation; one thing moves at a time.
  useEffect(() => {
    voiceEndRef.current?.scrollIntoView({ block: 'end' });
  }, [state.turns.length, state.guesses.length, state.composing, snap.phase]);

  // A daily that ended is spent, whatever the outcome.
  useEffect(() => {
    if (over && daily) markDailyPlayed(storage, shelf.id);
  }, [over, daily, storage, shelf.id]);

  // A refused key ends the attempt before it began: back to the Connect step.
  useEffect(() => {
    if (snap.refused) onRefused();
  }, [snap.refused, onRefused]);

  const submitQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    const q = question.trim();
    if (!q || state.composing || state.questionsLeft <= 0) return;
    session.ask(q);
    setQuestion('');
  };
  const submitGuess = (e: React.FormEvent) => {
    e.preventDefault();
    const g = guessText.trim();
    if (!g || state.composing) return;
    session.guess(g);
    setGuessText('');
  };

  const running = !over && !state.composing && !typing;
  const canAsk = !over && !state.composing && state.questionsLeft > 0;
  const banner = `${name} · ${shelf.question}`;
  // A point gone: the pill goes coral for a beat. A wrong guess: the guess field nudges, once.
  const pointsBeat = usePulse(state.points, 700);
  const wrongCount = state.guesses.filter((g) => g.correct === false).length;
  const nudge = usePulse(wrongCount, 160);
  // The banner typed in coral; once the boot is done it settles to the text colour over a beat
  // (only then — a theme switch must not animate it).
  const bannerSettling = usePulse(boot === 'done' ? 1 : 0, 700);

  return (
    <TypingContext.Provider value={control}>
      <div
        ref={rootRef}
        className={`round-app${over ? ' is-over' : ''}${boot !== 'done' ? ' booting' : ''}`}
        data-layout={layout}
        data-status={state.status}
        data-boot={boot}
        data-motion={reduced ? 'reduced' : 'full'}
        data-typing={typing ? 'true' : 'false'}
        onClick={boot !== 'done' ? onVoiceClick : undefined}
      >
        <header className="round-top">
          <a className="shelf-link" href={base}>
            {shelf.title}
          </a>
          <Corner prefs={prefs} />
        </header>

        <section className="card round-card">
          <header className="card-head" onClick={onVoiceClick}>
            <p className="banner" data-settling={bannerSettling ? 'true' : 'false'}>
              {boot === 'dark' ? (
                <Cursor />
              ) : boot === 'title' ? (
                <TypedText
                  text={banner}
                  charsPerSecond={BOOT_BANNER_CPS}
                  onDone={() => setBoot('done')}
                />
              ) : (
                banner
              )}
            </p>
            <div className="status" aria-live="off">
              <span
                className="readout points"
                data-testid="points"
                data-drop={pointsBeat ? 'true' : 'false'}
                title="Points"
              >
                PTS {state.points}
              </span>
              <span className="readout qleft" data-testid="questions-left" title="Questions left">
                Q {state.questionsLeft}
              </span>
              <span
                className={`readout clock${running ? ' running' : ' hold'}`}
                data-testid="clock"
                data-elapsed={state.elapsedMs}
                data-composing={state.composing ? 'true' : 'false'}
                data-held={typing ? 'true' : 'false'}
                title="Time left"
              >
                {formatClock(remainingMs(state))}
              </span>
              <span
                className={`readout speed${running ? ' running' : ' hold'}`}
                data-testid="speed-bonus"
                title="Speed bonus: fifty on the first second, zero at the buzzer. The other fifty is accuracy — five per wrong guess."
              >
                +{speedBonusNow(state)}
              </span>
            </div>
          </header>

          <section className="round-voice" aria-live="polite" onClick={onVoiceClick}>
            <p className="voice opening">
              {state.openingLine === null ? (
                state.awaiting === 'opening' ? (
                  <Composing />
                ) : (
                  <em>…</em>
                )
              ) : state.openingLine === '' ? (
                <em>…</em>
              ) : (
                <TypedText text={state.openingLine} active={boot === 'done'} />
              )}
            </p>
            {state.turns.map((t, i) => (
              <div className="turn" key={i}>
                <p className="you">
                  <strong>You:</strong> {t.question}
                </p>
                <p className="voice">
                  {t.answer === null ? <Composing /> : <TypedText text={t.answer} />}
                </p>
              </div>
            ))}
            {state.guesses.map((g, i) => (
              <GuessLine key={i} guess={g} />
            ))}
            {snap.error && (
              <p className="note error" role="alert">
                {snap.error}{' '}
                {snap.retry && (
                  <button type="button" className="link" onClick={() => session.retry()}>
                    Try again
                  </button>
                )}
              </p>
            )}
          </section>
        </section>

        {/* The reveal: its own card, stacked under the round's */}
        {over && (
          <RevealView
            state={state}
            reveal={snap.reveal}
            revealing={snap.phase !== 'done'}
            daily={daily}
            storage={storage}
            base={base}
            name={name}
            shelf={shelf}
            entry={entry}
            onPlayAgain={onPlayAgain}
            onVoiceDone={() => setRevealDone(true)}
          />
        )}
        <div ref={voiceEndRef} />

        {!over && (
          <footer className="round-bar">
            {state.browserOpen && (
              <SearchPanel
                onKeep={(url, title) => session.keepPage({ url, ...(title ? { title } : {}) })}
                kept={state.keptPages}
                onClose={() => session.closeBrowser()}
              />
            )}
            <form className="ask" onSubmit={submitQuestion}>
              <input
                type="text"
                aria-label="Ask a question"
                placeholder={
                  state.questionsLeft > 0 ? 'Ask a question' : 'No questions left — guess'
                }
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                disabled={!canAsk}
                autoComplete="off"
                enterKeyHint="send"
              />
              <button
                type="submit"
                className="button primary"
                disabled={!canAsk || !question.trim()}
              >
                Ask
              </button>
            </form>
            <div className="moves">
              <form className="guess" onSubmit={submitGuess}>
                <input
                  type="text"
                  aria-label="Your guess"
                  placeholder="Your guess"
                  value={guessText}
                  onChange={(e) => setGuessText(e.target.value)}
                  disabled={state.composing}
                  autoComplete="off"
                  enterKeyHint="go"
                  data-nudge={nudge ? 'true' : 'false'}
                />
                <button
                  type="submit"
                  className="button accent"
                  disabled={state.composing || !guessText.trim()}
                >
                  Guess
                </button>
                <span className="cost">−1 if wrong</span>
              </form>
              <div className="side">
                <button
                  type="button"
                  className={state.browserOpen ? 'button' : 'button quiet'}
                  aria-pressed={state.browserOpen}
                  onClick={() =>
                    state.browserOpen ? session.closeBrowser() : session.openBrowser()
                  }
                >
                  Search
                </button>
                {confirmGiveUp ? (
                  <button
                    type="button"
                    className="button quiet"
                    onClick={() => session.giveUp()}
                    onBlur={() => setConfirmGiveUp(false)}
                    autoFocus
                  >
                    Give up — sure?
                  </button>
                ) : (
                  <button
                    type="button"
                    className="button quiet"
                    onClick={() => setConfirmGiveUp(true)}
                  >
                    Give up
                  </button>
                )}
              </div>
            </div>
            {onDisconnect && (
              <div className="bar-foot">
                <Connected config={config} onChange={onDisconnect} />
              </div>
            )}
          </footer>
        )}

        {over && onDisconnect && (
          <div className="bar-foot">
            <Connected config={config} onChange={onDisconnect} />
          </div>
        )}
      </div>
    </TypingContext.Provider>
  );
}

/** The cursor — a coral rounded bar, the one thing that blinks (drawn by the stylesheet). */
function Cursor() {
  return <span className="cursor" aria-hidden="true" />;
}

/** Whoever is speaking is composing: the cursor, waiting. */
function Composing() {
  return <span className="composing cursor" role="img" aria-label="composing" />;
}

/**
 * A line the voice types. Mounts, types, keeps the finished text. `active`
 * false holds it back (the reveal's sections wait their turn); under reduced
 * motion the whole line is there at once.
 */
function TypedText({
  text,
  active = true,
  onDone,
  charsPerSecond,
}: {
  text: string;
  active?: boolean;
  onDone?: () => void;
  /** The pacer's default when absent. */
  charsPerSecond?: number;
}) {
  const ctl = useContext(TypingContext);
  const units = useMemo(() => typingUnits(text), [text]);
  const [shown, setShown] = useState(() => (ctl.reduced ? units.length : 0));
  const [done, setDone] = useState(ctl.reduced);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const reported = useRef(false);

  useEffect(() => {
    if (!active || done) return;
    let token: number | null = null;
    const typer = typeOut(text, {
      ...(charsPerSecond ? { charsPerSecond } : {}),
      onProgress: (n) => {
        setShown(n);
        ctl.onChar();
      },
      onDone: () => {
        setDone(true);
        if (token !== null) ctl.end(token);
        if (!reported.current) {
          reported.current = true;
          onDoneRef.current?.();
        }
      },
    });
    token = ctl.begin(() => typer.skip());
    return () => {
      typer.cancel();
      if (token !== null) ctl.end(token);
    };
  }, [active, done, text, ctl, charsPerSecond]);

  // Reduced motion: nothing to type, but the sequence still needs to hear "done"
  useEffect(() => {
    if (ctl.reduced && active && !reported.current) {
      reported.current = true;
      setShown(units.length);
      setDone(true);
      onDoneRef.current?.();
    }
  }, [ctl.reduced, active, units.length]);

  if (!active && !done) return null;
  if (done) return <>{text}</>;
  return (
    <>
      {units.slice(0, shown).join('')}
      <Cursor />
    </>
  );
}

function GuessLine({ guess }: { guess: Guess }) {
  if (guess.correct === null) {
    return (
      <p className="guess-line pending">
        <span className="label">Guess:</span> {guess.text} <Composing />
      </p>
    );
  }
  if (guess.correct) {
    return (
      <p className="guess-line right">
        <span className="label">Guess:</span> {guess.text}
      </p>
    );
  }
  return (
    <p className="guess-line wrong" data-testid="wrong-guess">
      <span className="label">Not {guess.text}.</span>
      {guess.why ? <span className="why"> {guess.why}</span> : null}
      <span className="cost"> −1</span>
    </p>
  );
}

// ── Search: a new tab, the clock running ────────────────────────────────────

function SearchPanel({
  onKeep,
  kept,
  onClose,
}: {
  onKeep: (url: string, title?: string) => void;
  kept: readonly { url: string; title?: string }[];
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const canPaste =
    typeof navigator !== 'undefined' && typeof navigator.clipboard?.readText === 'function';

  const search = (e: React.FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    if (!term) return;
    window.open(searchUrlFor(term), '_blank', 'noopener');
  };
  const keep = (e: React.FormEvent) => {
    e.preventDefault();
    const u = url.trim();
    if (!isWebUrl(u)) return;
    onKeep(u, title.trim() || undefined);
    setUrl('');
    setTitle('');
  };
  const paste = async () => {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (isWebUrl(text)) setUrl(text);
    } catch {
      /* no permission — the field is right there */
    }
  };

  return (
    <div className="search-panel" data-testid="search-panel">
      <form className="search" onSubmit={search}>
        <input
          type="search"
          aria-label="Search the web"
          placeholder="Search the web"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
          autoComplete="off"
        />
        <button type="submit" className="button" disabled={!q.trim()}>
          Search the web
        </button>
      </form>
      <p className="note">Opens in a new tab. The clock keeps running.</p>
      <form className="keep" onSubmit={keep}>
        <input
          type="url"
          aria-label="Page to keep"
          placeholder="Paste a page’s address to keep it"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          autoComplete="off"
        />
        <input
          type="text"
          aria-label="Title (optional)"
          placeholder="Title (optional)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoComplete="off"
        />
        {canPaste && (
          <button type="button" className="button quiet" onClick={paste}>
            Paste
          </button>
        )}
        <button type="submit" className="button" disabled={!isWebUrl(url)}>
          Keep this page
        </button>
      </form>
      {kept.length > 0 && (
        <ul className="kept" data-testid="kept-pages">
          {kept.map((p) => (
            <li key={p.url}>
              <a href={p.url} target="_blank" rel="noopener noreferrer">
                {p.title || p.url}
              </a>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="link close" onClick={onClose}>
        Done searching
      </button>
    </div>
  );
}

// ── The reveal ──────────────────────────────────────────────────────────────

type Piece =
  | { kind: 'name' }
  | { kind: 'para'; text: string; className: string }
  | { kind: 'miss'; guess: string; why: string };

/**
 * The reveal as a decrypt: the name resolves from blocks, then the sections
 * type in one after another — why it matters, the misses, the parting line.
 * The interface (share block, board, buttons) waits until the voice is done.
 */
function RevealView({
  state,
  reveal,
  revealing,
  daily,
  storage,
  base,
  name,
  shelf,
  entry,
  onPlayAgain,
  onVoiceDone,
}: {
  state: RoundState;
  reveal: Reveal | null;
  revealing: boolean;
  daily: boolean;
  storage: KeyValueStorage;
  base: string;
  name: string;
  shelf: Shelf;
  entry: ShelfEntry;
  onPlayAgain: () => void;
  onVoiceDone: () => void;
}) {
  const pieces = useMemo<Piece[]>(() => {
    if (!reveal) return [];
    const out: Piece[] = [{ kind: 'name' }];
    if (reveal.whyItMatters)
      out.push({ kind: 'para', text: reveal.whyItMatters, className: 'voice matters' });
    for (const m of reveal.misses) out.push({ kind: 'miss', guess: m.guess, why: m.whyReasonable });
    if (reveal.parting)
      out.push({ kind: 'para', text: reveal.parting, className: 'voice parting' });
    return out;
  }, [reveal]);
  const [stage, setStage] = useState(0);
  const advance = useCallback(() => setStage((s) => s + 1), []);
  // The name resolved (stage 1): the heading settles from coral to the text colour over a beat
  const whoSettling = usePulse(stage > 0 ? 1 : 0, 700);
  const voiceDone = reveal !== null && stage >= pieces.length;
  const voiceDoneRef = useRef(onVoiceDone);
  voiceDoneRef.current = onVoiceDone;
  useEffect(() => {
    if (voiceDone) voiceDoneRef.current();
  }, [voiceDone]);

  const outcome =
    state.status === 'won'
      ? null
      : state.status === 'timeUp'
        ? 'Time.'
        : state.status === 'lost'
          ? 'Out of points.'
          : 'You gave up.';

  const firstMiss = pieces.findIndex((p) => p.kind === 'miss');
  const who = reveal?.who || `This was ${entry.name}.`;

  return (
    <section
      className="reveal card"
      data-testid="reveal"
      data-voice-done={voiceDone ? 'true' : 'false'}
    >
      {outcome && <p className="outcome">{outcome}</p>}
      {state.status === 'won' && <ScoreLine state={state} />}
      {revealing || !reveal ? (
        <p className="voice">
          <Composing />
        </p>
      ) : (
        <>
          <h3 className="voice who" data-settling={whoSettling ? 'true' : 'false'}>
            <DecryptWho who={who} name={entry.name} won={state.status === 'won'} onDone={advance} />
          </h3>
          {pieces.map((p, i) => {
            if (i > stage) return null;
            if (p.kind === 'para') {
              return (
                <p key={i} className={p.className}>
                  <TypedText text={p.text} active={i === stage} onDone={advance} />
                </p>
              );
            }
            if (p.kind === 'miss' && i === firstMiss) {
              // The misses, as one block where the first one falls — each line in turn
              return (
                <div key={i} className="misses" data-testid="misses">
                  <h4>The misses</h4>
                  <ul>
                    {pieces.map((m, j) =>
                      m.kind === 'miss' && j <= stage ? (
                        <li key={j}>
                          <span className="guess-name">{m.guess}</span>
                          <span className="voice why">
                            {' — '}
                            <TypedText text={m.why} active={j === stage} onDone={advance} />
                          </span>
                        </li>
                      ) : null,
                    )}
                  </ul>
                </div>
              );
            }
            return null;
          })}
          {voiceDone && (
            <After
              state={state}
              reveal={reveal}
              daily={daily}
              storage={storage}
              base={base}
              name={name}
              shelf={shelf}
              entry={entry}
              onPlayAgain={onPlayAgain}
            />
          )}
        </>
      )}
    </section>
  );
}

/** `This was ▮▮▮▮▮▮▮` → the name, left to right. Faster on a win; a loss lingers half a second. */
function DecryptWho({
  who,
  name,
  won,
  onDone,
}: {
  who: string;
  name: string;
  won: boolean;
  onDone: () => void;
}) {
  const ctl = useContext(TypingContext);
  const parts = useMemo(() => splitWho(who, name), [who, name]);
  const total = letterCount(parts.name);
  const [resolved, setResolved] = useState(() => (ctl.reduced ? total : 0));
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (ctl.reduced) {
      setResolved(total);
      onDoneRef.current();
      return;
    }
    const schedule = decryptSchedule(total, won ? 800 : 1200, won ? 0 : 500);
    let i = 0;
    let handle: ReturnType<typeof setTimeout> | null = null;
    let finished = false;
    let token: number | null = null;
    const finish = () => {
      if (finished) return;
      finished = true;
      if (handle !== null) clearTimeout(handle);
      setResolved(total);
      ctl.onResolve();
      if (token !== null) ctl.end(token);
      onDoneRef.current();
    };
    const step = () => {
      i += 1;
      setResolved(i);
      if (i >= total) {
        finish();
        return;
      }
      handle = setTimeout(step, schedule[i]!);
    };
    handle = setTimeout(total === 0 ? finish : step, total === 0 ? 0 : schedule[0]!);
    token = ctl.begin(finish);
    return () => {
      finished = true;
      if (handle !== null) clearTimeout(handle);
      if (token !== null) ctl.end(token);
    };
  }, [ctl, total, won]);

  return (
    <>
      {parts.before}
      <span className="secret" data-resolved={resolved >= total ? 'true' : 'false'}>
        {maskName(parts.name, resolved)}
      </span>
      {parts.after}
    </>
  );
}

/** After the voice: the share block, the board, the next figure, the buttons. Interface, at once. */
function After({
  state,
  reveal,
  daily,
  storage,
  base,
  name,
  shelf,
  entry,
  onPlayAgain,
}: {
  state: RoundState;
  reveal: Reveal;
  daily: boolean;
  storage: KeyValueStorage;
  base: string;
  name: string;
  shelf: Shelf;
  entry: ShelfEntry;
  onPlayAgain: () => void;
}) {
  const [copied, setCopied] = useState<'result' | 'transcript' | null>(null);
  const [showMarkdown, setShowMarkdown] = useState(false);
  const markdown = useMemo(
    () => renderTranscriptMarkdown(transcriptOf(state, reveal)),
    [state, reveal],
  );
  const share = useMemo(
    () =>
      shareResult({
        name,
        question: shelf.question,
        day: daily ? state.startedAt.slice(0, 10) : null,
        status: state.status === 'open' ? 'gaveUp' : state.status,
        score: scoreOf(state),
        total: MAX_SCORE,
        seconds: durationSeconds(state),
        guesses: state.guesses,
        url: `${typeof location !== 'undefined' ? location.origin : ''}${base}play/`,
      }),
    [name, shelf.question, daily, state, base],
  );

  const copy = async (what: 'result' | 'transcript') => {
    const text = what === 'transcript' ? markdown : share;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      if (what === 'transcript') setShowMarkdown(true);
    }
  };

  return (
    <div className="after-voice">
      <pre className="share" data-testid="share">
        {share}
      </pre>
      <div className="after">
        <button type="button" className="button primary" onClick={() => void copy('result')}>
          {copied === 'result' ? 'Copied' : 'Copy result'}
        </button>
        <button type="button" className="button quiet" onClick={() => void copy('transcript')}>
          {copied === 'transcript' ? 'Copied' : 'Copy transcript'}
        </button>
      </div>
      {daily && <NextFigure />}

      <Board daily={daily} state={state} storage={storage} shelf={shelf} entry={entry} />

      <div className="after">
        <button type="button" className="button" onClick={onPlayAgain}>
          Play again
        </button>
        <kbd className="hint">Enter</kbd>
      </div>
      <p className="note">
        The transcript is a markdown page; paste it into this crux’s rounds/ folder and it joins the
        site.{' '}
        <button type="button" className="link" onClick={() => setShowMarkdown((v) => !v)}>
          {showMarkdown ? 'Hide it' : 'Show it'}
        </button>
      </p>
      {showMarkdown && (
        <textarea
          className="markdown"
          readOnly
          value={markdown}
          aria-label="Transcript markdown"
          rows={12}
          onFocus={(e) => e.currentTarget.select()}
        />
      )}
      <p className="note">
        <a href={base}>← {shelf.title}</a>
      </p>
    </div>
  );
}

/** `Next figure in 6h 12m` — UTC midnight, refreshed each minute. Nothing more. */
function NextFigure() {
  const [ms, setMs] = useState(() => msUntilUtcMidnight());
  useEffect(() => {
    const h = setInterval(() => setMs(msUntilUtcMidnight()), 60_000);
    return () => clearInterval(h);
  }, []);
  return (
    <p className="note next" data-testid="next-figure">
      Next figure in {formatCountdown(ms)}
    </p>
  );
}

// ── Today's board ───────────────────────────────────────────────────────────

type BoardStatus =
  | { kind: 'practice' }
  | { kind: 'unpublished' }
  | { kind: 'loading' }
  | { kind: 'signed-out'; board: Leaderboard }
  /** Posted (or found already posted from another browser: `counted` false); `rank` of this name. */
  | { kind: 'posted'; board: Leaderboard; counted: boolean; rank: number | null }
  | { kind: 'error'; message: string };

/**
 * The board lives in the crux's own store (`../lib/leaderboard`): the day's
 * `leaderboard:` key is readable by anyone and written only with a sign-in,
 * under the page's convention of one entry per username. So the page asks
 * for the sign-in before it posts — the page's rule; the store only asks for
 * the token. Signed out, the board still shows; the post waits for the code
 * from the email.
 */
function Board({
  daily,
  state,
  storage,
  shelf,
  entry,
}: {
  daily: boolean;
  state: RoundState;
  storage: KeyValueStorage;
  shelf: Shelf;
  entry: ShelfEntry;
}) {
  const site = useMemo(() => siteConfig(), []);
  const [auth, setAuth] = useState<StoredAuth | null>(() => loadAuth(storage));
  const store = useMemo(() => storeFor(auth?.accessToken ?? null), [auth]);
  const [status, setStatus] = useState<BoardStatus>(() =>
    !daily ? { kind: 'practice' } : !store ? { kind: 'unpublished' } : { kind: 'loading' },
  );
  const day = useMemo(() => utcDay(), []);
  const score = scoreOf(state);
  const seconds = durationSeconds(state);
  const postedRef = useRef(false);

  const post = useCallback(
    async (a: StoredAuth) => {
      if (!store || postedRef.current) return;
      postedRef.current = true;
      setStatus({ kind: 'loading' });
      try {
        // One counted round a day: the visitor's own `played:` record (private
        // to them) says whether another browser already posted today's.
        const already = await readPlayed(store, day);
        let board: Leaderboard;
        if (already) {
          board = await readBoard(store, day);
        } else {
          board = await postScore(store, day, a.name, { score, seconds });
          await markPlayed(store, day, { entry: entry.id, shelf: shelf.id, score, seconds });
        }
        setStatus({ kind: 'posted', board, counted: !already, rank: rankOf(board, a.name) });
      } catch (err) {
        postedRef.current = false;
        if ((err as { status?: number }).status === 401) {
          clearAuth(storage);
          setAuth(null);
          setStatus({ kind: 'signed-out', board: await readBoard(store, day) });
        } else {
          setStatus({ kind: 'error', message: (err as Error).message });
        }
      }
    },
    [store, day, score, seconds, storage, entry.id, shelf.id],
  );

  useEffect(() => {
    if (!daily || !store) return;
    if (auth) {
      void post(auth);
      return;
    }
    let cancelled = false;
    void readBoard(store, day).then((board) => {
      if (!cancelled) setStatus({ kind: 'signed-out', board });
    });
    return () => {
      cancelled = true;
    };
  }, [daily, store, day, auth, post]);

  const onSignedIn = (a: StoredAuth) => {
    saveAuth(storage, a);
    setAuth(a);
  };

  if (status.kind === 'practice') {
    return (
      <p className="note board-note" data-testid="board-note">
        Practice round — today’s board took your first.
      </p>
    );
  }
  if (status.kind === 'unpublished') {
    return (
      <p className="note board-note" data-testid="board-note">
        A daily round; this shelf has no board until it is published.
      </p>
    );
  }
  return (
    <section className="board" data-testid="board">
      <h4>Today</h4>
      {status.kind === 'loading' && (
        <p className="note">
          <Composing />
        </p>
      )}
      {status.kind === 'error' && <p className="note error">{status.message}</p>}
      {status.kind === 'posted' && status.rank !== null && (
        <p className="you" data-testid="your-rank">
          {status.counted
            ? `You are #${status.rank} today.`
            : `Today’s board already has your first round — #${status.rank}.`}
        </p>
      )}
      {(status.kind === 'posted' || status.kind === 'signed-out') && (
        <BoardTable board={status.board} />
      )}
      {status.kind === 'signed-out' && <SignIn site={site} onSignedIn={onSignedIn} />}
    </section>
  );
}

/** The two halves of the score, so the next round has a strategy: fewer misses, or fewer seconds. */
function ScoreLine({ state }: { state: RoundState }) {
  const { accuracy, speed, total } = scoreBreakdown(state);
  const misses = state.guesses.filter((g) => g.correct === false).length;
  return (
    <p className="scoreline" data-testid="score-line">
      <strong>
        {total}/{MAX_SCORE}
      </strong>
      <span className="part">
        {accuracy} accuracy ·{' '}
        {misses === 0 ? 'no misses' : `${misses} miss${misses === 1 ? '' : 'es'}`}
      </span>
      <span className="part">
        {speed} speed · {durationSeconds(state)}s
      </span>
    </p>
  );
}

function BoardTable({ board }: { board: Leaderboard }) {
  const rows = board.entries.slice(0, 10);
  if (rows.length === 0) return <p className="note">No one has played today.</p>;
  return (
    <table className="board-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Name</th>
          <th>Score</th>
          <th>Time</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((e, i) => (
          <tr key={`${e.name}-${i}`}>
            <td>{i + 1}</td>
            <td>{e.name}</td>
            <td>{e.score}</td>
            <td>{clockOf(e.seconds)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SignIn({
  site,
  onSignedIn,
}: {
  site: ReturnType<typeof siteConfig>;
  onSignedIn: (auth: StoredAuth) => void;
}) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      await requestCode(site, email.trim());
      setSent(true);
    } catch (err) {
      setProblem((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const finish = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      const tokens = await login(site, email.trim(), code.trim());
      const { username } = await profile(site, tokens.accessToken); // the name on the board
      onSignedIn({ ...tokens, email: email.trim(), name: username });
    } catch (err) {
      setProblem((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="sign-in" onSubmit={sent ? finish : send} data-testid="sign-in">
      <p className="note">Sign in with your email to join today’s board.</p>
      {!sent ? (
        <div className="row">
          <input
            type="email"
            aria-label="Email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
          <button type="submit" className="button primary" disabled={busy || !email.trim()}>
            Send code
          </button>
        </div>
      ) : (
        <div className="row">
          <input
            type="text"
            inputMode="numeric"
            aria-label="Code"
            placeholder="Code from your email"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
            autoComplete="one-time-code"
          />
          <button type="submit" className="button primary" disabled={busy || !code.trim()}>
            Sign in
          </button>
        </div>
      )}
      {problem && <p className="note error">{problem}</p>}
    </form>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** One column below 720px of the component's own width; the phone layout is the narrow variant. */
function useLayout(ref: React.RefObject<HTMLElement | null>): 'narrow' | 'wide' {
  const [layout, setLayout] = useState<'narrow' | 'wide'>('narrow');
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const apply = () => setLayout(el.getBoundingClientRect().width >= 720 ? 'wide' : 'narrow');
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return layout;
}
