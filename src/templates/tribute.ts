import type { TemplateDefinition } from './index';
import { LAYOUT_CHAT } from './index';

const template: TemplateDefinition = {
  context:
    'This is a data-driven tribute/memorial page template. ' +
    'The content lives in config.json — the user can edit it via the form view in the workshop. ' +
    'render.js reads config.json and builds the DOM. Be sensitive and warm. Help them add photos, stories, and memories.',
  greeting:
    "I've set up a tribute page with space for a photo, a written tribute, and a place for memories. " +
    "Switch to the Form tab on config.json to fill in the details, or edit the data directly. " +
    "Whenever you're ready, you can start with their name and a few words about them — we'll take it at your pace.",
  schema: {
    fields: [
      { key: 'name', label: 'Name', type: 'text', placeholder: 'Their name' },
      { key: 'dates', label: 'Dates', type: 'text', placeholder: '1950 – 2024' },
      { key: 'photoUrl', label: 'Photo', type: 'image' },
      { key: 'quote', label: 'Quote', type: 'textarea', placeholder: 'A favorite quote or saying of theirs' },
      { key: 'biography', label: 'Biography', type: 'textarea', placeholder: 'Write about who they were…' },
      {
        key: 'memories',
        label: 'Memories',
        type: 'repeater',
        fields: [
          { key: 'author', label: 'Author', type: 'text', placeholder: 'Who shared this memory' },
          { key: 'text', label: 'Memory', type: 'textarea', placeholder: 'A memory or story…' },
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
  <title>A Tribute</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <main>
    <header>
      <div id="photo" class="photo-frame">Photo</div>
      <h1 id="name"></h1>
      <p id="dates" class="years"></p>
    </header>
    <section id="quote-section" class="quote" style="display:none">
      <blockquote id="quote"></blockquote>
    </section>
    <section id="biography-section" class="tribute" style="display:none">
      <div id="biography"></div>
    </section>
    <section id="memories-section" class="memories" style="display:none">
      <h2>Memories</h2>
      <div id="memories"></div>
    </section>
  </main>
  <script src="render.js"></script>
</body>
</html>`,
    },
    {
      path: 'style.css',
      content: `* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: Georgia, serif;
  color: #2c2c2c; background: #f9f7f4;
  max-width: 600px; margin: 0 auto; padding: 3rem 1.5rem;
}
header { text-align: center; margin-bottom: 3rem; }
.photo-frame {
  width: 160px; height: 160px; border-radius: 50%;
  background: #e8e4de; margin: 0 auto 1.5rem;
  display: flex; align-items: center; justify-content: center;
  color: #aaa; font-size: 0.9rem;
  border: 4px solid #d8d4ce; overflow: hidden;
}
.photo-frame img { width: 100%; height: 100%; object-fit: cover; }
header h1 { font-size: 2rem; font-weight: 400; }
.years { color: #999; font-size: 1rem; margin-top: 0.25rem; }
.quote { margin-bottom: 2rem; }
.quote blockquote {
  padding: 1.5rem; border-left: 3px solid #d8d4ce;
  font-style: italic; color: #555; background: #f4f1ec;
  border-radius: 0 8px 8px 0;
}
.quote blockquote p { margin: 0; }
.tribute p { line-height: 1.9; margin-bottom: 1.25rem; font-size: 1.05rem; }
.memories { margin-top: 2rem; }
.memories h2 { font-weight: 400; color: #888; margin-bottom: 1rem; text-transform: uppercase; letter-spacing: 0.1em; font-family: system-ui, sans-serif; font-size: 0.75rem; }
.memory {
  padding: 1.5rem; border-left: 3px solid #d8d4ce;
  background: #f4f1ec; border-radius: 0 8px 8px 0;
  margin-bottom: 1rem;
}
.memory p { line-height: 1.7; font-style: italic; color: #555; margin: 0; }
.memory .memory-author { font-style: normal; font-size: 0.85rem; color: #888; margin-top: 0.5rem; }`,
    },
    {
      path: 'config.json',
      content: JSON.stringify(
        {
          name: 'Their Name',
          dates: '1950 – 2024',
          photoUrl: '',
          quote: 'A favorite quote or saying of theirs goes here.',
          biography:
            'Write about who they were. What made them special. The moments you remember most.\n\nThis is a place to celebrate their life and keep their memory alive.',
          memories: [
            { author: '', text: 'Share a memory or story here…' },
          ],
        },
        null,
        2,
      ),
    },
    {
      path: 'render.js',
      content: `// Render tribute page from config.json — re-run on every preview refresh
fetch('./config.json')
  .then((r) => r.json())
  .then((data) => {
    // Name
    document.getElementById('name').textContent = data.name || 'Their Name';
    document.title = (data.name || 'A Tribute') + ' — A Tribute';

    // Dates
    const datesEl = document.getElementById('dates');
    if (data.dates) {
      datesEl.textContent = data.dates;
      datesEl.style.display = '';
    } else {
      datesEl.style.display = 'none';
    }

    // Photo
    const photoEl = document.getElementById('photo');
    if (data.photoUrl) {
      photoEl.innerHTML = '<img src="' + escapeHtml(data.photoUrl) + '" alt="' + escapeHtml(data.name || '') + '">';
    } else {
      photoEl.textContent = 'Photo';
    }

    // Quote
    const quoteSection = document.getElementById('quote-section');
    const quoteEl = document.getElementById('quote');
    if (data.quote) {
      quoteEl.innerHTML = '<p>' + escapeHtml(data.quote) + '</p>';
      quoteSection.style.display = '';
    } else {
      quoteSection.style.display = 'none';
    }

    // Biography
    const bioSection = document.getElementById('biography-section');
    const bioEl = document.getElementById('biography');
    if (data.biography) {
      bioEl.innerHTML = data.biography
        .split('\\n\\n')
        .filter(Boolean)
        .map(function (p) { return '<p>' + escapeHtml(p) + '</p>'; })
        .join('');
      bioSection.style.display = '';
    } else {
      bioSection.style.display = 'none';
    }

    // Memories
    var memoriesSection = document.getElementById('memories-section');
    var memoriesEl = document.getElementById('memories');
    var memories = data.memories || [];
    if (memories.length > 0) {
      memoriesEl.innerHTML = '';
      for (var i = 0; i < memories.length; i++) {
        var m = memories[i];
        var div = document.createElement('div');
        div.className = 'memory';
        var html = '<p>' + escapeHtml(m.text || '') + '</p>';
        if (m.author) {
          html += '<p class="memory-author">— ' + escapeHtml(m.author) + '</p>';
        }
        div.innerHTML = html;
        memoriesEl.appendChild(div);
      }
      memoriesSection.style.display = '';
    } else {
      memoriesSection.style.display = 'none';
    }
  })
  .catch(function (err) { console.warn('render.js: could not load config.json', err); });

function escapeHtml(str) {
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}`,
    },
  ],
  layout: LAYOUT_CHAT,
};

export default template;
