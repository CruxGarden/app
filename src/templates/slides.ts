import type { TemplateDefinition } from './index';
import { LAYOUT_WORKSHOP } from './index';

const template: TemplateDefinition = {
  context:
    'This is a data-driven slide deck/presentation template. ' +
    'The content lives in config.json — the user can edit it via the form view in the workshop. ' +
    'render.js reads config.json and builds the slide DOM, then script.js handles keyboard/touch navigation. ' +
    'Help them add slides with titles, bullets, and code blocks.',
  greeting:
    "I've set up a slide deck with keyboard navigation and a few starter slides. " +
    "Switch to the Form tab on config.json to add slides and personalize, or edit the data directly. " +
    "Arrow keys move between slides, and I can help with layout and transitions.",
  schema: {
    fields: [
      { key: 'presentationTitle', label: 'Presentation Title', type: 'text', placeholder: 'My Presentation' },
      { key: 'author', label: 'Author', type: 'text', placeholder: 'Your Name' },
      {
        key: 'slides',
        label: 'Slides',
        type: 'repeater',
        fields: [
          { key: 'title', label: 'Title', type: 'text', placeholder: 'Slide title' },
          { key: 'content', label: 'Content', type: 'textarea', placeholder: 'Bullet points, one per line' },
          {
            key: 'type',
            label: 'Type',
            type: 'select',
            options: [
              { label: 'Title Slide', value: 'title' },
              { label: 'Content', value: 'content' },
              { label: 'Code', value: 'code' },
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
  <title>My Presentation</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div class="deck" id="deck"></div>
  <div class="controls">
    <span class="slide-counter" id="slide-counter"></span>
  </div>
  <script src="render.js"></script>
  <script src="script.js"></script>
</body>
</html>`,
    },
    {
      path: 'style.css',
      content: `* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: system-ui, sans-serif; background: #0f0f0f; color: #f0f0f0;
  overflow: hidden; height: 100vh;
}
.deck { position: relative; width: 100vw; height: 100vh; }
.slide {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  opacity: 0; transition: opacity 0.4s ease;
  pointer-events: none; padding: 4rem;
}
.slide.active { opacity: 1; pointer-events: auto; }
.slide-content { max-width: 800px; width: 100%; }
.title-slide { text-align: center; }
.title-slide h1 { font-size: 3rem; font-weight: 800; line-height: 1.1; margin-bottom: 1rem; }
.subtitle { color: #888; font-size: 1.1rem; }
h2 { font-size: 2rem; font-weight: 700; margin-bottom: 1.5rem; color: #60a5fa; }
ul { list-style: none; padding: 0; }
ul li {
  font-size: 1.25rem; line-height: 1.8; padding-left: 1.5rem;
  position: relative; color: #ccc;
}
ul li::before {
  content: '—'; position: absolute; left: 0; color: #60a5fa;
}
p { font-size: 1.1rem; line-height: 1.7; color: #ccc; margin-bottom: 1rem; }
pre {
  background: #1a1a2e; padding: 1.25rem; border-radius: 8px;
  overflow-x: auto; margin-top: 1rem;
}
code { font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 0.9rem; color: #e2e8f0; }
.controls {
  position: fixed; bottom: 1.5rem; right: 2rem;
  font-size: 0.8rem; color: #555; font-family: monospace;
}`,
    },
    {
      path: 'config.json',
      content: JSON.stringify(
        {
          presentationTitle: 'Presentation Title',
          author: 'Your Name',
          slides: [
            { title: 'Presentation Title', content: 'Your Name \u00b7 Date', type: 'title' },
            {
              title: 'First Topic',
              content: 'Key point one\nKey point two\nKey point three',
              type: 'content',
            },
            {
              title: 'Second Topic',
              content: "// code example\nconsole.log('Hello');",
              type: 'code',
            },
            { title: 'Thank You', content: 'Questions?', type: 'title' },
          ],
        },
        null,
        2,
      ),
    },
    {
      path: 'render.js',
      content: `// Render slide deck from config.json — re-run on every preview refresh
fetch('./config.json')
  .then((r) => r.json())
  .then((data) => {
    const deck = document.getElementById('deck');
    deck.innerHTML = '';

    const slides = data.slides || [];
    if (slides.length === 0) {
      deck.innerHTML = '<section class="slide active"><div class="slide-content title-slide"><h1>No Slides</h1></div></section>';
      return;
    }

    slides.forEach((slide, i) => {
      const section = document.createElement('section');
      section.className = 'slide' + (i === 0 ? ' active' : '');

      const div = document.createElement('div');
      const type = slide.type || 'content';

      if (type === 'title') {
        div.className = 'slide-content title-slide';
        div.innerHTML = '<h1>' + escapeHtml(slide.title || '') + '</h1>'
          + '<p class="subtitle">' + escapeHtml(slide.content || '') + '</p>';
      } else if (type === 'code') {
        div.className = 'slide-content';
        div.innerHTML = '<h2>' + escapeHtml(slide.title || '') + '</h2>'
          + '<pre><code>' + escapeHtml(slide.content || '') + '</code></pre>';
      } else {
        // content type — lines become bullet points
        div.className = 'slide-content';
        const lines = (slide.content || '').split('\\n').filter(function (l) { return l.trim(); });
        let html = '<h2>' + escapeHtml(slide.title || '') + '</h2>';
        if (lines.length > 0) {
          html += '<ul>' + lines.map(function (line) {
            return '<li>' + escapeHtml(line) + '</li>';
          }).join('') + '</ul>';
        }
        div.innerHTML = html;
      }

      section.appendChild(div);
      deck.appendChild(section);
    });

    // Update document title
    if (data.presentationTitle) {
      document.title = data.presentationTitle;
    }

    // Signal that slides are ready for navigation binding
    window.dispatchEvent(new CustomEvent('slides-ready'));
  })
  .catch((err) => console.warn('render.js: could not load config.json', err));

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}`,
    },
    {
      path: 'script.js',
      content: `// Keyboard and touch navigation for slide deck
// Waits for render.js to build the slides before binding
function initNavigation() {
  const slides = document.querySelectorAll('.slide');
  const counter = document.getElementById('slide-counter');
  let current = 0;

  if (slides.length === 0) return;

  function show(index) {
    if (index < 0 || index >= slides.length) return;
    slides[current].classList.remove('active');
    current = index;
    slides[current].classList.add('active');
    counter.textContent = (current + 1) + ' / ' + slides.length;
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); show(current + 1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); show(current - 1); }
    if (e.key === 'Home') { e.preventDefault(); show(0); }
    if (e.key === 'End') { e.preventDefault(); show(slides.length - 1); }
  });

  // Touch support
  var touchStartX = 0;
  document.addEventListener('touchstart', function (e) { touchStartX = e.touches[0].clientX; });
  document.addEventListener('touchend', function (e) {
    var diff = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(diff) > 50) { diff < 0 ? show(current + 1) : show(current - 1); }
  });

  show(0);
}

// Listen for custom event from render.js
window.addEventListener('slides-ready', initNavigation);`,
    },
  ],
  layout: LAYOUT_WORKSHOP,
};

export default template;
