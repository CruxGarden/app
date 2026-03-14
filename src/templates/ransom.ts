import type { TemplateDefinition } from './index';
import { LAYOUT_WORKSHOP } from './index';

const template: TemplateDefinition = {
  context:
    'This is a ransom-note style message page. Letters look cut from magazines with random fonts, sizes, rotations, and colors. ' +
    'The content lives in config.json — the user edits via the form view. ' +
    'render.js reads config.json and builds jumbled letter spans. Help them write threatening-but-funny messages.',
  greeting:
    "I've set up a ransom note page — every letter gets a random font, size, color, and rotation like it was snipped from a magazine. " +
    "Switch to the Form tab on config.json to write your message. The weirder, the better.",
  schema: {
    fields: [
      { key: 'headline', label: 'Headline', type: 'text', placeholder: 'WE HAVE YOUR SOCKS' },
      { key: 'message', label: 'Message', type: 'textarea', placeholder: 'If you ever want to see them again...' },
      { key: 'demand', label: 'The Demand', type: 'text', placeholder: 'Leave 3 pizzas at the park bench by midnight' },
      { key: 'signature', label: 'Signature', type: 'text', placeholder: '— The Sock Liberation Front' },
      { key: 'paperColor', label: 'Paper Color', type: 'color' },
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
  <title>Ransom Note</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div class="paper">
    <div id="headline" class="headline"></div>
    <div id="message" class="message"></div>
    <div id="demand" class="demand"></div>
    <div id="signature" class="signature"></div>
  </div>
  <script src="render.js"></script>
</body>
</html>`,
    },
    {
      path: 'style.css',
      content: `@import url('https://fonts.googleapis.com/css2?family=Courier+Prime&family=Permanent+Marker&family=Special+Elite&family=Rock+Salt&family=Creepster&family=Rubik+Mono+One&family=Bungee+Shade&display=swap');

* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  min-height: 100vh;
  display: flex; align-items: center; justify-content: center;
  background: #2a2a2a;
  background-image: repeating-linear-gradient(
    45deg, transparent, transparent 35px,
    rgba(0,0,0,0.05) 35px, rgba(0,0,0,0.05) 70px
  );
  padding: 2rem;
}
.paper {
  max-width: 600px; width: 100%;
  background: var(--paper, #f4e8c1);
  padding: 3rem 2.5rem;
  box-shadow: 4px 4px 20px rgba(0,0,0,0.5), inset 0 0 60px rgba(0,0,0,0.1);
  transform: rotate(-1deg);
  position: relative;
}
.paper::before {
  content: '';
  position: absolute; top: 8px; left: 8px; right: 8px; bottom: 8px;
  border: 2px dashed rgba(0,0,0,0.1);
  pointer-events: none;
}
.headline { margin-bottom: 2rem; text-align: center; }
.message { margin-bottom: 2rem; line-height: 2.2; }
.demand {
  margin-bottom: 1.5rem; text-align: center;
  padding: 1rem; background: rgba(255,0,0,0.08);
  border: 2px solid rgba(255,0,0,0.2);
}
.signature { text-align: right; margin-top: 1rem; }
.letter {
  display: inline-block;
  padding: 1px 2px;
  transition: transform 0.1s;
}
.letter:hover { transform: scale(1.3) !important; }`,
    },
    {
      path: 'config.json',
      content: JSON.stringify(
        {
          headline: 'WE HAVE YOUR SOCKS',
          message: 'If you ever want to see them again, you will follow our instructions VERY carefully. Do NOT contact the laundromat.',
          demand: 'Leave 3 pizzas at the park bench by midnight. No pineapple.',
          signature: '— The Sock Liberation Front',
          paperColor: '#f4e8c1',
        },
        null,
        2,
      ),
    },
    {
      path: 'render.js',
      content: `const FONTS = [
  'Courier Prime', 'Permanent Marker', 'Special Elite',
  'Rock Salt', 'Creepster', 'Rubik Mono One', 'Bungee Shade',
  'Georgia', 'Impact', 'Comic Sans MS', 'Times New Roman'
];
const COLORS = [
  '#1a1a1a', '#333', '#8b0000', '#00008b', '#2f4f4f',
  '#4a0e0e', '#0a2a0a', '#222', '#555'
];

function ransomize(text, container, sizeRange) {
  container.innerHTML = '';
  for (const char of text) {
    if (char === ' ') {
      container.appendChild(document.createTextNode(' '));
      continue;
    }
    const span = document.createElement('span');
    span.className = 'letter';
    span.textContent = char;
    const font = FONTS[Math.floor(Math.random() * FONTS.length)];
    const size = sizeRange[0] + Math.random() * (sizeRange[1] - sizeRange[0]);
    const rotation = (Math.random() - 0.5) * 16;
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    const bg = Math.random() > 0.7
      ? 'rgba(' + [
          Math.floor(Math.random()*80+170),
          Math.floor(Math.random()*80+170),
          Math.floor(Math.random()*60+100)
        ].join(',') + ',0.5)'
      : 'transparent';
    span.style.cssText =
      'font-family:"' + font + '",cursive;' +
      'font-size:' + size + 'px;' +
      'transform:rotate(' + rotation + 'deg);' +
      'color:' + color + ';' +
      'background:' + bg + ';';
    container.appendChild(span);
  }
}

fetch('./config.json')
  .then(r => r.json())
  .then(data => {
    if (data.paperColor) {
      document.querySelector('.paper').style.setProperty('--paper', data.paperColor);
    }
    ransomize(data.headline || '', document.getElementById('headline'), [28, 48]);
    ransomize(data.message || '', document.getElementById('message'), [14, 24]);
    ransomize(data.demand || '', document.getElementById('demand'), [18, 30]);
    ransomize(data.signature || '', document.getElementById('signature'), [12, 18]);
  })
  .catch(err => console.warn('render.js:', err));`,
    },
  ],
  layout: LAYOUT_WORKSHOP,
};

export default template;
