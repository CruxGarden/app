import type { TemplateDefinition } from './index';
import { LAYOUT_WORKSHOP } from './index';

const template: TemplateDefinition = {
  context:
    'This is a 90s Geocities-style nostalgia page with visitor counter, marquee text, starfield background, construction GIF vibes, and tables for layout. ' +
    'The content lives in config.json — the user edits via the form view. ' +
    'render.js reads config.json and builds the glorious retro page. Help them make it as garish as possible.',
  greeting:
    "Welcome to 1997. I've set up a genuine Geocities-style homepage complete with a visitor counter, marquee scrolling text, " +
    "a star background, and way too many colors. Switch to the Form tab on config.json to customize your corner of the old web. " +
    "Best viewed in Netscape Navigator.",
  schema: {
    fields: [
      { key: 'siteTitle', label: 'Site Title', type: 'text', placeholder: "~*~WeLcOmE tO mY sItE~*~" },
      { key: 'marqueeText', label: 'Scrolling Marquee Text', type: 'text', placeholder: '>>> UNDER CONSTRUCTION <<< Please sign my guestbook!!!' },
      { key: 'aboutMe', label: 'About Me', type: 'textarea', placeholder: "Hi!!! My name is cool_dude_97 and this is my AWESOME homepage!!! I like computers, pizza, and my hamster Biscuit." },
      { key: 'backgroundColor', label: 'Background Color', type: 'color' },
      { key: 'textColor', label: 'Text Color', type: 'color' },
      {
        key: 'links',
        label: 'Cool Links',
        type: 'repeater',
        fields: [
          { key: 'text', label: 'Link Text', type: 'text', placeholder: 'My friend Chad\'s page' },
          { key: 'url', label: 'URL', type: 'text', placeholder: 'http://www.geocities.com/~chad' },
        ],
      },
      {
        key: 'guestbookEntries',
        label: 'Guestbook Entries',
        type: 'repeater',
        fields: [
          { key: 'name', label: 'Name', type: 'text', placeholder: 'xX_SurfDude_Xx' },
          { key: 'message', label: 'Message', type: 'text', placeholder: 'Cool site dude!!! Check out mine!!!' },
          { key: 'date', label: 'Date', type: 'text', placeholder: '03/15/1998' },
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
  <title>My Awesome Homepage!!!</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div id="starfield"></div>
  <div class="page">
    <div class="construction-bar">
      <span class="blink">&#128679;</span>
      UNDER CONSTRUCTION
      <span class="blink">&#128679;</span>
    </div>

    <h1 id="site-title" class="site-title"></h1>

    <div id="marquee-container" class="marquee-container">
      <div id="marquee" class="marquee-text"></div>
    </div>

    <hr class="rainbow-hr">

    <table class="layout-table">
      <tr>
        <td class="sidebar">
          <h3>&#127775; Navigation &#127775;</h3>
          <ul id="nav-links" class="nav-links"></ul>
          <hr>
          <div class="visitor-counter">
            <p>You are visitor #</p>
            <div id="counter" class="counter"></div>
          </div>
          <hr>
          <p class="small">&#127912; Best viewed at 800x600</p>
          <p class="small">&#128187; Made with Notepad</p>
        </td>
        <td class="main-content">
          <h2>&#128075; About Me &#128075;</h2>
          <p id="about-me"></p>

          <hr class="rainbow-hr">

          <h2>&#128221; Guestbook &#128221;</h2>
          <div id="guestbook"></div>

          <hr class="rainbow-hr">

          <h2>&#127925; Cool Links &#127925;</h2>
          <ul id="cool-links" class="cool-links"></ul>
        </td>
      </tr>
    </table>

    <hr class="rainbow-hr">

    <div class="footer">
      <p>&#169; 1997 all rights reserved | <span class="blink">EMAIL ME</span> | Sign my guestbook!!!</p>
      <p class="small">This page has been visited <span id="footer-count">0</span> times since January 1997</p>
      <p class="webring">
        [ <a href="#">&lt;&lt; Prev</a> |
        <a href="#">Hamster Lovers Webring</a> |
        <a href="#">Next &gt;&gt;</a> ]
      </p>
    </div>
  </div>
  <script src="render.js"></script>
</body>
</html>`,
    },
    {
      path: 'style.css',
      content: `* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  background: var(--bg, #000080);
  color: var(--text, #ffff00);
  font-family: 'Comic Sans MS', 'Chalkboard SE', cursive;
  min-height: 100vh;
  position: relative;
}
#starfield {
  position: fixed; inset: 0;
  pointer-events: none; z-index: 0;
}
.page {
  position: relative; z-index: 1;
  max-width: 800px; margin: 0 auto;
  padding: 1rem;
}
.construction-bar {
  background: #ff0; color: #000;
  text-align: center; padding: 0.5rem;
  font-weight: bold; font-size: 0.85rem;
  letter-spacing: 2px;
  border: 3px dashed #f00;
}
.site-title {
  text-align: center;
  font-size: 2.2rem;
  color: #ff00ff;
  text-shadow: 2px 2px #00ffff, -1px -1px #ff0;
  margin: 1rem 0;
  animation: rainbow 3s linear infinite;
}
@keyframes rainbow {
  0% { color: #ff0000; }
  17% { color: #ff8800; }
  33% { color: #ffff00; }
  50% { color: #00ff00; }
  67% { color: #0088ff; }
  83% { color: #8800ff; }
  100% { color: #ff0000; }
}
.marquee-container {
  overflow: hidden;
  background: #000;
  border: 2px inset #808080;
  padding: 0.5rem 0;
  margin-bottom: 1rem;
}
.marquee-text {
  white-space: nowrap;
  animation: scroll-left 12s linear infinite;
  color: #0f0; font-size: 1.1rem;
  font-weight: bold;
}
@keyframes scroll-left {
  0% { transform: translateX(100%); }
  100% { transform: translateX(-100%); }
}
.rainbow-hr {
  border: none; height: 4px;
  background: linear-gradient(90deg, red, orange, yellow, green, blue, indigo, violet);
  margin: 1rem 0;
}
.layout-table {
  width: 100%; border-collapse: collapse;
  border: 2px ridge #808080;
}
.sidebar {
  width: 200px; vertical-align: top;
  background: rgba(0,0,0,0.3);
  padding: 1rem;
  border-right: 2px ridge #808080;
}
.sidebar h3 { font-size: 0.9rem; margin-bottom: 0.5rem; color: #0ff; }
.nav-links { list-style: none; padding: 0; }
.nav-links li { padding: 0.25rem 0; }
.nav-links a { color: #0f0; text-decoration: underline; }
.nav-links a:hover { color: #ff0; }
.visitor-counter { text-align: center; margin: 0.5rem 0; }
.visitor-counter p { font-size: 0.7rem; margin-bottom: 0.25rem; }
.counter {
  display: flex; justify-content: center; gap: 2px;
}
.counter-digit {
  background: #111; color: #0f0;
  font-family: 'Courier New', monospace;
  font-size: 1.2rem; font-weight: bold;
  width: 18px; height: 24px;
  display: flex; align-items: center; justify-content: center;
  border: 1px inset #555;
}
.small { font-size: 0.65rem; opacity: 0.7; margin: 0.25rem 0; }
.main-content {
  vertical-align: top; padding: 1rem;
}
.main-content h2 {
  color: #ff0; font-size: 1.1rem; margin-bottom: 0.75rem;
}
.main-content p { font-size: 0.9rem; line-height: 1.6; margin-bottom: 0.75rem; }
.guestbook-entry {
  background: rgba(255,255,255,0.08);
  border: 1px solid #555;
  padding: 0.5rem; margin-bottom: 0.5rem;
  font-size: 0.8rem;
}
.gb-name { color: #0ff; font-weight: bold; }
.gb-date { color: #888; font-size: 0.7rem; float: right; }
.gb-message { margin-top: 0.25rem; color: #ddd; }
.cool-links { list-style: disc; padding-left: 1.5rem; }
.cool-links li { padding: 0.2rem 0; }
.cool-links a { color: #00ff00; }
.cool-links a:hover { color: #ff0; }
.footer {
  text-align: center; padding: 1rem;
  font-size: 0.8rem;
}
.webring {
  margin-top: 0.5rem; font-size: 0.75rem;
}
.webring a { color: #0ff; }
.blink { animation: blink 1s step-end infinite; }
@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}
a { color: #00ff00; }
a:visited { color: #ff00ff; }`,
    },
    {
      path: 'config.json',
      content: JSON.stringify(
        {
          siteTitle: "~*~WeLcOmE tO mY sItE~*~",
          marqueeText: '>>> UNDER CONSTRUCTION <<< Please sign my guestbook!!! >>> I just learned HTML <<<',
          aboutMe: "Hi!!! My name is cool_dude_97 and this is my AWESOME homepage!!!\n\nI like computers, pizza, and my hamster Biscuit. He is very round.\n\nI made this whole page by myself in Notepad!!! My mom says I'm very good at computers.",
          backgroundColor: '#000080',
          textColor: '#ffff00',
          links: [
            { text: "My friend Chad's page", url: '#' },
            { text: 'ENCYCLOPAEDIA OF HAMSTERS', url: '#' },
            { text: 'FREE MIDI FILES!!!', url: '#' },
            { text: 'Cool cursor trails', url: '#' },
          ],
          guestbookEntries: [
            { name: 'xX_SurfDude_Xx', message: 'Cool site dude!!! Check out mine!!!', date: '03/15/1998' },
            { name: 'hamster_girl_99', message: 'awww Biscuit is SO cute!!!', date: '03/12/1998' },
            { name: 'Chad', message: 'hey man nice page. wanna trade links?', date: '02/28/1998' },
          ],
        },
        null,
        2,
      ),
    },
    {
      path: 'render.js',
      content: `// Starfield background
const sf = document.getElementById('starfield');
const sfc = document.createElement('canvas');
sf.appendChild(sfc);
sfc.style.cssText = 'width:100%;height:100%';
const sfCtx = sfc.getContext('2d');
let sfStars = [];

function resizeSf() {
  sfc.width = window.innerWidth;
  sfc.height = window.innerHeight;
  sfStars = Array.from({ length: 80 }, () => ({
    x: Math.random() * sfc.width,
    y: Math.random() * sfc.height,
    s: Math.random() * 2 + 0.5,
    d: Math.random() * 0.3 + 0.1,
  }));
}
resizeSf();
window.addEventListener('resize', resizeSf);

function animStars() {
  sfCtx.clearRect(0, 0, sfc.width, sfc.height);
  for (const s of sfStars) {
    sfCtx.fillStyle = '#fff';
    sfCtx.fillRect(s.x, s.y, s.s, s.s);
    s.y += s.d;
    if (s.y > sfc.height) { s.y = 0; s.x = Math.random() * sfc.width; }
  }
  requestAnimationFrame(animStars);
}
requestAnimationFrame(animStars);

// Render page content
fetch('./config.json')
  .then(r => r.json())
  .then(data => {
    if (data.backgroundColor) document.body.style.setProperty('--bg', data.backgroundColor);
    if (data.textColor) document.body.style.setProperty('--text', data.textColor);

    document.getElementById('site-title').textContent = data.siteTitle || 'My Homepage';
    document.getElementById('marquee').textContent = data.marqueeText || 'Welcome!!!';
    document.getElementById('about-me').textContent = data.aboutMe || '';

    // Visitor counter (random big number)
    const count = Math.floor(Math.random() * 90000 + 10000);
    const counterEl = document.getElementById('counter');
    counterEl.innerHTML = '';
    for (const d of String(count)) {
      const digit = document.createElement('span');
      digit.className = 'counter-digit';
      digit.textContent = d;
      counterEl.appendChild(digit);
    }
    document.getElementById('footer-count').textContent = String(count);

    // Nav links
    const navEl = document.getElementById('nav-links');
    navEl.innerHTML = '<li><a href="#">Home</a></li><li><a href="#">About</a></li><li><a href="#">Guestbook</a></li><li><a href="#">Links</a></li>';

    // Cool links
    const linksEl = document.getElementById('cool-links');
    linksEl.innerHTML = '';
    for (const link of data.links || []) {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = link.url || '#';
      a.textContent = link.text || 'Cool link';
      a.target = '_blank';
      li.appendChild(a);
      linksEl.appendChild(li);
    }

    // Guestbook
    const gbEl = document.getElementById('guestbook');
    gbEl.innerHTML = '';
    for (const entry of data.guestbookEntries || []) {
      const div = document.createElement('div');
      div.className = 'guestbook-entry';
      div.innerHTML =
        '<span class="gb-name">' + escapeHtml(entry.name || 'Anonymous') + '</span>' +
        '<span class="gb-date">' + escapeHtml(entry.date || '') + '</span>' +
        '<div class="gb-message">' + escapeHtml(entry.message || '') + '</div>';
      gbEl.appendChild(div);
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
