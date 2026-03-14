import type { TemplateDefinition } from './index';
import { LAYOUT_BALANCED } from './index';

const template: TemplateDefinition = {
  context:
    'This is a data-driven portfolio template with a project grid. ' +
    'The content lives in config.json — the user can edit it via the form view in the workshop. ' +
    'render.js reads config.json and builds the DOM. Help them add projects, customize cards, and add detail pages.',
  greeting:
    "I've set up a portfolio with a grid of project cards and some starter styling. " +
    "Switch to the Form tab on config.json to add your projects, or edit the data directly. " +
    "The preview updates live as you make changes.",
  schema: {
    fields: [
      { key: 'name', label: 'Name', type: 'text', placeholder: 'Your Name' },
      { key: 'tagline', label: 'Tagline', type: 'text', placeholder: 'Designer / Developer / Creator' },
      { key: 'bio', label: 'Bio', type: 'textarea', placeholder: 'Tell visitors about yourself and your work...' },
      { key: 'accentColor', label: 'Accent Color', type: 'color' },
      {
        key: 'projects',
        label: 'Projects',
        type: 'repeater',
        fields: [
          { key: 'title', label: 'Title', type: 'text', placeholder: 'Project Title' },
          { key: 'description', label: 'Description', type: 'textarea', placeholder: 'Brief description of the project' },
          { key: 'imageUrl', label: 'Image', type: 'image', placeholder: 'https://...' },
          { key: 'linkUrl', label: 'Link URL', type: 'text', placeholder: 'https://...' },
          { key: 'tags', label: 'Tags', type: 'text', placeholder: 'design, web, branding' },
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
  <title>My Portfolio</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header>
    <h1 id="name"></h1>
    <p id="tagline"></p>
    <p id="bio"></p>
  </header>
  <main id="projects" class="projects"></main>
  <script src="render.js"></script>
</body>
</html>`,
    },
    {
      path: 'style.css',
      content: `* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: system-ui, sans-serif; color: #111; background: #fff; }
header {
  padding: 3rem 2rem 2rem;
  max-width: 960px; margin: 0 auto;
}
header h1 { font-size: 1.75rem; font-weight: 700; }
header #tagline { color: var(--accent, #666); margin-top: 0.25rem; font-size: 0.95rem; }
header #bio { color: #444; margin-top: 0.75rem; font-size: 0.9rem; line-height: 1.5; max-width: 600px; }
.projects {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 2rem;
  padding: 2rem;
  max-width: 960px; margin: 0 auto;
}
.project-card {
  text-decoration: none; color: inherit;
  border-radius: 12px; overflow: hidden;
  transition: transform 0.2s;
}
.project-card:hover { transform: translateY(-4px); }
.thumb {
  aspect-ratio: 16/10;
  background: linear-gradient(135deg, #e8e8e8, #d0d0d0);
  display: flex; align-items: center; justify-content: center;
  color: #999; font-size: 0.9rem;
  border-radius: 12px; overflow: hidden;
}
.thumb img { width: 100%; height: 100%; object-fit: cover; }
.project-card h3 { margin-top: 0.75rem; font-size: 1rem; font-weight: 600; }
.project-card p { color: #666; font-size: 0.85rem; margin-top: 0.25rem; }
.tags { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.5rem; }
.tag {
  font-size: 0.7rem; padding: 0.15rem 0.5rem;
  background: var(--accent-bg, #f0f0f0); color: var(--accent, #666);
  border-radius: 999px;
}`,
    },
    {
      path: 'config.json',
      content: JSON.stringify(
        {
          name: 'Your Name',
          tagline: 'Designer / Developer / Creator',
          bio: '',
          accentColor: '#666666',
          projects: [
            {
              title: 'Project Title',
              description: 'Brief description of what this project is about.',
              imageUrl: '',
              linkUrl: '#',
              tags: 'design, web',
            },
            {
              title: 'Another Project',
              description: 'Explain what you made and why it matters.',
              imageUrl: '',
              linkUrl: '#',
              tags: 'branding',
            },
            {
              title: 'One More',
              description: 'Your best work deserves to be seen.',
              imageUrl: '',
              linkUrl: '#',
              tags: 'development',
            },
          ],
        },
        null,
        2,
      ),
    },
    {
      path: 'render.js',
      content: `// Render portfolio from config.json — re-run on every preview refresh
fetch('./config.json')
  .then((r) => r.json())
  .then((data) => {
    document.getElementById('name').textContent = data.name || 'Your Name';
    document.getElementById('tagline').textContent = data.tagline || '';
    document.getElementById('bio').textContent = data.bio || '';

    // Apply accent color
    if (data.accentColor) {
      document.documentElement.style.setProperty('--accent', data.accentColor);
      // Derive a light background tint for tags
      document.documentElement.style.setProperty('--accent-bg', data.accentColor + '18');
    }

    // Build project cards
    const main = document.getElementById('projects');
    main.innerHTML = '';

    for (const project of data.projects || []) {
      const a = document.createElement('a');
      a.className = 'project-card';
      a.href = project.linkUrl || '#';

      const thumb = document.createElement('div');
      thumb.className = 'thumb';
      if (project.imageUrl) {
        const img = document.createElement('img');
        img.src = project.imageUrl;
        img.alt = escapeHtml(project.title || '');
        thumb.appendChild(img);
      } else {
        thumb.textContent = project.title || 'Project';
      }
      a.appendChild(thumb);

      const h3 = document.createElement('h3');
      h3.textContent = project.title || 'Untitled';
      a.appendChild(h3);

      if (project.description) {
        const p = document.createElement('p');
        p.textContent = project.description;
        a.appendChild(p);
      }

      // Render tags
      if (project.tags) {
        const tagsDiv = document.createElement('div');
        tagsDiv.className = 'tags';
        const tagList = project.tags.split(',').map((t) => t.trim()).filter(Boolean);
        for (const tag of tagList) {
          const span = document.createElement('span');
          span.className = 'tag';
          span.textContent = tag;
          tagsDiv.appendChild(span);
        }
        a.appendChild(tagsDiv);
      }

      main.appendChild(a);
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
