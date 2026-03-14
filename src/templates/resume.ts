import type { TemplateDefinition } from './index';
import { LAYOUT_CHAT } from './index';

const template: TemplateDefinition = {
  context:
    'This is a data-driven online resume/CV template with sections for experience, education, and skills. ' +
    'The resume content lives in config.json — the user can edit it via the form view in the workshop. ' +
    'render.js reads config.json and builds the DOM. Help them fill in their details and refine the design.',
  greeting:
    "I've set up a resume page with sections for experience, education, and skills — all editable through the form view. " +
    "Switch to the Form tab on config.json to fill in your details, or edit the data directly. " +
    "Start by filling in your name and most recent role — we can work through the rest section by section.",
  schema: {
    fields: [
      { key: 'name', label: 'Name', type: 'text', placeholder: 'Your Name' },
      { key: 'title', label: 'Title / Tagline', type: 'text', placeholder: 'Your Title' },
      { key: 'email', label: 'Email', type: 'text', placeholder: 'email@example.com' },
      { key: 'phone', label: 'Phone', type: 'text', placeholder: '+1 (555) 000-0000' },
      { key: 'location', label: 'Location', type: 'text', placeholder: 'City, Country' },
      { key: 'summary', label: 'Summary', type: 'textarea', placeholder: 'A brief professional summary...' },
      {
        key: 'sections',
        label: 'Sections',
        type: 'repeater',
        fields: [
          { key: 'sectionTitle', label: 'Section Title', type: 'text', placeholder: 'Experience' },
          {
            key: 'items',
            label: 'Items',
            type: 'repeater',
            fields: [
              { key: 'title', label: 'Title', type: 'text', placeholder: 'Job Title at Company' },
              { key: 'subtitle', label: 'Subtitle', type: 'text', placeholder: 'Organization or detail' },
              { key: 'date', label: 'Date', type: 'text', placeholder: '2024 — Present' },
              { key: 'description', label: 'Description', type: 'textarea', placeholder: 'Describe your responsibilities and achievements.' },
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
  <title>My Resume</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div class="resume">
    <header>
      <h1 id="name"></h1>
      <p class="title" id="title"></p>
      <p class="contact" id="contact"></p>
    </header>
    <div id="summary-section" class="summary-section">
      <p id="summary"></p>
    </div>
    <main id="sections"></main>
  </div>
  <script src="render.js"></script>
</body>
</html>`,
    },
    {
      path: 'style.css',
      content: `* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: system-ui, sans-serif; color: #222; background: #f5f5f5; padding: 2rem 1rem; }
.resume {
  max-width: 700px; margin: 0 auto; background: white;
  padding: 3rem; border-radius: 8px; box-shadow: 0 1px 8px rgba(0,0,0,0.06);
}
header { margin-bottom: 2rem; border-bottom: 2px solid #111; padding-bottom: 1.5rem; }
header h1 { font-size: 2rem; font-weight: 700; }
.title { color: #555; font-size: 1rem; margin-top: 0.25rem; }
.contact { color: #888; font-size: 0.85rem; margin-top: 0.25rem; }
.summary-section { margin-bottom: 2rem; }
.summary-section p { color: #555; font-size: 0.9rem; line-height: 1.6; }
section { margin-bottom: 2rem; }
section h2 {
  font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.1em;
  color: #888; margin-bottom: 1rem;
}
.item { display: flex; gap: 1.5rem; margin-bottom: 1.25rem; }
.meta { flex-shrink: 0; width: 120px; }
.period { font-size: 0.8rem; color: #888; }
.details h3 { font-size: 0.95rem; font-weight: 600; }
.org { font-weight: 400; color: #666; }
.details p { color: #555; font-size: 0.85rem; margin-top: 0.25rem; line-height: 1.5; }`,
    },
    {
      path: 'config.json',
      content: JSON.stringify(
        {
          name: 'Your Name',
          title: 'Your Title',
          email: 'email@example.com',
          phone: '',
          location: 'City, Country',
          summary: '',
          sections: [
            {
              sectionTitle: 'Experience',
              items: [
                {
                  title: 'Job Title',
                  subtitle: 'at Company',
                  date: '2024 — Present',
                  description: 'Describe your responsibilities and achievements.',
                },
                {
                  title: 'Previous Role',
                  subtitle: 'at Organization',
                  date: '2022 — 2024',
                  description: 'What did you accomplish here?',
                },
              ],
            },
            {
              sectionTitle: 'Education',
              items: [
                {
                  title: 'Degree',
                  subtitle: 'University Name',
                  date: '2018 — 2022',
                  description: '',
                },
              ],
            },
          ],
        },
        null,
        2,
      ),
    },
    {
      path: 'render.js',
      content: `// Render resume from config.json — re-run on every preview refresh
fetch('./config.json')
  .then((r) => r.json())
  .then((data) => {
    document.getElementById('name').textContent = data.name || '';
    document.getElementById('title').textContent = data.title || '';

    // Build contact line
    const parts = [data.email, data.phone, data.location].filter(Boolean);
    document.getElementById('contact').textContent = parts.join(' \\u00B7 ');

    // Summary
    const summarySection = document.getElementById('summary-section');
    if (data.summary) {
      document.getElementById('summary').textContent = data.summary;
      summarySection.style.display = '';
    } else {
      summarySection.style.display = 'none';
    }

    // Build sections
    const main = document.getElementById('sections');
    main.innerHTML = '';

    for (const sec of data.sections || []) {
      const section = document.createElement('section');

      const h2 = document.createElement('h2');
      h2.textContent = sec.sectionTitle || 'Section';
      section.appendChild(h2);

      for (const item of sec.items || []) {
        const div = document.createElement('div');
        div.className = 'item';

        const meta = '<div class="meta"><span class="period">' + escapeHtml(item.date || '') + '</span></div>';
        const subtitle = item.subtitle ? ' <span class="org">' + escapeHtml(item.subtitle) + '</span>' : '';
        const desc = item.description ? '<p>' + escapeHtml(item.description) + '</p>' : '';
        const details = '<div class="details"><h3>' + escapeHtml(item.title || '') + subtitle + '</h3>' + desc + '</div>';

        div.innerHTML = meta + details;
        section.appendChild(div);
      }

      main.appendChild(section);
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
