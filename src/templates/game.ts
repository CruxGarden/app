import type { TemplateDefinition } from './index';
import { LAYOUT_WORKSHOP } from './index';

const template: TemplateDefinition = {
  context:
    'This is a simple web game template using HTML Canvas. ' +
    'The user wants to build an interactive game. Help them add gameplay mechanics, scoring, levels, and polish. ' +
    'The starter is a minimal canvas game loop with a movable player and collectibles.',
  greeting:
    "I've set up a simple canvas game with a player you can move around and some coins to collect. Try changing the player speed or adding new objects — the game loop is ready for whatever mechanics you want to build.",
  files: [
    {
      path: 'index.html',
      content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My Game</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div id="game-wrapper">
    <canvas id="game" width="480" height="480"></canvas>
    <div id="hud">
      <span id="score">Score: 0</span>
      <button id="restart">Restart</button>
    </div>
    <p class="hint">Arrow keys or WASD to move</p>
  </div>
  <script src="game.js"></script>
</body>
</html>`,
    },
    {
      path: 'style.css',
      content: `* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  background: #111; color: #eee; font-family: system-ui, sans-serif;
  display: flex; align-items: center; justify-content: center;
  min-height: 100vh;
}
#game-wrapper { text-align: center; }
canvas {
  display: block; border-radius: 8px;
  background: #1a1a2e; image-rendering: pixelated;
}
#hud {
  display: flex; justify-content: space-between; align-items: center;
  padding: 0.75rem 0; font-family: monospace;
}
#score { font-size: 1rem; color: #60a5fa; }
#restart {
  background: none; border: 1px solid #333; color: #888;
  padding: 0.35rem 0.75rem; border-radius: 4px; cursor: pointer;
  font-family: monospace; font-size: 0.8rem;
}
#restart:hover { color: #eee; border-color: #555; }
.hint { color: #444; font-size: 0.75rem; margin-top: 0.25rem; }`,
    },
    {
      path: 'game.js',
      content: `const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const restartBtn = document.getElementById('restart');

const TILE = 24;
const COLS = canvas.width / TILE;
const ROWS = canvas.height / TILE;

let player, coins, score, keys;

function init() {
  player = { x: Math.floor(COLS / 2), y: Math.floor(ROWS / 2) };
  coins = [];
  score = 0;
  keys = {};
  for (let i = 0; i < 5; i++) spawnCoin();
  scoreEl.textContent = 'Score: 0';
}

function spawnCoin() {
  let x, y;
  do {
    x = Math.floor(Math.random() * COLS);
    y = Math.floor(Math.random() * ROWS);
  } while (x === player.x && y === player.y);
  coins.push({ x, y });
}

function update() {
  let dx = 0, dy = 0;
  if (keys['ArrowUp'] || keys['w'] || keys['W']) dy = -1;
  if (keys['ArrowDown'] || keys['s'] || keys['S']) dy = 1;
  if (keys['ArrowLeft'] || keys['a'] || keys['A']) dx = -1;
  if (keys['ArrowRight'] || keys['d'] || keys['D']) dx = 1;

  const nx = Math.max(0, Math.min(COLS - 1, player.x + dx));
  const ny = Math.max(0, Math.min(ROWS - 1, player.y + dy));
  player.x = nx;
  player.y = ny;

  // Collect coins
  coins = coins.filter((c) => {
    if (c.x === player.x && c.y === player.y) {
      score++;
      scoreEl.textContent = 'Score: ' + score;
      spawnCoin();
      return false;
    }
    return true;
  });

  keys = {};
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Grid
  ctx.strokeStyle = '#222';
  for (let x = 0; x <= canvas.width; x += TILE) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
  }
  for (let y = 0; y <= canvas.height; y += TILE) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
  }

  // Coins
  ctx.fillStyle = '#fbbf24';
  for (const c of coins) {
    ctx.beginPath();
    ctx.arc(c.x * TILE + TILE / 2, c.y * TILE + TILE / 2, TILE / 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Player
  ctx.fillStyle = '#60a5fa';
  ctx.fillRect(player.x * TILE + 2, player.y * TILE + 2, TILE - 4, TILE - 4);
}

let lastMove = 0;
function loop(time) {
  if (time - lastMove > 100) { update(); lastMove = time; }
  draw();
  requestAnimationFrame(loop);
}

document.addEventListener('keydown', (e) => {
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d','W','A','S','D'].includes(e.key)) {
    e.preventDefault();
    keys[e.key] = true;
  }
});

restartBtn.addEventListener('click', init);

init();
requestAnimationFrame(loop);`,
    },
  ],
  layout: LAYOUT_WORKSHOP,
};

export default template;
