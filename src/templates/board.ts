import type { TemplateDefinition } from './index';
import { LAYOUT_WORKSHOP } from './index';

const template: TemplateDefinition = {
  context:
    'This is a tutorial crux demonstrating the Crux Store — a persistent key-value store available to every published crux. ' +
    'The board is an interactive canvas where visitors draw strokes. Public store keys hold the shared canvas; protected keys hold per-user layers. ' +
    'Help the user customize colors, tools, layout, or extend the board with new features. The crux.store API is already wired up.',
  greeting:
    "Welcome to **The Board** — a collaborative drawing canvas powered by the Crux Store.\n\n" +
    "Everything drawn on the shared canvas is stored with `crux.store` and persists across visits. " +
    "Try drawing something, then open the **Store** pane to see the data appear in real time.\n\n" +
    "This is a tutorial — feel free to ask me to change colors, add tools, or explain how any part works.",
  layout: LAYOUT_WORKSHOP,
  files: [
    {
      path: 'index.html',
      content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>The Board</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div id="app">
    <header>
      <h1>The Board</h1>
      <div id="toolbar">
        <div id="colors">
          <button class="color-btn active" data-color="#e2e8f0" style="background:#e2e8f0"></button>
          <button class="color-btn" data-color="#4ade80" style="background:#4ade80"></button>
          <button class="color-btn" data-color="#60a5fa" style="background:#60a5fa"></button>
          <button class="color-btn" data-color="#f472b6" style="background:#f472b6"></button>
          <button class="color-btn" data-color="#fbbf24" style="background:#fbbf24"></button>
        </div>
        <div id="sizes">
          <button class="size-btn" data-size="2">S</button>
          <button class="size-btn active" data-size="4">M</button>
          <button class="size-btn" data-size="8">L</button>
        </div>
        <button id="clear-btn">Clear</button>
        <span id="status"></span>
      </div>
    </header>
    <canvas id="canvas"></canvas>
    <footer>
      <span id="stroke-count">0 strokes</span>
      <span class="sep">&middot;</span>
      <span>Powered by <code>crux.store</code></span>
    </footer>
  </div>
  <script src="board.js"></script>
</body>
</html>`,
    },
    {
      path: 'style.css',
      content: `* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  background: #0a0a0a;
  color: #e2e8f0;
  font-family: 'JetBrains Mono', monospace;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
}

#app {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px;
  width: 100%;
  max-width: 800px;
}

header h1 {
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  opacity: 0.6;
  margin-bottom: 8px;
}

#toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

#colors, #sizes {
  display: flex;
  gap: 4px;
}

.color-btn {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  transition: border-color 0.15s;
}

.color-btn.active {
  border-color: #fff;
}

.size-btn {
  padding: 2px 8px;
  font-size: 11px;
  font-family: inherit;
  background: #1a1a2e;
  color: #e2e8f0;
  border: 1px solid #333;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
}

.size-btn.active {
  background: #4ade80;
  color: #0a0a0a;
  border-color: #4ade80;
}

#clear-btn {
  padding: 2px 10px;
  font-size: 11px;
  font-family: inherit;
  background: transparent;
  color: #e2e8f0;
  border: 1px solid #333;
  border-radius: 4px;
  cursor: pointer;
  opacity: 0.5;
  transition: all 0.15s;
}

#clear-btn:hover {
  opacity: 1;
  border-color: #f87171;
  color: #f87171;
}

#status {
  font-size: 10px;
  opacity: 0.4;
}

canvas {
  width: 100%;
  aspect-ratio: 16 / 9;
  background: #111;
  border-radius: 8px;
  cursor: crosshair;
  touch-action: none;
}

footer {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  opacity: 0.35;
}

footer code {
  background: #1a1a2e;
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 10px;
}

.sep { opacity: 0.3; }
`,
    },
    {
      path: 'board.js',
      content: `// The Board — a collaborative canvas powered by crux.store
//
// Public store keys (anyone can read/write):
//   "board.strokes" — array of all strokes on the shared canvas
//
// Each stroke: { color, width, points: [[x,y], ...] }

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const countEl = document.getElementById('stroke-count');

// Hi-DPI support
function resize() {
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * devicePixelRatio;
  canvas.height = rect.height * devicePixelRatio;
  ctx.scale(devicePixelRatio, devicePixelRatio);
  redraw();
}
window.addEventListener('resize', resize);

// State
let strokes = [];
let currentStroke = null;
let color = '#e2e8f0';
let lineWidth = 4;

// ── Drawing ──────────────────────────────────────

function drawStroke(s) {
  if (s.points.length < 2) return;
  ctx.strokeStyle = s.color;
  ctx.lineWidth = s.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(s.points[0][0], s.points[0][1]);
  for (let i = 1; i < s.points.length; i++) {
    ctx.lineTo(s.points[i][0], s.points[i][1]);
  }
  ctx.stroke();
}

function redraw() {
  const rect = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);
  strokes.forEach(drawStroke);
  if (currentStroke) drawStroke(currentStroke);
}

function updateCount() {
  countEl.textContent = strokes.length + ' stroke' + (strokes.length !== 1 ? 's' : '');
}

// ── Pointer events ───────────────────────────────

function getPos(e) {
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX ?? e.touches?.[0]?.clientX ?? 0) - rect.left;
  const y = (e.clientY ?? e.touches?.[0]?.clientY ?? 0) - rect.top;
  return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
}

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  currentStroke = { color, width: lineWidth, points: [getPos(e)] };
});

canvas.addEventListener('pointermove', (e) => {
  if (!currentStroke) return;
  currentStroke.points.push(getPos(e));
  redraw();
});

canvas.addEventListener('pointerup', async () => {
  if (!currentStroke || currentStroke.points.length < 2) {
    currentStroke = null;
    return;
  }
  strokes.push(currentStroke);
  currentStroke = null;
  updateCount();
  redraw();
  await saveStrokes();
});

// ── Toolbar ──────────────────────────────────────

document.querySelectorAll('.color-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelector('.color-btn.active')?.classList.remove('active');
    btn.classList.add('active');
    color = btn.dataset.color;
  });
});

document.querySelectorAll('.size-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelector('.size-btn.active')?.classList.remove('active');
    btn.classList.add('active');
    lineWidth = Number(btn.dataset.size);
  });
});

document.getElementById('clear-btn').addEventListener('click', async () => {
  if (strokes.length === 0) return;
  strokes = [];
  redraw();
  updateCount();
  await saveStrokes();
});

// ── Crux Store integration ───────────────────────
// crux.store is injected automatically by crux.garden
// In preview mode it uses local SQLite; when published it hits the API.

async function loadStrokes() {
  if (!window.crux?.store) {
    statusEl.textContent = 'store not available';
    return;
  }
  statusEl.textContent = 'loading...';
  const saved = await crux.store.get('board.strokes');
  if (Array.isArray(saved)) {
    strokes = saved;
    redraw();
    updateCount();
  }
  statusEl.textContent = '';
}

async function saveStrokes() {
  if (!window.crux?.store) return;
  statusEl.textContent = 'saving...';
  await crux.store.set('board.strokes', strokes);
  statusEl.textContent = 'saved';
  setTimeout(() => { statusEl.textContent = ''; }, 1000);
}

// ── Init ─────────────────────────────────────────

resize();
loadStrokes();
`,
    },
  ],
};

export default template;
