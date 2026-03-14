import type { TemplateDefinition } from './index';
import { LAYOUT_BALANCED } from './index';

const template: TemplateDefinition = {
  context:
    'This is a data-driven digital zine template — bold, expressive editorial layout. ' +
    'The zine content lives in config.json — the user can edit it via the form view in the workshop. ' +
    'render.js reads config.json and builds the DOM. Help them with layout, typography, and mixed media.',
  greeting:
    "I've set up a zine with a bold cover spread and a couple of interior pages to get you started. The layout is meant to feel expressive — " +
    "switch to the Form tab on config.json to add articles, change the accent color, or drop in images. " +
    "The preview updates live as you make changes.",
  schema: {
    fields: [
      { key: 'zineName', label: 'Zine Name', type: 'text', placeholder: 'MY ZINE' },
      { key: 'issue', label: 'Issue', type: 'text', placeholder: 'Issue #1' },
      { key: 'accentColor', label: 'Accent Color', type: 'color', placeholder: '#f5f0e8' },
      {
        key: 'articles',
        label: 'Articles',
        type: 'repeater',
        fields: [
          { key: 'title', label: 'Title', type: 'text', placeholder: 'Article title' },
          { key: 'author', label: 'Author', type: 'text', placeholder: 'Author name' },
          { key: 'content', label: 'Content', type: 'textarea', placeholder: 'Write something bold...' },
          { key: 'imageUrl', label: 'Image', type: 'image', placeholder: 'https://...' },
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
  <title>My Zine</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header class="cover">
    <h1 id="zine-name"></h1>
    <p id="zine-issue" class="issue"></p>
    <p id="zine-tagline" class="tagline">A collection of thoughts, art, and weird ideas</p>
  </header>
  <main id="articles-content"></main>
  <footer class="colophon">
    <p>Made by hand. Powered by Crux Garden.</p>
  </footer>
  <script src="render.js"></script>
</body>
</html>`,
    },
    {
      path: 'style.css',
      content: `* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: 'Courier New', monospace;
  color: #111;
  background: var(--accent, #f5f0e8);
}
.cover {
  min-height: 100vh;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  text-align: center;
  padding: 2rem;
  background: #111; color: var(--accent, #f5f0e8);
}
.cover h1 { font-size: 4rem; font-weight: 900; letter-spacing: 0.15em; margin-bottom: 0.5rem; }
.issue { font-size: 1rem; text-transform: uppercase; letter-spacing: 0.3em; margin-bottom: 1rem; opacity: 0.6; }
.tagline { font-size: 1.1rem; font-style: italic; max-width: 400px; }
.spread {
  min-height: 60vh;
  padding: 4rem 2rem;
  display: flex; flex-direction: column;
  justify-content: center;
  max-width: 640px; margin: 0 auto;
}
.spread.alt {
  background: #e8e0d0;
  max-width: 100%;
  align-items: center;
  text-align: center;
}
.spread h2 {
  font-size: 2rem; font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 1rem;
  border-bottom: 3px solid #111;
  padding-bottom: 0.5rem;
  display: inline-block;
}
.spread .author {
  font-size: 0.85rem; text-transform: uppercase;
  letter-spacing: 0.15em; color: #666;
  margin-bottom: 1.5rem;
}
.spread p { font-size: 1.05rem; line-height: 1.8; }
.spread img {
  width: 100%; max-width: 100%;
  margin: 1.5rem 0; display: block;
}
blockquote {
  font-size: 1.8rem; font-weight: 700;
  max-width: 500px; line-height: 1.4;
}
.colophon {
  text-align: center; padding: 2rem;
  font-size: 0.8rem; color: #999;
}`,
    },
    {
      path: 'config.json',
      content: JSON.stringify(
        {
          zineName: 'MY ZINE',
          issue: 'Issue #1',
          accentColor: '#f5f0e8',
          articles: [
            {
              title: 'First Article',
              author: '',
              content:
                'Write something bold here. Zines are personal — say what you mean, show what you feel. There are no rules.',
              imageUrl: '',
            },
            {
              title: 'Second Piece',
              author: '',
              content:
                'Keep going. Mix text with images, poetry with rants, art with lists. This is your space.',
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
      content: `// Render zine from config.json — re-run on every preview refresh
fetch('./config.json')
  .then(function (r) { return r.json(); })
  .then(function (data) {
    // Accent color
    var accent = data.accentColor || '#f5f0e8';
    document.documentElement.style.setProperty('--accent', accent);

    // Cover
    document.getElementById('zine-name').textContent = data.zineName || 'MY ZINE';
    document.getElementById('zine-issue').textContent = data.issue || '';

    // Articles
    var main = document.getElementById('articles-content');
    main.innerHTML = '';

    var articles = data.articles || [];
    for (var i = 0; i < articles.length; i++) {
      var article = articles[i];
      var section = document.createElement('section');
      section.className = i % 2 === 1 ? 'spread alt' : 'spread';

      var html = '';
      html += '<h2>' + escapeHtml(article.title || 'Untitled') + '</h2>';

      if (article.author) {
        html += '<p class="author">by ' + escapeHtml(article.author) + '</p>';
      }

      if (article.imageUrl) {
        html += '<img src="' + escapeHtml(article.imageUrl) + '" alt="' + escapeHtml(article.title || '') + '">';
      }

      var paragraphs = (article.content || '').split('\\n').filter(Boolean);
      for (var j = 0; j < paragraphs.length; j++) {
        html += '<p>' + escapeHtml(paragraphs[j]) + '</p>';
      }

      section.innerHTML = html;
      main.appendChild(section);
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
  layout: LAYOUT_BALANCED,
};

export default template;
