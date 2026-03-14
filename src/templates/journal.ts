import type { TemplateDefinition } from './index';
import { LAYOUT_BALANCED } from './index';

const template: TemplateDefinition = {
  context:
    'This is a travel journal template with chronological entries. ' +
    'The user wants to document trips. Help them add entries with dates, locations, photos, and stories.',
  greeting:
    "I've set up a journal with a timeline layout and a couple of sample entries. Start by replacing them with a real date and place — even a short entry works well, and we can build it out from there.",
  schema: {
    fields: [
      { key: 'journalTitle', label: 'Journal Title', type: 'text', placeholder: 'Travel Journal' },
      { key: 'author', label: 'Author', type: 'text', placeholder: 'Your name' },
      {
        key: 'entries',
        label: 'Entries',
        type: 'repeater',
        fields: [
          { key: 'date', label: 'Date', type: 'text', placeholder: 'Mar 12, 2026' },
          { key: 'location', label: 'Location', type: 'text', placeholder: 'City, Country' },
          { key: 'title', label: 'Title', type: 'text', placeholder: 'Entry title' },
          { key: 'content', label: 'Content', type: 'textarea', placeholder: 'What you saw, felt, and experienced...' },
          { key: 'imageUrl', label: 'Photo', type: 'image' },
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
  <title>Travel Journal</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header>
    <h1 id="journal-title"></h1>
    <p id="author" class="subtitle"></p>
  </header>
  <main id="timeline" class="timeline"></main>
  <script src="render.js"></script>
</body>
</html>`,
    },
    {
      path: 'style.css',
      content: `* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: system-ui, sans-serif;
  color: #2c2c2c; background: #faf9f6;
  max-width: 700px; margin: 0 auto; padding: 2rem 1.5rem;
}
header { text-align: center; margin-bottom: 3rem; }
header h1 { font-size: 2rem; font-weight: 700; }
.subtitle { color: #888; margin-top: 0.25rem; }
.timeline { position: relative; padding-left: 4rem; }
.timeline::before {
  content: ''; position: absolute; left: 1.75rem; top: 0; bottom: 0;
  width: 2px; background: #e0ddd8;
}
.entry { position: relative; margin-bottom: 2.5rem; }
.date-badge {
  position: absolute; left: -4rem;
  width: 3.5rem; text-align: center;
  background: #faf9f6; padding: 0.25rem 0;
}
.date-badge .day { display: block; font-size: 1.25rem; font-weight: 700; line-height: 1; }
.date-badge .month { display: block; font-size: 0.7rem; text-transform: uppercase; color: #999; letter-spacing: 0.05em; }
.content h2 { font-size: 1.25rem; margin-bottom: 0.25rem; }
.location { color: #888; font-size: 0.85rem; margin-bottom: 0.75rem; font-style: italic; }
.content p { line-height: 1.7; }
.entry-image { width: 100%; border-radius: 6px; margin-top: 0.75rem; }`,
    },
    {
      path: 'config.json',
      content: JSON.stringify(
        {
          journalTitle: 'Travel Journal',
          author: 'Adventures and discoveries',
          entries: [
            {
              date: 'Mar 12, 2026',
              location: 'City, Country',
              title: 'First Destination',
              content: 'Describe what you saw, felt, and experienced. Add photos to bring it to life.',
              imageUrl: '',
            },
            {
              date: 'Mar 15, 2026',
              location: 'Another Place',
              title: 'Next Stop',
              content: 'Every journey has moments worth remembering. Write them down before they fade.',
              imageUrl: '',
            },
          ],
        },
        null,
        2,
      ),
    },
    {
      path: 'render.js',
      content: `// Render travel journal from config.json — re-run on every preview refresh
fetch('./config.json')
  .then((r) => r.json())
  .then((data) => {
    // Title
    document.getElementById('journal-title').textContent = data.journalTitle || 'Travel Journal';

    // Author / subtitle
    document.getElementById('author').textContent = data.author || '';

    // Build timeline entries
    const timeline = document.getElementById('timeline');
    timeline.innerHTML = '';

    for (const entry of data.entries || []) {
      const article = document.createElement('article');
      article.className = 'entry';

      // Parse date for badge — try "Mon DD, YYYY" or fall back to raw string
      let day = '';
      let month = '';
      const raw = (entry.date || '').trim();
      const parts = raw.match(/^(\\w{3})\\s+(\\d{1,2})/);
      if (parts) {
        month = parts[1];
        day = parts[2];
      } else {
        day = raw.slice(0, 3);
      }

      let html = '<div class="date-badge">';
      html += '<span class="day">' + escapeHtml(day) + '</span>';
      html += '<span class="month">' + escapeHtml(month) + '</span>';
      html += '</div>';
      html += '<div class="content">';
      html += '<h2>' + escapeHtml(entry.title || '') + '</h2>';
      if (entry.location) {
        html += '<p class="location">' + escapeHtml(entry.location) + '</p>';
      }
      html += '<p>' + escapeHtml(entry.content || '') + '</p>';
      if (entry.imageUrl) {
        html += '<img class="entry-image" src="' + escapeHtml(entry.imageUrl) + '" alt="' + escapeHtml(entry.title || 'Photo') + '">';
      }
      html += '</div>';

      article.innerHTML = html;
      timeline.appendChild(article);
    }
  })
  .catch((err) => console.warn('render.js: could not load config.json', err));

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}`,
    },
  ],
  layout: LAYOUT_BALANCED,
};

export default template;
