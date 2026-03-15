import type { TemplateDefinition } from './index';
import { LAYOUT_WRITING } from './index';

const template: TemplateDefinition = {
  context:
    'This is a data-driven story/creative writing template. ' +
    'The content lives in config.json — the user can edit it via the form view in the workshop. ' +
    'render.js reads config.json and builds the DOM. Help them with the writing itself — characters, plot, pacing, dialogue.',
  greeting:
    "I've set up a story page with nice typesetting for long-form reading — a title, byline, and body text ready to go. You might want to start with your title and opening paragraph, and we can shape the rest from there.",
  schema: {
    fields: [
      { key: 'title', label: 'Title', type: 'text', placeholder: 'Untitled Story' },
      { key: 'author', label: 'Author', type: 'text', placeholder: 'Your name' },
      { key: 'subtitle', label: 'Subtitle', type: 'text', placeholder: 'A short tagline or subtitle' },
      {
        key: 'chapters',
        label: 'Chapters',
        type: 'repeater',
        fields: [
          { key: 'title', label: 'Chapter Title', type: 'text', placeholder: 'Chapter One' },
          { key: 'content', label: 'Content', type: 'textarea', placeholder: 'Write your chapter here...' },
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
  <title>Untitled Story</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <article>
    <header>
      <h1 id="title"></h1>
      <p id="author" class="byline"></p>
      <p id="subtitle" class="subtitle"></p>
    </header>
    <div id="chapters"></div>
  </article>
  <script src="render.js"></script>
</body>
</html>`,
    },
    {
      path: 'style.css',
      content: `* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: Georgia, 'Times New Roman', serif;
  line-height: 1.9;
  color: #1a1a1a;
  background: #fffff8;
  max-width: 580px;
  margin: 0 auto;
  padding: 4rem 1.5rem;
}
article header { text-align: center; margin-bottom: 3rem; }
article h1 { font-size: 2rem; font-weight: 400; letter-spacing: 0.02em; margin-bottom: 0.5rem; }
.byline { color: #999; font-style: italic; font-size: 0.9rem; }
.subtitle { color: #777; font-size: 0.95rem; margin-top: 0.25rem; }
section { margin-bottom: 2.5rem; }
section h2 { font-size: 1.35rem; font-weight: 400; text-align: center; margin-bottom: 1.5rem; color: #444; letter-spacing: 0.03em; }
section p { margin-bottom: 1.25rem; text-indent: 1.5em; }
section p:first-of-type { text-indent: 0; }
section hr { border: none; text-align: center; margin: 2rem 0; }
section hr::before { content: '* * *'; color: #ccc; letter-spacing: 0.5em; }`,
    },
    {
      path: 'config.json',
      content: JSON.stringify(
        {
          title: 'Untitled Story',
          author: 'You',
          subtitle: '',
          chapters: [
            {
              title: '',
              content:
                'The story begins here.\n\nReplace this with your opening paragraph — set the scene, introduce a character, drop the reader into a moment.',
            },
          ],
        },
        null,
        2,
      ),
    },
    {
      path: 'render.js',
      content: `// Render story from config.json — re-run on every preview refresh
fetch('./config.json')
  .then((r) => r.json())
  .then((data) => {
    // Main title in header
    const titleEl = document.getElementById('title');
    titleEl.textContent = data.title || 'Untitled Story';

    // Update page title
    document.title = (data.title || 'Untitled Story') + ' - Literary Story';

    // Author
    const authorEl = document.getElementById('author');
    if (data.author && data.author !== 'You') {
      authorEl.textContent = data.author;
    } else {
      authorEl.textContent = 'Your Name';
    }

    // Subtitle
    const subtitleEl = document.getElementById('subtitle');
    if (data.subtitle) {
      subtitleEl.textContent = data.subtitle;
    } else {
      subtitleEl.style.display = 'none';
    }

    // Chapters
    const container = document.getElementById('chapters');
    container.innerHTML = '';

    for (let i = 0; i < (data.chapters || []).length; i++) {
      const chapter = data.chapters[i];
      const section = document.createElement('div');
      section.className = 'chapter';

      if (chapter.title) {
        const h2 = document.createElement('h2');
        h2.className = 'chapter-title';
        h2.textContent = chapter.title;
        section.appendChild(h2);
      }

      const paragraphs = (chapter.content || '').split(/\\n\\s*\\n/);
      for (const para of paragraphs) {
        const trimmed = para.trim();
        if (!trimmed) continue;
        const p = document.createElement('p');
        p.innerHTML = formatText(trimmed);
        section.appendChild(p);
      }

      container.appendChild(section);

      // Add section break between chapters (except after the last one)
      if (i < data.chapters.length - 1) {
        const sectionBreak = document.createElement('div');
        sectionBreak.className = 'section-break';
        container.appendChild(sectionBreak);
      }
    }
  })
  .catch((err) => console.warn('render.js: could not load config.json', err));

// Theme toggle functionality
document.addEventListener('DOMContentLoaded', function() {
  const themeToggle = document.getElementById('themeToggle');
  const html = document.documentElement;

  // Check for saved theme preference or default to light mode
  const currentTheme = localStorage.getItem('theme') || 'light';
  html.setAttribute('data-theme', currentTheme);

  if (themeToggle) {
    themeToggle.addEventListener('click', function() {
      const currentTheme = html.getAttribute('data-theme');
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

      html.setAttribute('data-theme', newTheme);
      localStorage.setItem('theme', newTheme);
    });
  }
});

function formatText(str) {
  // Convert basic quotes to smart quotes
  str = str.replace(/"/g, '\\u201c').replace(/"/g, '\\u201d');
  str = str.replace(/'/g, '\\u2018').replace(/'/g, '\\u2019');

  // Escape HTML but preserve basic formatting
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}`,
    },
  ],
  layout: LAYOUT_WRITING,
};

export default template;
