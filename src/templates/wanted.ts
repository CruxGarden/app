import type { TemplateDefinition } from './index';
import { LAYOUT_WORKSHOP } from './index';

const template: TemplateDefinition = {
  context:
    'This is an Old West wanted poster template. Aged paper, weathered typography, reward amount. ' +
    'The content lives in config.json — the user edits via the form view. ' +
    'render.js reads config.json and builds the poster. Help them create dramatic (or ridiculous) wanted posters.',
  greeting:
    "I've set up a wanted poster straight from the Wild West — aged paper, big reward, the works. " +
    "Switch to the Form tab on config.json to fill in the outlaw's details. Dead or alive is your call.",
  schema: {
    fields: [
      { key: 'name', label: 'Name', type: 'text', placeholder: 'Spaghetti Pete' },
      { key: 'alias', label: 'Alias', type: 'text', placeholder: 'aka "The Noodle Bandit"' },
      { key: 'photoUrl', label: 'Mugshot', type: 'image' },
      { key: 'reward', label: 'Reward Amount', type: 'text', placeholder: '$5,000 and a nice hat' },
      { key: 'deadOrAlive', label: 'Status', type: 'select', options: [
        { label: 'DEAD OR ALIVE', value: 'DEAD OR ALIVE' },
        { label: 'ALIVE ONLY', value: 'ALIVE ONLY' },
        { label: 'DEAD ONLY (spooky)', value: 'DEAD ONLY' },
        { label: 'ALIVE (but annoyed)', value: 'ALIVE BUT ANNOYED' },
        { label: 'JUST VIBES', value: 'JUST VIBES' },
      ] },
      { key: 'description', label: 'Description', type: 'textarea', placeholder: 'Last seen leaving an all-you-can-eat buffet with suspiciously full pockets. Considered noodly and dangerous.' },
      {
        key: 'charges',
        label: 'Charges',
        type: 'repeater',
        fields: [
          { key: 'charge', label: 'Charge', type: 'text', placeholder: 'Grand theft pasta' },
        ],
      },
      { key: 'contact', label: 'Contact Info', type: 'text', placeholder: "See your local sheriff or yell really loud" },
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
  <title>WANTED</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div class="poster">
    <div class="poster-inner">
      <p class="wanted-text">WANTED</p>
      <p id="status" class="status"></p>
      <div id="mugshot" class="mugshot">
        <span class="no-photo">NO PHOTO<br>AVAILABLE</span>
      </div>
      <h1 id="name" class="name"></h1>
      <p id="alias" class="alias"></p>
      <div id="charges" class="charges"></div>
      <p id="description" class="description"></p>
      <div class="reward-box">
        <p class="reward-label">REWARD</p>
        <p id="reward" class="reward-amount"></p>
      </div>
      <p id="contact" class="contact"></p>
    </div>
  </div>
  <script src="render.js"></script>
</body>
</html>`,
    },
    {
      path: 'style.css',
      content: `@import url('https://fonts.googleapis.com/css2?family=Rye&family=Almendra+Display&family=Special+Elite&display=swap');

* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  min-height: 100vh;
  display: flex; align-items: center; justify-content: center;
  background: #3a2a1a;
  background-image:
    repeating-linear-gradient(90deg, transparent, transparent 80px, rgba(0,0,0,0.05) 80px, rgba(0,0,0,0.05) 81px);
  padding: 2rem;
}
.poster {
  max-width: 480px; width: 100%;
  background: #e8d5a3;
  padding: 6px;
  box-shadow: 5px 5px 30px rgba(0,0,0,0.5);
  position: relative;
  transform: rotate(-0.5deg);
}
.poster::before, .poster::after {
  content: '';
  position: absolute;
  width: 20px; height: 20px;
  background: #3a2a1a;
  border-radius: 50%;
  box-shadow: inset 2px 2px 4px rgba(0,0,0,0.3);
}
.poster::before { top: 10px; left: 50%; transform: translateX(-50%); }
.poster::after { top: 10px; left: 50%; transform: translateX(-50%); background: #5a4a3a; width: 12px; height: 12px; }
.poster-inner {
  border: 3px double #8b7355;
  padding: 2rem 1.5rem;
  text-align: center;
  background:
    radial-gradient(circle at 20% 80%, rgba(139,115,85,0.1), transparent 50%),
    radial-gradient(circle at 80% 20%, rgba(139,115,85,0.1), transparent 50%),
    linear-gradient(180deg, #e8d5a3, #dcc793, #d4be82, #dcc793);
}
.wanted-text {
  font-family: 'Rye', serif;
  font-size: 3.5rem; color: #2a1a0a;
  letter-spacing: 8px;
  text-shadow: 2px 2px 0 rgba(0,0,0,0.1);
  line-height: 1;
}
.status {
  font-family: 'Special Elite', monospace;
  font-size: 1rem; color: #8b0000;
  letter-spacing: 4px; margin-bottom: 1rem;
  border-bottom: 1px solid #8b7355;
  padding-bottom: 0.75rem;
}
.mugshot {
  width: 180px; height: 200px;
  margin: 0 auto 1rem;
  border: 3px solid #5a4a3a;
  background: #c8b07a;
  display: flex; align-items: center; justify-content: center;
  overflow: hidden;
}
.mugshot img { width: 100%; height: 100%; object-fit: cover; }
.no-photo {
  font-family: 'Special Elite', monospace;
  font-size: 0.75rem; color: #8b7355;
  text-align: center; line-height: 1.4;
}
.name {
  font-family: 'Rye', serif;
  font-size: 1.8rem; color: #2a1a0a;
  margin-bottom: 0.25rem;
}
.alias {
  font-family: 'Special Elite', monospace;
  font-size: 0.9rem; color: #6b5b3a;
  margin-bottom: 1rem; font-style: italic;
}
.charges {
  margin-bottom: 1rem;
  font-family: 'Special Elite', monospace;
  font-size: 0.85rem; color: #4a3a1a;
}
.charge-item {
  padding: 0.15rem 0;
}
.charge-item::before { content: '\\2022\\00a0'; color: #8b0000; }
.description {
  font-family: 'Special Elite', monospace;
  font-size: 0.85rem; color: #4a3a2a;
  line-height: 1.6; margin-bottom: 1.5rem;
  text-align: left; padding: 0 0.5rem;
  white-space: pre-wrap;
}
.reward-box {
  border: 2px solid #2a1a0a;
  padding: 0.75rem; margin-bottom: 1rem;
  background: rgba(42,26,10,0.05);
}
.reward-label {
  font-family: 'Rye', serif;
  font-size: 0.9rem; letter-spacing: 4px;
  color: #2a1a0a; margin-bottom: 0.25rem;
}
.reward-amount {
  font-family: 'Almendra Display', serif;
  font-size: 2rem; color: #8b0000;
}
.contact {
  font-family: 'Special Elite', monospace;
  font-size: 0.7rem; color: #8b7355;
  margin-top: 0.5rem;
}`,
    },
    {
      path: 'config.json',
      content: JSON.stringify(
        {
          name: 'Spaghetti Pete',
          alias: 'aka "The Noodle Bandit"',
          photoUrl: '',
          reward: '$5,000 and a nice hat',
          deadOrAlive: 'DEAD OR ALIVE',
          description: 'Last seen leaving an all-you-can-eat buffet with suspiciously full pockets.\n\nConsidered noodly and dangerous. Approach with caution and a fork.',
          charges: [
            { charge: 'Grand theft pasta' },
            { charge: 'Aggravated carbo-loading' },
            { charge: 'Impersonating a chef' },
            { charge: 'Fleeing the scene with breadsticks' },
          ],
          contact: "See your local sheriff or yell really loud",
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
    document.getElementById('status').textContent = data.deadOrAlive || 'DEAD OR ALIVE';
    document.getElementById('name').textContent = data.name || 'UNKNOWN';
    document.getElementById('alias').textContent = data.alias || '';

    // Mugshot
    const mugshot = document.getElementById('mugshot');
    if (data.photoUrl) {
      mugshot.innerHTML = '<img src="' + escapeHtml(data.photoUrl) + '" alt="Mugshot">';
    }

    // Charges
    const chargesEl = document.getElementById('charges');
    chargesEl.innerHTML = '';
    for (const c of data.charges || []) {
      const div = document.createElement('div');
      div.className = 'charge-item';
      div.textContent = c.charge || '';
      chargesEl.appendChild(div);
    }

    document.getElementById('description').textContent = data.description || '';
    document.getElementById('reward').textContent = data.reward || '$???';
    document.getElementById('contact').textContent = data.contact || '';
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
