import type { TemplateDefinition } from './index';
import { LAYOUT_CHAT } from './index';

const template: TemplateDefinition = {
  context:
    'This is a data-driven link-in-bio page template (like Linktree). ' +
    'The content lives in config.json — the user can edit it via the form view in the workshop. ' +
    'render.js reads config.json and builds the DOM. Help them customize links, bio, and styling.',
  greeting:
    "I've set up a link-in-bio page with an avatar spot, a short bio, and some starter buttons. " +
    "Switch to the Form tab on config.json to add your links and personalize, or edit the data directly. " +
    "The preview updates live as you make changes.",
  schema: {
    fields: [
      { key: 'displayName', label: 'Display Name', type: 'text', placeholder: 'Your Name' },
      { key: 'bio', label: 'Bio', type: 'text', placeholder: 'A short bio about you' },
      { key: 'avatarUrl', label: 'Avatar', type: 'image' },
      { key: 'backgroundColor', label: 'Background Color', type: 'color' },
      {
        key: 'links',
        label: 'Links',
        type: 'repeater',
        fields: [
          { key: 'label', label: 'Label', type: 'text', placeholder: 'Website' },
          { key: 'url', label: 'URL', type: 'text', placeholder: 'https://example.com' },
          { key: 'icon', label: 'Icon', type: 'text', placeholder: 'Optional emoji or symbol' },
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
  <title>My Links</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div class="container">
    <div id="avatar" class="avatar">?</div>
    <h1 id="display-name"></h1>
    <p id="bio" class="bio"></p>
    <div id="links" class="links"></div>
    <p class="footer">Made with Crux Garden</p>
  </div>
  <script src="render.js"></script>
</body>
</html>`,
    },
    {
      path: 'style.css',
      content: `* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: system-ui, sans-serif;
  min-height: 100vh;
  display: flex; align-items: center; justify-content: center;
  background: var(--bg-color, linear-gradient(135deg, #667eea 0%, #764ba2 100%));
  color: white;
}
.container { width: 100%; max-width: 400px; padding: 2rem; text-align: center; }
.avatar {
  width: 80px; height: 80px; border-radius: 50%;
  background: rgba(255,255,255,0.2); margin: 0 auto 1rem;
  display: flex; align-items: center; justify-content: center;
  font-size: 2rem; overflow: hidden;
}
.avatar img { width: 100%; height: 100%; object-fit: cover; }
h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 0.25rem; }
.bio { opacity: 0.8; font-size: 0.9rem; margin-bottom: 2rem; }
.links { display: flex; flex-direction: column; gap: 0.75rem; }
.link {
  display: block; padding: 0.875rem;
  background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.25);
  border-radius: 12px; color: white; text-decoration: none;
  font-weight: 500; font-size: 0.95rem;
  backdrop-filter: blur(4px);
  transition: background 0.2s, transform 0.15s;
}
.link:hover { background: rgba(255,255,255,0.25); transform: translateY(-2px); }
.link-icon { margin-right: 0.5em; }
.footer { margin-top: 2rem; opacity: 0.5; font-size: 0.75rem; }`,
    },
    {
      path: 'config.json',
      content: JSON.stringify(
        {
          displayName: 'Your Name',
          bio: 'A short bio about you',
          avatarUrl: '',
          backgroundColor: '#667eea',
          links: [
            { label: 'Website', url: '#', icon: '' },
            { label: 'Twitter / X', url: '#', icon: '' },
            { label: 'GitHub', url: '#', icon: '' },
            { label: 'Email Me', url: '#', icon: '' },
          ],
        },
        null,
        2,
      ),
    },
    {
      path: 'render.js',
      content: `// Render links page from config.json — re-run on every preview refresh
fetch('./config.json')
  .then((r) => r.json())
  .then((data) => {
    // Display name
    document.getElementById('display-name').textContent = data.displayName || 'Your Name';

    // Bio
    document.getElementById('bio').textContent = data.bio || '';

    // Avatar
    const avatarEl = document.getElementById('avatar');
    if (data.avatarUrl) {
      avatarEl.innerHTML = '<img src="' + escapeHtml(data.avatarUrl) + '" alt="Avatar">';
    } else {
      avatarEl.textContent = '?';
    }

    // Background color
    if (data.backgroundColor) {
      document.body.style.setProperty(
        '--bg-color',
        'linear-gradient(135deg, ' + data.backgroundColor + ' 0%, #764ba2 100%)'
      );
    }

    // Build link buttons
    const container = document.getElementById('links');
    container.innerHTML = '';

    for (const link of data.links || []) {
      const a = document.createElement('a');
      a.className = 'link';
      a.href = link.url || '#';
      a.target = '_blank';
      a.rel = 'noopener noreferrer';

      let inner = '';
      if (link.icon) {
        inner += '<span class="link-icon">' + escapeHtml(link.icon) + '</span>';
      }
      inner += escapeHtml(link.label || 'Link');
      a.innerHTML = inner;

      container.appendChild(a);
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
  layout: LAYOUT_CHAT,
};

export default template;
