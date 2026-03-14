import type { TemplateDefinition } from './index';
import { LAYOUT_WORKSHOP } from './index';

const template: TemplateDefinition = {
  context:
    'This is a conspiracy board / evidence wall template. A corkboard background with pinned clues, photos, and red strings connecting them. ' +
    'The content lives in config.json — the user edits via the form view. ' +
    'render.js reads config.json and draws cards with SVG connections. Help them build their theory.',
  greeting:
    "I've set up a conspiracy board — cork background, pushpins, red string, the works. " +
    "Switch to the Form tab on config.json to add your clues and connections. Remember: it's not paranoia if the strings actually connect.",
  schema: {
    fields: [
      { key: 'title', label: 'Board Title', type: 'text', placeholder: 'OPERATION MISSING CHEESE' },
      { key: 'subtitle', label: 'Subtitle', type: 'text', placeholder: 'THEY KNOW. WE KNOW. THE CHEESE KNOWS.' },
      {
        key: 'clues',
        label: 'Clues',
        type: 'repeater',
        fields: [
          { key: 'title', label: 'Title', type: 'text', placeholder: 'Suspicious cheese shortage' },
          { key: 'note', label: 'Note', type: 'textarea', placeholder: 'The deli has been "out of gouda" for 3 weeks...' },
          {
            key: 'type',
            label: 'Card Type',
            type: 'select',
            options: [
              { label: 'Note (yellow)', value: 'note' },
              { label: 'Evidence (white)', value: 'evidence' },
              { label: 'Suspect (red)', value: 'suspect' },
              { label: 'Key Finding (green)', value: 'key' },
            ],
          },
        ],
      },
    ],
  },
  files: [
    {
      path: 'index.html',
      content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Conspiracy Board</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div class="board">
    <h1 id="board-title" class="board-title"></h1>
    <p id="board-subtitle" class="board-subtitle"></p>
    <svg id="strings" class="strings"></svg>
    <div id="clues" class="clues"></div>
  </div>
  <script src="render.js"></script>
</body>
</html>`,
    },
    {
      path: 'style.css',
      content: `@import url('https://fonts.googleapis.com/css2?family=Special+Elite&family=Permanent+Marker&display=swap');

* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  min-height: 100vh;
  background: #8B6914;
  font-family: 'Special Elite', monospace;
}
.board {
  min-height: 100vh; padding: 2rem;
  background:
    repeating-linear-gradient(0deg, transparent, transparent 19px, rgba(0,0,0,0.03) 19px, rgba(0,0,0,0.03) 20px),
    repeating-linear-gradient(90deg, transparent, transparent 19px, rgba(0,0,0,0.03) 19px, rgba(0,0,0,0.03) 20px),
    linear-gradient(135deg, #a0824a 0%, #8B6914 30%, #9a7b3c 60%, #7a5c10 100%);
  position: relative;
  overflow: hidden;
}
.board::before {
  content: '';
  position: absolute; inset: 0;
  background: url("data:image/svg+xml,%3Csvg width='100' height='100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence baseFrequency='0.9' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100' height='100' filter='url(%23n)' opacity='0.08'/%3E%3C/svg%3E");
  pointer-events: none;
}
.board-title {
  font-family: 'Permanent Marker', cursive;
  font-size: 2rem; color: #f5f5dc;
  text-align: center; text-transform: uppercase;
  text-shadow: 2px 2px 4px rgba(0,0,0,0.5);
  margin-bottom: 0.25rem;
  position: relative;
}
.board-subtitle {
  text-align: center; color: #ddd;
  font-size: 0.85rem; margin-bottom: 2rem;
  opacity: 0.7; letter-spacing: 2px;
  text-transform: uppercase;
}
.strings {
  position: absolute; inset: 0;
  width: 100%; height: 100%;
  pointer-events: none; z-index: 1;
}
.strings line {
  stroke: #cc2222; stroke-width: 1.5;
  opacity: 0.6; stroke-dasharray: none;
}
.clues {
  display: flex; flex-wrap: wrap;
  gap: 1.5rem; justify-content: center;
  position: relative; z-index: 2;
}
.clue-card {
  width: 200px; padding: 1.25rem 1rem 1rem;
  position: relative;
  box-shadow: 3px 3px 8px rgba(0,0,0,0.3);
  transform: rotate(var(--rot, 0deg));
  transition: transform 0.2s;
}
.clue-card:hover { transform: rotate(0deg) scale(1.05); z-index: 10; }
.clue-card.note { background: #fef3a0; color: #333; }
.clue-card.evidence { background: #f5f5f5; color: #222; }
.clue-card.suspect { background: #ffcccc; color: #4a0000; }
.clue-card.key { background: #ccffcc; color: #003300; }
/* Pushpin */
.clue-card::before {
  content: '';
  position: absolute; top: -6px; left: 50%; transform: translateX(-50%);
  width: 14px; height: 14px; border-radius: 50%;
  background: radial-gradient(circle at 40% 35%, #ff4444, #aa0000);
  box-shadow: 0 2px 4px rgba(0,0,0,0.4);
  z-index: 3;
}
.clue-title {
  font-family: 'Permanent Marker', cursive;
  font-size: 0.95rem; margin-bottom: 0.5rem;
  border-bottom: 1px solid rgba(0,0,0,0.15);
  padding-bottom: 0.4rem;
}
.clue-note {
  font-size: 0.8rem; line-height: 1.5;
  white-space: pre-wrap;
}
.stamp {
  position: absolute; bottom: -10px; right: -10px;
  font-size: 2.5rem; opacity: 0.15;
  transform: rotate(15deg);
  font-family: 'Permanent Marker', cursive;
  color: red;
  pointer-events: none;
}`,
    },
    {
      path: 'config.json',
      content: JSON.stringify(
        {
          title: 'OPERATION MISSING CHEESE',
          subtitle: 'THEY KNOW. WE KNOW. THE CHEESE KNOWS.',
          clues: [
            { title: 'The Shortage', note: 'Deli has been "out of gouda" for 3 weeks. Coincidence? I think NOT.', type: 'evidence' },
            { title: 'The Rat', note: 'Spotted a man in a trench coat buying 47 blocks of cheddar at 3am.', type: 'suspect' },
            { title: 'The Connection', note: 'ALL local pizzerias switched to "cheese blend" on the SAME DAY.', type: 'key' },
            { title: 'My Theory', note: 'Someone is building a cheese fortress. Underground. Possibly under the library.', type: 'note' },
          ],
        },
        null,
        2,
      ),
    },
    {
      path: 'render.js',
      content: `fetch('./config.json')
  .then(r => r.json())
  .then(data => {
    document.getElementById('board-title').textContent = data.title || 'THE BOARD';
    document.getElementById('board-subtitle').textContent = data.subtitle || '';

    const container = document.getElementById('clues');
    container.innerHTML = '';

    const cards = [];
    for (const [i, clue] of (data.clues || []).entries()) {
      const card = document.createElement('div');
      card.className = 'clue-card ' + (clue.type || 'note');
      const rot = (Math.random() - 0.5) * 8;
      card.style.setProperty('--rot', rot + 'deg');

      let html = '<div class="clue-title">' + escapeHtml(clue.title || 'Clue #' + (i + 1)) + '</div>';
      html += '<div class="clue-note">' + escapeHtml(clue.note || '') + '</div>';
      if (clue.type === 'suspect') html += '<div class="stamp">SUSPECT</div>';
      if (clue.type === 'key') html += '<div class="stamp">KEY</div>';
      card.innerHTML = html;
      container.appendChild(card);
      cards.push(card);
    }

    // Draw red strings between adjacent cards
    requestAnimationFrame(() => {
      const svg = document.getElementById('strings');
      svg.innerHTML = '';
      for (let i = 0; i < cards.length - 1; i++) {
        const a = cards[i].getBoundingClientRect();
        const b = cards[i + 1].getBoundingClientRect();
        const boardRect = svg.getBoundingClientRect();
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', String(a.left + a.width / 2 - boardRect.left));
        line.setAttribute('y1', String(a.top + 4 - boardRect.top));
        line.setAttribute('x2', String(b.left + b.width / 2 - boardRect.left));
        line.setAttribute('y2', String(b.top + 4 - boardRect.top));
        svg.appendChild(line);
      }
    });
  })
  .catch(err => console.warn('render.js:', err));

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}`,
    },
  ],
  layout: LAYOUT_WORKSHOP,
};

export default template;
