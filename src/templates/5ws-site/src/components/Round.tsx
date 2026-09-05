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
 * (first play: "Connect your AI"); the hidden figure lives in client state
 * for the round and goes into every model call as fixed context (ADR 0016).
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
  injectedModel,
  modelFor,
  providerInfo,
  temperatureFor,
  validateConfig,
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
  type ProviderId,
  type StoredAuth,
} from '../lib/local-state';
import {
  board as fetchBoard,
  clockOf,
  login,
  postScore,
  requestCode,
  siteConfig,
  type Leaderboard,
} from '../lib/leaderboard';
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
  const [connectProblem, setConnectProblem] = useState<string | null>(null);
  const [roundNo, setRoundNo] = useState(1);
  const [lastEntryId, setLastEntryId] = useState<string | null>(null);
  const injected = injectedModel() !== null;

  if (!parsed.shelf) {
    return (
      <div className="round-app" data-layout="narrow">
        <p className="note error">This shelf cannot be read: {parsed.problem}</p>
      </div>
    );
  }

  const connect = (next: ModelConfig) => {
    try {
      modelFor(next); // throws with a sentence when it cannot be built
      saveModelConfig(storage, next);
      setConfig(next);
      setConnectProblem(null);
    } catch (err) {
      setConnectProblem((err as Error).message);
    }
  };
  const disconnect = () => {
    clearModelConfig(storage);
    setConfig(null);
  };

  if (!injected && !config) {
    return (
      <ConnectAi
        shelf={parsed.shelf}
        problem={connectProblem}
        onConnect={connect}
        onCancel={null}
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
      onModelProblem={(problem) => {
        setConnectProblem(problem);
        if (!injected) disconnect();
      }}
    />
  );
}

// ── Connect your AI ─────────────────────────────────────────────────────────

function ConnectAi({
  shelf,
  problem,
  onConnect,
  onCancel,
}: {
  shelf: Shelf;
  problem: string | null;
  onConnect: (config: ModelConfig) => void;
  onCancel: (() => void) | null;
}) {
  const [provider, setProvider] = useState<ProviderId>('anthropic');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const info = providerInfo(provider);
  const draft: ModelConfig = {
    provider,
    apiKey: apiKey.trim() || undefined,
    model: model.trim() || undefined,
  };
  const invalid = validateConfig(draft);
  return (
    <div className="round-app connect" data-layout="narrow">
      <h1 className="question voice">{shelf.question}</h1>
      <form
        className="connect-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!invalid) onConnect(draft);
        }}
      >
        <h2>Connect your AI</h2>
        <p className="how">
          The round runs here in your browser with your own key. It goes to{' '}
          {info?.label ?? 'the provider'} and nowhere else; this page never sees it again once it is
          stored here.
        </p>
        <label className="field">
          <span>Provider</span>
          <select value={provider} onChange={(e) => setProvider(e.target.value as ProviderId)}>
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Key</span>
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={info?.keyHint ?? ''}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Model</span>
          <input
            type="text"
            placeholder={info?.defaultModel ?? ''}
            value={model}
            onChange={(e) => setModel(e.target.value)}
          />
        </label>
        {problem && <p className="note error">{problem}</p>}
        <div className="actions">
          <button type="submit" className="primary" disabled={!!invalid}>
            Play
          </button>
          {onCancel && (
            <button type="button" onClick={onCancel}>
              Back
            </button>
          )}
        </div>
        {info && (
          <p className="note">
            <a href={info.keysUrl} target="_blank" rel="noopener noreferrer">
              Get a {info.label} key
            </a>
          </p>
        )}
      </form>
    </div>
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
  onModelProblem: (problem: string) => void;
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
  const daily = useMemo(() => dailyAvailable(storage, shelf.id), [storage, shelf.id]);
  const entry = useMemo(
    () => (daily ? pickEntry(shelf, utcDay()) : pickPractice(shelf, avoidEntryId)),
    [daily, shelf, avoidEntryId],
  );
  const [session, sessionProblem] = useMemo(() => {
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
    if (sessionProblem) onModelProblem(sessionProblem);
  }, [sessionProblem, onModelProblem]);

  if (!session) return null;
  return (
    <LiveRound
      session={session}
      shelf={shelf}
      entry={entry}
      daily={daily}
      storage={storage}
      base={base}
      onPlayAgain={() => onPlayAgain(entry.id)}
      onDisconnect={onDisconnect}
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
  onPlayAgain,
  onDisconnect,
}: {
  session: RoundSession;
  shelf: Shelf;
  entry: ShelfEntry;
  daily: boolean;
  storage: KeyValueStorage;
  base: string;
  onPlayAgain: () => void;
  onDisconnect: (() => void) | null;
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
          {state.openingLine ||
            (state.awaiting === 'opening' ? <Composing /> : <em>…</em>)}
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
        </footer>
      )}

      {over && onDisconnect && (
        <p className="round-foot">
          <button type="button" className="link" onClick={onDisconnect}>
            Connect a different AI
          </button>
        </p>
      )}
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

          <Board daily={daily} state={state} storage={storage} />

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
  | { kind: 'signed-out'; board: Leaderboard | null }
  | { kind: 'posted'; board: Leaderboard }
  | { kind: 'error'; message: string };

function Board({
  daily,
  state,
  storage,
}: {
  daily: boolean;
  state: RoundState;
  storage: KeyValueStorage;
}) {
  const site = useMemo(() => siteConfig(), []);
  const [auth, setAuth] = useState<StoredAuth | null>(() => loadAuth(storage));
  const [status, setStatus] = useState<BoardStatus>(() =>
    !daily ? { kind: 'practice' } : !site.cruxId ? { kind: 'unpublished' } : { kind: 'loading' },
  );
  const score = scoreOf(state);
  const seconds = durationSeconds(state);
  const postedRef = useRef(false);

  const post = useCallback(
    async (a: StoredAuth) => {
      if (postedRef.current) return;
      postedRef.current = true;
      setStatus({ kind: 'loading' });
      try {
        const board = await postScore(site, a.accessToken, { score, seconds });
        if (board) setStatus({ kind: 'posted', board });
        else setStatus({ kind: 'unpublished' });
      } catch (err) {
        postedRef.current = false;
        const status = (err as { status?: number }).status;
        if (status === 401) {
          clearAuth(storage);
          setAuth(null);
          setStatus({ kind: 'signed-out', board: null });
        } else {
          setStatus({ kind: 'error', message: (err as Error).message });
        }
      }
    },
    [site, score, seconds, storage],
  );

  useEffect(() => {
    if (!daily || !site.cruxId) return;
    if (auth) {
      void post(auth);
      return;
    }
    let cancelled = false;
    fetchBoard(site)
      .then((board) => {
        if (!cancelled) setStatus({ kind: 'signed-out', board });
      })
      .catch(() => {
        if (!cancelled) setStatus({ kind: 'signed-out', board: null });
      });
    return () => {
      cancelled = true;
    };
  }, [daily, site, auth, post]);

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
      {status.kind === 'posted' && status.board.you && (
        <p className="you" data-testid="your-rank">
          {status.board.you.counted
            ? `You are #${status.board.you.rank} today.`
            : `Today’s board already has your first round — #${status.board.you.rank}.`}
        </p>
      )}
      {(status.kind === 'posted' || status.kind === 'signed-out') && status.board && (
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
      onSignedIn({ ...tokens, email: email.trim() });
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

