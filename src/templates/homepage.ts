import type { TemplateDefinition } from './index';
import { LAYOUT_BALANCED } from './index';

const template: TemplateDefinition = {
  context:
    'This is a data-driven personal homepage template with a hero section, about sections, and links. ' +
    'The content lives in config.json — the user can edit it via the form view in the workshop. ' +
    'render.js reads config.json and builds the DOM. Help them customize content, add sections, and make it their own.',
  greeting:
    "I've set up a homepage with a hero section and some link cards — all editable through the form view. " +
    "Switch to the Form tab on config.json to put your name in and update the intro text, " +
    "or edit the data directly. The preview updates live as you make changes.",
  schema: {
    fields: [
      { key: 'siteName', label: 'Site Name', type: 'text', placeholder: 'My Site' },
      { key: 'heroTitle', label: 'Hero Title', type: 'text', placeholder: 'Your Name' },
      { key: 'heroSubtitle', label: 'Hero Subtitle', type: 'text', placeholder: 'A short bio about who you are and what you do.' },
      { key: 'accentColor', label: 'Accent Color', type: 'color' },
      {
        key: 'sections',
        label: 'Sections',
        type: 'repeater',
        fields: [
          { key: 'title', label: 'Title', type: 'text', placeholder: 'About' },
          { key: 'content', label: 'Content', type: 'textarea', placeholder: 'Tell visitors about this topic...' },
        ],
      },
      {
        key: 'links',
        label: 'Links',
        type: 'repeater',
        fields: [
          { key: 'label', label: 'Label', type: 'text', placeholder: 'Projects' },
          { key: 'url', label: 'URL', type: 'text', placeholder: 'https://...' },
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
  <title id="site-title">My Site</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div class="container">
    <header class="hero">
      <h1>Hello, I'm <span class="accent" id="hero-title">Your Name</span></h1>
      <p id="hero-subtitle">A short bio about who you are and what you do.</p>
    </header>
    <div id="sections-content"></div>
    <section class="links" id="links-content"></section>
    <footer>
      <p>&copy; 2026</p>
    </footer>
  </div>
  <script src="render.js"></script>
</body>
</html>`,
    },
    {
      path: 'style.css',
      content: `* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: system-ui, -apple-system, sans-serif;
  line-height: 1.6;
  color: #1a1a2e;
  background: #f0f0f5;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
}
.container { max-width: 480px; padding: 2rem; text-align: center; }
.hero { margin-bottom: 2.5rem; }
.hero h1 { font-size: 2rem; font-weight: 700; margin-bottom: 0.75rem; }
.accent { color: var(--accent, #6366f1); }
.hero p { color: #666; font-size: 1rem; }
.section { margin-bottom: 2rem; text-align: left; }
.section h2 { font-size: 1.25rem; font-weight: 600; margin-bottom: 0.5rem; color: var(--accent, #6366f1); }
.section p { color: #555; font-size: 0.95rem; }
.links { display: flex; flex-direction: column; gap: 0.75rem; margin-bottom: 3rem; }
.link-card {
  display: block; padding: 0.875rem 1.25rem;
  background: white; border-radius: 12px;
  text-decoration: none; color: #1a1a2e;
  font-weight: 500; font-size: 0.95rem;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
  transition: transform 0.15s, box-shadow 0.15s;
}
.link-card:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.12); }
footer { color: #aaa; font-size: 0.8rem; }`,
    },
    {
      path: 'config.json',
      content: JSON.stringify(
        {
          siteName: 'My Site',
          heroTitle: 'Your Name',
          heroSubtitle: 'A short bio about who you are and what you do. Make it personal.',
          accentColor: '#6366f1',
          sections: [
            { title: 'About', content: 'Tell visitors a bit about yourself — what you do, what you care about, what brings you here.' },
          ],
          links: [
            { label: 'Projects', url: '#' },
            { label: 'Writing', url: '#' },
            { label: 'Contact', url: '#' },
          ],
        },
        null,
        2,
      ),
    },
    {
      path: 'render.js',
      content: `// Render homepage from config.json — re-run on every preview refresh
fetch('./config.json')
  .then((r) => r.json())
  .then((data) => {
    // Site title
    document.getElementById('site-title').textContent = data.siteName || 'My Site';

    // Hero
    document.getElementById('hero-title').textContent = data.heroTitle || 'Your Name';
    document.getElementById('hero-subtitle').textContent = data.heroSubtitle || '';

    // Accent color
    if (data.accentColor) {
      document.documentElement.style.setProperty('--accent', data.accentColor);
    }

    // Sections
    const sectionsEl = document.getElementById('sections-content');
    sectionsEl.innerHTML = '';

    for (const section of data.sections || []) {
      const div = document.createElement('div');
      div.className = 'section';
      div.innerHTML =
        '<h2>' + escapeHtml(section.title || '') + '</h2>' +
        '<p>' + escapeHtml(section.content || '') + '</p>';
      sectionsEl.appendChild(div);
    }

    // Links
    const linksEl = document.getElementById('links-content');
    linksEl.innerHTML = '';

    for (const link of data.links || []) {
      const a = document.createElement('a');
      a.className = 'link-card';
      a.href = link.url || '#';
      a.textContent = link.label || 'Link';
      linksEl.appendChild(a);
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
