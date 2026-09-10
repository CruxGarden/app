/** THROWAWAY: Three complete Crux Garden interpretations on /?variant=.
 * Question: can the workspace feel like a place, a cinematic studio, or a notebook?
 * All projects, counts and conversations below are illustrative data. No mutations.
 */
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import './interpretations-prototype.css';

const variants = ['warehouse', 'sunset', 'notebook'] as const;
const names = ['Liminal Warehouse', '80s Sunset', 'Markdown Notebook'];

function Warehouse() {
  return (
    <div className="ip-warehouse">
      <header className="iw-header">
        <a href="/">
          ✳ <b>CRUX GARDEN</b>
        </a>
        <nav>
          <span className="iw-active">Garden</span>
          <span>
            Tending <sup>02</sup>
          </span>
          <span>Growth</span>
        </nav>
        <button>＋ NEW CRUX</button>
      </header>
      <div className="iw-coordinate">
        SECTOR 01 / YOUR GARDEN <span>OPEN SPACE FOR OPEN ENDS</span>
      </div>
      <div className="iw-title">
        <p>AN INTERPRETATION OF POSSIBILITY</p>
        <h1>
          Room
          <br />
          to think<span>_</span>
        </h1>
        <div>
          Nothing here until you make it.
          <br />
          Everything here could become something.
        </div>
      </div>
      <div className="iw-marker iw-marker-one">
        <i>01</i>
        <div>
          THE LISTENING ROOM<span>A place for sounds worth keeping</span>
        </div>
      </div>
      <div className="iw-marker iw-marker-two">
        <i>02</i>
        <div>
          FIELD NOTES<span>Fragments becoming a story</span>
        </div>
      </div>
      <div className="iw-floor">
        <div className="iw-projects">
          <div className="iw-section">
            <span>ON THE FLOOR</span>
            <span>03 CRUXES ↙</span>
          </div>
          <div className="iw-row">
            <small>01</small>
            <strong>The listening room</strong>
            <span>Site Crux</span>
            <b>↗</b>
          </div>
          <div className="iw-row">
            <small>02</small>
            <strong>Field notes</strong>
            <span>Notes concept</span>
            <b>↗</b>
          </div>
          <div className="iw-row">
            <small>03</small>
            <strong>Things that don’t exist yet</strong>
            <span>Sketchbook</span>
            <b>↗</b>
          </div>
        </div>
        <div className="iw-collab">
          <div className="iw-section">
            COLLABORATION <span>↗</span>
          </div>
          <h2>Bring an unfinished idea.</h2>
          <p>A game. A tool. A thought you haven’t found words for.</p>
          <div className="iw-input">
            What are we making?<button aria-label="Start a concept">↗</button>
          </div>
        </div>
      </div>
      <div className="iw-footer">
        <span>LOCAL ROOTS. UNLIMITED DIRECTIONS.</span>
        <span>YOU CAN GROW ANYTHING.</span>
      </div>
    </div>
  );
}

function Sunset() {
  return (
    <div className="ip-sunset">
      <div className="is-scenery" aria-hidden="true">
        <div className="is-sun" />
        <div className="is-range is-range-back" />
        <div className="is-range is-range-front" />
        <div className="is-sea" />
      </div>
      <header className="is-header">
        <a href="/">
          crux garden<span>✳</span>
        </a>
        <nav>
          <span className="is-selected">Your garden</span>
          <span>Tending</span>
          <span>Explore</span>
        </nav>
        <button>＋ Plant an idea</button>
      </header>
      <div className="is-kicker">
        A PLACE FOR YOUR AFTER-HOURS IDEAS <span>INTERPRETATION / 02</span>
      </div>
      <div className="is-title">
        <h1>
          Stay a little
          <br />
          <em>curious.</em>
        </h1>
        <p>
          The day ends. The possibilities don’t.
          <br />
          You can grow anything.
        </p>
      </div>
      <div className="is-horizon-label">SOMEWHERE BETWEEN WHAT IF & WHAT’S NEXT</div>
      <section className="is-workspace">
        <div className="is-workspace-heading">
          <div>
            <b>Your corner of the universe</b>
            <span>Three ideas. No closing time.</span>
          </div>
          <button>View all ↗</button>
        </div>
        <div className="is-projects">
          <article>
            <div className="is-cover is-cover-radio">
              <span>
                FM
                <br />
                <b>98.6</b>
              </span>
              <i>RADIO SILENCE</i>
            </div>
            <div className="is-card-name">
              <h2>Radio silence</h2>
              <span>Music discovery / Site Crux</span>
              <b>↗</b>
            </div>
          </article>
          <article>
            <div className="is-cover is-cover-notes">
              <span>
                POSTCARDS
                <br />
                FROM
                <br />
                <em>nowhere.</em>
              </span>
              <i>VOL. 01 — AN OPEN NOTEBOOK</i>
            </div>
            <div className="is-card-name">
              <h2>Postcards from nowhere</h2>
              <span>Linked notes / Notes concept</span>
              <b>↗</b>
            </div>
          </article>
          <article>
            <div className="is-cover is-cover-orbit">
              <i />
              <span>
                SMALL
                <br />
                ORBITS
              </span>
            </div>
            <div className="is-card-name">
              <h2>Small orbits</h2>
              <span>A game about getting lost</span>
              <b>↗</b>
            </div>
          </article>
        </div>
      </section>
      <div className="is-prompt">
        <span>✳</span>
        <div>
          <small>COLLABORATION</small>
          <p>What’s on your mind tonight?</p>
        </div>
        <button>Start something ↗</button>
      </div>
    </div>
  );
}

function Notebook() {
  const [tab, setTab] = useState('Read');
  return (
    <div className="ip-notebook">
      <aside className="in-sidebar">
        <a href="/" className="in-brand">
          ✳ <b>Crux Garden</b>
        </a>
        <div className="in-space">
          <span>F</span>
          <div>
            Field notes<small>YOUR GARDEN</small>
          </div>
          <b>⌄</b>
        </div>
        <div className="in-search">
          ⌕ <span>Find a thought</span>
          <kbd>⌘ K</kbd>
        </div>
        <nav>
          <a className="in-nav-selected">
            ▤ All notes <small>24</small>
          </a>
          <a>⌁ Connections</a>
          <a>◷ Growth</a>
          <a>
            ✳ Tending <small>2</small>
          </a>
        </nav>
        <div className="in-section-label">
          ARTIFACTS <span>＋</span>
        </div>
        <div className="in-tree">
          <p>⌄ &nbsp; Field notes</p>
          <a className="in-file-selected">▧ &nbsp; A garden of unfinished ideas</a>
          <a>▧ &nbsp; Things worth noticing</a>
          <a>▧ &nbsp; Places that feel like something</a>
          <a>▧ &nbsp; A small theory of play</a>
          <p>⌄ &nbsp; Projects</p>
          <a>▧ &nbsp; The listening room</a>
          <a>▧ &nbsp; A map of nowhere</a>
          <p>› &nbsp; Clippings</p>
          <p>› &nbsp; Daily notes</p>
        </div>
        <div className="in-sidebar-bottom">
          <span>◉ Stored on your computer</span>
          <button>＋ New note</button>
        </div>
      </aside>
      <main className="in-main">
        <header className="in-topbar">
          <div>
            Field notes <span>/</span> A garden of unfinished ideas
          </div>
          <span>☆ &nbsp; ◧ &nbsp; ···</span>
        </header>
        <div className="in-tabs">
          <span>
            ▧ &nbsp; A garden of unfinished ideas <small>×</small>
          </span>
          <span>
            ▧ &nbsp; The listening room <small>×</small>
          </span>
          <button>＋</button>
        </div>
        <div className="in-document-toolbar">
          <span>MARKDOWN · FIELD NOTES</span>
          <div>
            {['Read', 'Source'].map((t) => (
              <button key={t} className={tab === t ? 'selected' : ''} onClick={() => setTab(t)}>
                {t}
              </button>
            ))}
          </div>
        </div>
        <article className="in-document">
          <div className="in-tags">
            <span>thinking in public</span>
            <span>beginnings</span>
          </div>
          <h1>
            A garden of
            <br />
            unfinished ideas<span>.</span>
          </h1>
          <p className="in-lead">
            A place to leave a thought long enough
            <br />
            for something to grow around it.
          </p>
          <div className="in-rule" />
          {tab === 'Source' ? (
            <pre>
              {
                '# A garden of unfinished ideas\n\nNot everything needs to become a project today.\n\n## Things I keep coming back to\n- [[The listening room]]\n- [[A map of nowhere]]\n\n> What if the notebook was part of the making?'
              }
            </pre>
          ) : (
            <>
              <p>
                Not everything needs to become a project today. Some things can be a sentence, a
                question, a link to <a>something else</a>.
              </p>
              <p>
                Keep it here. Connect it to <a>The listening room</a>. Come back when the shape of
                it changes.
              </p>
              <h2>Things I keep coming back to</h2>
              <ul>
                <li>The feeling of an empty building just before someone arrives.</li>
                <li>Software that has a point of view.</li>
                <li>
                  <a>A map of nowhere</a> — perhaps this is a game.
                </li>
              </ul>
              <blockquote>What if the notebook was part of the making?</blockquote>
              <div className="in-next">
                <small>NEXT THOUGHT</small>
                <span>Turn a fragment into something you can share. ↗</span>
              </div>
            </>
          )}
        </article>
        <footer className="in-doc-footer">
          <span>Markdown, all the way down.</span>
          <span>24 notes · 38 connections</span>
        </footer>
      </main>
      <aside className="in-context">
        <div className="in-context-tabs">
          <b>Connections</b>
          <span>Outline</span>
        </div>
        <div className="in-graph">
          <svg viewBox="0 0 260 200" aria-label="Illustrative linked notes graph">
            <g stroke="#cad3c8" strokeWidth="1">
              <path d="M120 100 42 50M120 100 220 55M120 100 204 146M120 100 65 162M42 50 155 27M155 27 220 55M65 162 25 110M204 146 229 190M120 100 155 27" />
            </g>
            <g fill="#aab8a3">
              <circle cx="42" cy="50" r="5" />
              <circle cx="220" cy="55" r="6" />
              <circle cx="204" cy="146" r="5" />
              <circle cx="65" cy="162" r="6" />
              <circle cx="155" cy="27" r="4" />
              <circle cx="25" cy="110" r="3" />
              <circle cx="229" cy="190" r="3" />
            </g>
            <circle cx="120" cy="100" r="8" fill="#536e45" />
            <text x="103" y="123">
              This note
            </text>
            <text x="16" y="39">
              Places
            </text>
            <text x="168" y="41">
              Listening room
            </text>
            <text x="15" y="185">
              Small theory of play
            </text>
          </svg>
        </div>
        <div className="in-context-label">
          LINKED MENTIONS <span>3</span>
        </div>
        <div className="in-mention">
          <h3>The listening room</h3>
          <p>
            …a place for an <mark>unfinished idea</mark> to become something you can hear.
          </p>
        </div>
        <div className="in-mention">
          <h3>Places that feel like something</h3>
          <p>
            An empty warehouse. A sunset. <mark>A garden</mark> that isn’t a garden.
          </p>
        </div>
        <div className="in-mention">
          <h3>Daily notes / September 10</h3>
          <p>Maybe the interface is part of the idea.</p>
        </div>
        <div className="in-assistant">
          <span>✳ COLLABORATION</span>
          <h3>Follow a thread.</h3>
          <p>Explore a connection, develop a fragment, or turn this note into a Crux.</p>
          <button>Think this through ↗</button>
        </div>
      </aside>
    </div>
  );
}

export default function InterpretationsPrototype() {
  const [params, setParams] = useSearchParams();
  const index = Math.max(0, variants.indexOf(params.get('variant') as (typeof variants)[number]));
  function cycle(direction: number) {
    setParams(
      { variant: variants[(index + direction + variants.length) % variants.length]! },
      { replace: true },
    );
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,textarea,[contenteditable]')) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        cycle(-1);
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        cycle(1);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });
  return (
    <div className="interpretations-prototype">
      {index === 0 ? <Warehouse /> : index === 1 ? <Sunset /> : <Notebook />}
      <div className="ip-switcher">
        <button onClick={() => cycle(-1)} aria-label="Previous interpretation">
          ←
        </button>
        <span>
          <b>{names[index]}</b>
          <small>VISUAL STUDY · SAMPLE CONTENT</small>
        </span>
        <button onClick={() => cycle(1)} aria-label="Next interpretation">
          →
        </button>
      </div>
    </div>
  );
}
