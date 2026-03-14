import type { TemplateDefinition } from './index';
import { LAYOUT_WORKSHOP } from './index';

const template: TemplateDefinition = {
  context:
    'This is a mystical fortune teller page with a crystal ball, tarot-style readings, and mysterious predictions. ' +
    'The content lives in config.json — the user edits via the form view. ' +
    'render.js reads config.json and builds the mystical layout. Help them write cryptic, dramatic fortunes.',
  greeting:
    "I've set up a mystical fortune teller page — crystal ball, star field, glowing text, the full vibe. " +
    "Switch to the Form tab on config.json to write your fortunes and customize the mystic's identity. " +
    "The spirits are ready.",
  schema: {
    fields: [
      { key: 'mysticName', label: 'Mystic Name', type: 'text', placeholder: 'Madame Zoltara' },
      { key: 'tagline', label: 'Tagline', type: 'text', placeholder: 'Seer of Socks, Prophet of Parking Spots' },
      { key: 'crystalBallMessage', label: 'Crystal Ball Message', type: 'text', placeholder: 'The vibes are... concerning' },
      { key: 'accentColor', label: 'Mystic Glow Color', type: 'color' },
      {
        key: 'fortunes',
        label: 'Fortunes',
        type: 'repeater',
        fields: [
          { key: 'category', label: 'Category', type: 'text', placeholder: 'Love / Career / Snacks' },
          { key: 'prediction', label: 'Prediction', type: 'textarea', placeholder: 'You will find a french fry in your coat pocket. It will change everything.' },
          { key: 'stars', label: 'Star Rating (1-5)', type: 'number' },
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
  <title>Fortune Teller</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <canvas id="stars"></canvas>
  <div class="container">
    <h1 id="mystic-name" class="mystic-name"></h1>
    <p id="tagline" class="tagline"></p>
    <div class="crystal-ball">
      <div class="ball">
        <div class="mist"></div>
        <p id="ball-message" class="ball-message"></p>
      </div>
      <div class="base"></div>
    </div>
    <div id="fortunes" class="fortunes"></div>
    <p class="disclaimer">For entertainment purposes only. Madame Zoltara is not responsible for any french fries found or not found.</p>
  </div>
  <script src="render.js"></script>
</body>
</html>`,
    },
    {
      path: 'style.css',
      content: `@import url('https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@400;700&family=Crimson+Text:ital@1&display=swap');

* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  min-height: 100vh;
  background: #0a0012;
  color: #e8dff5;
  font-family: 'Crimson Text', serif;
  overflow-x: hidden;
  position: relative;
}
#stars {
  position: fixed; inset: 0;
  pointer-events: none; z-index: 0;
}
.container {
  position: relative; z-index: 1;
  max-width: 600px; margin: 0 auto;
  padding: 3rem 1.5rem; text-align: center;
}
.mystic-name {
  font-family: 'Cinzel Decorative', serif;
  font-size: 2.2rem;
  background: linear-gradient(135deg, var(--glow, #b388ff), #ffab40, var(--glow, #b388ff));
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  background-clip: text;
  margin-bottom: 0.25rem;
}
.tagline {
  font-style: italic; opacity: 0.6;
  font-size: 0.95rem; margin-bottom: 2.5rem;
  letter-spacing: 1px;
}
.crystal-ball {
  display: flex; flex-direction: column;
  align-items: center; margin-bottom: 2.5rem;
}
.ball {
  width: 180px; height: 180px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, rgba(200,180,255,0.15), rgba(80,40,120,0.4) 50%, rgba(20,0,40,0.8));
  border: 2px solid rgba(180,140,255,0.2);
  box-shadow:
    0 0 40px rgba(var(--glow-rgb, 179,136,255), 0.3),
    inset 0 0 30px rgba(var(--glow-rgb, 179,136,255), 0.15);
  display: flex; align-items: center; justify-content: center;
  position: relative; overflow: hidden;
}
.mist {
  position: absolute; inset: 0;
  background: radial-gradient(circle at 50% 50%, rgba(180,140,255,0.1), transparent 60%);
  animation: pulse 4s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 0.3; transform: scale(1); }
  50% { opacity: 0.8; transform: scale(1.1); }
}
.ball-message {
  font-family: 'Cinzel Decorative', serif;
  font-size: 0.85rem;
  color: rgba(220,200,255,0.9);
  text-align: center; padding: 1.5rem;
  position: relative; z-index: 1;
  text-shadow: 0 0 10px rgba(var(--glow-rgb, 179,136,255), 0.5);
}
.base {
  width: 80px; height: 20px;
  background: linear-gradient(180deg, #2a1a3a, #1a0a2a);
  border-radius: 0 0 40px 40px;
  border: 1px solid rgba(180,140,255,0.15);
  border-top: none;
}
.fortunes { display: flex; flex-direction: column; gap: 1.25rem; }
.fortune-card {
  background: rgba(40,20,60,0.6);
  border: 1px solid rgba(180,140,255,0.15);
  border-radius: 12px; padding: 1.25rem;
  text-align: left;
  backdrop-filter: blur(8px);
}
.fortune-category {
  font-family: 'Cinzel Decorative', serif;
  font-size: 0.8rem; text-transform: uppercase;
  letter-spacing: 3px; color: var(--glow, #b388ff);
  margin-bottom: 0.5rem;
}
.fortune-prediction {
  font-style: italic; font-size: 1.05rem;
  line-height: 1.6; opacity: 0.85;
}
.fortune-stars {
  margin-top: 0.5rem; font-size: 0.9rem;
  color: #ffab40;
}
.disclaimer {
  margin-top: 3rem; font-size: 0.7rem;
  opacity: 0.3; font-style: italic;
}`,
    },
    {
      path: 'config.json',
      content: JSON.stringify(
        {
          mysticName: 'Madame Zoltara',
          tagline: 'Seer of Socks, Prophet of Parking Spots',
          crystalBallMessage: 'The vibes are... concerning',
          accentColor: '#b388ff',
          fortunes: [
            { category: 'Love', prediction: 'You will make intense eye contact with a stranger. It will be a cat.', stars: 4 },
            { category: 'Career', prediction: 'A spreadsheet will bring you unexpected joy. Do not question this.', stars: 3 },
            { category: 'Snacks', prediction: 'You will find a french fry in your coat pocket. It will change everything.', stars: 5 },
            { category: 'Mystery', prediction: 'Something you lost in 2019 will reappear. You will have more questions than answers.', stars: 2 },
          ],
        },
        null,
        2,
      ),
    },
    {
      path: 'render.js',
      content: `// Twinkling star background
const canvas = document.getElementById('stars');
const ctx = canvas.getContext('2d');
let stars = [];

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  stars = Array.from({ length: 120 }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    r: Math.random() * 1.5 + 0.3,
    phase: Math.random() * Math.PI * 2,
    speed: Math.random() * 0.02 + 0.005,
  }));
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

function drawStars(time) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const s of stars) {
    const alpha = 0.3 + 0.7 * ((Math.sin(time * s.speed + s.phase) + 1) / 2);
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(220,200,255,' + alpha + ')';
    ctx.fill();
  }
  requestAnimationFrame(drawStars);
}
requestAnimationFrame(drawStars);

// Render fortunes
fetch('./config.json')
  .then(r => r.json())
  .then(data => {
    document.getElementById('mystic-name').textContent = data.mysticName || 'The Oracle';
    document.getElementById('tagline').textContent = data.tagline || '';
    document.getElementById('ball-message').textContent = data.crystalBallMessage || '...';

    if (data.accentColor) {
      document.documentElement.style.setProperty('--glow', data.accentColor);
      // Parse hex to RGB for box-shadow
      const hex = data.accentColor.replace('#', '');
      const r = parseInt(hex.substring(0, 2), 16) || 179;
      const g = parseInt(hex.substring(2, 4), 16) || 136;
      const b = parseInt(hex.substring(4, 6), 16) || 255;
      document.documentElement.style.setProperty('--glow-rgb', r + ',' + g + ',' + b);
    }

    const container = document.getElementById('fortunes');
    container.innerHTML = '';

    for (const f of data.fortunes || []) {
      const card = document.createElement('div');
      card.className = 'fortune-card';

      let html = '<div class="fortune-category">' + escapeHtml(f.category || '???') + '</div>';
      html += '<div class="fortune-prediction">' + escapeHtml(f.prediction || 'The stars are silent.') + '</div>';
      const starCount = Math.max(0, Math.min(5, f.stars || 0));
      if (starCount > 0) {
        html += '<div class="fortune-stars">' + '\u2605'.repeat(starCount) + '\u2606'.repeat(5 - starCount) + '</div>';
      }
      card.innerHTML = html;
      container.appendChild(card);
    }
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
