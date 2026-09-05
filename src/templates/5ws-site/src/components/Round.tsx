/**
 * The Round — the play surface of 5Ws, an Astro island (`/play`).
 *
 * Someone is already talking when it opens. Serif for anything with a voice,
 * sans for the interface; points and the clock in sans; ten free questions as
 * a quiet count; a Guess field kept apart from the question because guesses
 * cost and questions don't; Search opens a tab and the clock keeps running;
 * Give up is a shrug. Nothing says where you are in a larger structure. At
 * the end, the reveal is the reward — no confetti.
 *
 * The round runs here, in the visitor's browser, with the AI they connected
 * (first play: "Connect your AI" — one field, one button; the provider is
 * read off the key and the opening line is the validation); the hidden
 * figure lives in client state for the round and goes into every model call
 * as fixed context (ADR 0016).
 * Mobile-first: one column, the voice on top, the question/guess bar at the
 * bottom. The same component is the desktop layout with more room.
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { hiddenFromEntry, parseShelf, pickEntry, type Shelf, type ShelfEntry } from '../game/shelf';
import { durationSeconds, remainingMs, scoreOf, type Guess, type RoundState } from '../game/round';
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

export interface RoundProps {
  /** The Shelf, as `shelf.json` (parsed by this component so a bad shelf says why). */
  shelf: unknown;
  /** The site's base URL (`import.meta.env.BASE_URL`), for the share link. */
  base?: string;
}

export default function Round({ shelf: shelfJson, base = '/' }: RoundProps) {
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
      />
    );
  }

  return (
    <Play
      key={roundNo}
      shelf={parsed.shelf}
      config={config ?? { provider: 'anthropic' }}
      storage={storage}
      base={base}
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
}: {
  shelf: Shelf;
  /** What the last round said about the connection ("That key was refused by …"). */
  problem: string | null;
  /** The refused key, pre-filled so it can be fixed rather than retyped. */
  initialKey: string;
  onConnect: (key: string) => void;
}) {
  const [key, setKey] = useState(initialKey);
  const trimmed = key.trim();
  const provider = detectProvider(trimmed);
  const unknown = trimmed.length > 0 && provider === null;
  // The round's sentence stands until the key is touched
  const showProblem = problem !== null && !unknown && key === initialKey;
  return (
    <div className="round-app connect" data-layout="narrow">
      <h1 className="question voice">{shelf.question}</h1>
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
          <button type="submit" className="primary" disabled={!provider}>
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
  config: ModelConfig;
  storage: KeyValueStorage;
  base: string;
  avoidEntryId: string | null;
  onPlayAgain: (lastEntryId: string) => void;
  onDisconnect: (() => void) | null;
  /** The connection cannot be used: a sentence, and the key it concerned. */
  onModelProblem: (problem: string, key: string) => void;
}

function Play({
  shelf,
  config,
  storage,
  base,
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
      entry={entry}
      daily={daily}
      storage={storage}
      base={base}
      config={config}
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

function LiveRound({
  session,
  shelf,
  entry,
  daily,
  storage,
  base,
  config,
  onPlayAgain,
  onDisconnect,
  onRefused,
}: {
  session: RoundSession;
  shelf: Shelf;
  entry: ShelfEntry;
  daily: boolean;
  storage: KeyValueStorage;
  base: string;
  config: ModelConfig;
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
  const rootRef = useRef<HTMLDivElement>(null);
  const layout = useLayout(rootRef);
  const voiceEndRef = useRef<HTMLDivElement>(null);
  const [question, setQuestion] = useState('');
  const [guessText, setGuessText] = useState('');
  const [confirmGiveUp, setConfirmGiveUp] = useState(false);

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

  const clock = formatClock(remainingMs(state));
  const canAsk = !over && !state.composing && state.questionsLeft > 0;

  return (
    <div
      ref={rootRef}
      className={`round-app${over ? ' is-over' : ''}`}
      data-layout={layout}
      data-status={state.status}
    >
      <header className="round-top">
        <a className="shelf-link" href={base}>
          {shelf.title}
        </a>
        <div className="status" aria-live="off">
          <span className="points" data-testid="points">
            <b>{state.points}</b> {state.points === 1 ? 'point' : 'points'}
          </span>
          <span
            className={`clock${state.composing ? ' paused' : ''}`}
            data-testid="clock"
            data-elapsed={state.elapsedMs}
            data-composing={state.composing ? 'true' : 'false'}
          >
            {clock}
          </span>
          <span className="qleft" data-testid="questions-left">
            {state.questionsLeft} {state.questionsLeft === 1 ? 'question' : 'questions'}
          </span>
        </div>
      </header>

      <section className="round-voice" aria-live="polite">
        <p className="voice opening">
          {state.openingLine || (state.awaiting === 'opening' ? <Composing /> : <em>…</em>)}
        </p>
        {state.turns.map((t, i) => (
          <div className="turn" key={i}>
            <p className="you">
              <strong>You:</strong> {t.question}
            </p>
            <p className="voice">{t.answer ?? <Composing />}</p>
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
        {over && (
          <RevealView
            state={state}
            reveal={snap.reveal}
            revealing={snap.phase !== 'done'}
            daily={daily}
            storage={storage}
            base={base}
            shelf={shelf}
            entry={entry}
            onPlayAgain={onPlayAgain}
          />
        )}
        <div ref={voiceEndRef} />
      </section>

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
              placeholder={state.questionsLeft > 0 ? 'Ask a question' : 'No questions left — guess'}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              disabled={!canAsk}
              autoComplete="off"
              enterKeyHint="send"
            />
            <button type="submit" disabled={!canAsk || !question.trim()}>
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
              />
              <button type="submit" disabled={state.composing || !guessText.trim()}>
                Guess
              </button>
              <span className="cost">costs a point if wrong</span>
            </form>
            <div className="side">
              <button
                type="button"
                className={state.browserOpen ? 'active' : ''}
                onClick={() => (state.browserOpen ? session.closeBrowser() : session.openBrowser())}
              >
                Search
              </button>
              {confirmGiveUp ? (
                <button
                  type="button"
                  className="quiet"
                  onClick={() => session.giveUp()}
                  onBlur={() => setConfirmGiveUp(false)}
                  autoFocus
                >
                  Give up — sure?
                </button>
              ) : (
                <button type="button" className="quiet" onClick={() => setConfirmGiveUp(true)}>
                  Give up
                </button>
              )}
            </div>
          </div>
          {onDisconnect && <Connected config={config} onChange={onDisconnect} />}
        </footer>
      )}

      {over && onDisconnect && <Connected config={config} onChange={onDisconnect} />}
    </div>
  );
}

/** The one thing that moves: whoever is speaking. */
function Composing() {
  return (
    <span className="composing" aria-label="composing">
      <span>·</span>
      <span>·</span>
      <span>·</span>
    </span>
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
        <button type="submit" disabled={!q.trim()}>
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
          <button type="button" className="quiet" onClick={paste}>
            Paste
          </button>
        )}
        <button type="submit" disabled={!isWebUrl(url)}>
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

function RevealView({
  state,
  reveal,
  revealing,
  daily,
  storage,
  base,
  shelf,
  entry,
  onPlayAgain,
}: {
  state: RoundState;
  reveal: Reveal | null;
  revealing: boolean;
  daily: boolean;
  storage: KeyValueStorage;
  base: string;
  shelf: Shelf;
  entry: ShelfEntry;
  onPlayAgain: () => void;
}) {
  const [copied, setCopied] = useState<'transcript' | 'link' | null>(null);
  const [showMarkdown, setShowMarkdown] = useState(false);
  const markdown = useMemo(
    () => (reveal ? renderTranscriptMarkdown(transcriptOf(state, reveal)) : ''),
    [state, reveal],
  );

  const copy = async (what: 'transcript' | 'link') => {
    const text =
      what === 'transcript'
        ? markdown
        : `${typeof location !== 'undefined' ? location.origin : ''}${base}play/`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      if (what === 'transcript') setShowMarkdown(true);
    }
  };

  const outcome =
    state.status === 'won'
      ? null
      : state.status === 'timeUp'
        ? 'Time.'
        : state.status === 'lost'
          ? 'Out of points.'
          : 'You gave up.';

  return (
    <section className="reveal" data-testid="reveal">
      {outcome && <p className="outcome">{outcome}</p>}
      {revealing || !reveal ? (
        <p className="voice">
          <Composing />
        </p>
      ) : (
        <>
          <h3 className="voice who">{reveal.who || `This was ${entry.name}.`}</h3>
          {reveal.whyItMatters && <p className="voice">{reveal.whyItMatters}</p>}
          {reveal.misses.length > 0 && (
            <div className="misses" data-testid="misses">
              <h4>The misses</h4>
              <ul>
                {reveal.misses.map((m, i) => (
                  <li key={i}>
                    <span className="guess-name">{m.guess}</span>
                    <span className="voice why"> — {m.whyReasonable}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {reveal.parting && <p className="voice parting">{reveal.parting}</p>}

          <p className="score">
            {scoreOf(state)} {scoreOf(state) === 1 ? 'point' : 'points'} ·{' '}
            {formatClock(durationSeconds(state) * 1000)} · {state.turns.length}{' '}
            {state.turns.length === 1 ? 'question' : 'questions'}
          </p>

          <Board daily={daily} state={state} storage={storage} shelf={shelf} entry={entry} />

          <div className="after">
            <button type="button" className="primary" onClick={onPlayAgain}>
              Play again
            </button>
            <button type="button" onClick={() => void copy('transcript')}>
              {copied === 'transcript' ? 'Copied' : 'Copy transcript'}
            </button>
            <button type="button" onClick={() => void copy('link')}>
              {copied === 'link' ? 'Copied' : 'Copy link'}
            </button>
          </div>
          <p className="note">
            The transcript is a markdown page; paste it into this crux’s rounds/ folder and it joins
            the site.{' '}
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
        </>
      )}
    </section>
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
          <button type="submit" disabled={busy || !email.trim()}>
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
          <button type="submit" disabled={busy || !code.trim()}>
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
