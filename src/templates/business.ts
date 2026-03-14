import type { TemplateDefinition } from './index';
import { LAYOUT_BALANCED } from './index';

const template: TemplateDefinition = {
  context:
    'This is a data-driven business/company page template with hero, services, about, and contact sections. ' +
    'The content lives in config.json — the user can edit it via the form view in the workshop. ' +
    'render.js reads config.json and populates the DOM. Help them customize content, add testimonials, and improve branding.',
  greeting:
    "I've set up a business page with a hero, services section, about area, and contact info — all editable through the form view. " +
    "Switch to the Form tab on config.json to update your business name, services, and contact details, or edit the data directly. " +
    "The preview updates live as you make changes.",
  schema: {
    fields: [
      { key: 'businessName', label: 'Business Name', type: 'text', placeholder: 'Business Name' },
      { key: 'tagline', label: 'Tagline', type: 'text', placeholder: 'Your business tagline goes here' },
      { key: 'ctaText', label: 'CTA Button Text', type: 'text', placeholder: 'Get in Touch' },
      { key: 'ctaUrl', label: 'CTA Button URL', type: 'text', placeholder: '#contact' },
      { key: 'accentColor', label: 'Accent Color', type: 'color' },
      { key: 'about', label: 'About', type: 'textarea', placeholder: 'Tell your story. Why does your business exist? What makes you different?' },
      {
        key: 'services',
        label: 'Services',
        type: 'repeater',
        fields: [
          { key: 'title', label: 'Title', type: 'text', placeholder: 'Service Name' },
          { key: 'description', label: 'Description', type: 'text', placeholder: 'Describe what you offer.' },
        ],
      },
      { key: 'contactEmail', label: 'Contact Email', type: 'text', placeholder: 'hello@example.com' },
      { key: 'contactPhone', label: 'Contact Phone', type: 'text', placeholder: '(555) 123-4567' },
      { key: 'contactAddress', label: 'Contact Address', type: 'text', placeholder: '123 Main St, City, ST 12345' },
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
  <title>My Business</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <nav class="topnav">
    <strong id="nav-name"></strong>
    <div class="nav-links">
      <a href="#services">Services</a>
      <a href="#about">About</a>
      <a href="#contact">Contact</a>
    </div>
  </nav>
  <header class="hero">
    <h1 id="hero-tagline"></h1>
    <p id="hero-description">A brief description of what you do and who you serve.</p>
    <a id="hero-cta" href="#contact" class="cta">Get in Touch</a>
  </header>
  <section id="services" class="section">
    <h2>Services</h2>
    <div id="services-grid" class="grid"></div>
  </section>
  <section id="about" class="section alt">
    <h2>About</h2>
    <p id="about-text"></p>
  </section>
  <section id="contact" class="section">
    <h2>Contact</h2>
    <div id="contact-info"></div>
  </section>
  <footer>
    <p id="footer-text"></p>
  </footer>
  <script src="render.js"></script>
</body>
</html>`,
    },
    {
      path: 'style.css',
      content: `* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: system-ui, sans-serif; color: #1a1a1a; }
.topnav {
  display: flex; align-items: center; justify-content: space-between;
  padding: 1rem 2rem; border-bottom: 1px solid #eee;
}
.nav-links { display: flex; gap: 1.5rem; }
.nav-links a { color: #555; text-decoration: none; font-size: 0.9rem; }
.nav-links a:hover { color: #111; }
.hero {
  text-align: center; padding: 5rem 2rem 4rem;
  background: linear-gradient(135deg, #f8f9ff, #eef0ff);
}
.hero h1 { font-size: 2.25rem; font-weight: 700; max-width: 600px; margin: 0 auto 1rem; }
.hero p { color: #555; font-size: 1.1rem; max-width: 500px; margin: 0 auto 1.5rem; }
.cta {
  display: inline-block; padding: 0.75rem 2rem;
  background: var(--accent, #2563eb); color: white; border-radius: 8px;
  text-decoration: none; font-weight: 500;
  transition: background 0.2s;
}
.cta:hover { filter: brightness(0.9); }
.section { padding: 4rem 2rem; max-width: 800px; margin: 0 auto; }
.section.alt { background: #f8f8f8; max-width: 100%; }
.section.alt > * { max-width: 800px; margin-left: auto; margin-right: auto; }
.section h2 { font-size: 1.5rem; margin-bottom: 1.5rem; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.5rem; }
.card { padding: 1.5rem; background: white; border-radius: 12px; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
.card h3 { font-size: 1rem; margin-bottom: 0.5rem; }
.card p { color: #555; font-size: 0.9rem; }
#contact-info p { margin-bottom: 0.5rem; }
#contact-info a { color: var(--accent, #2563eb); text-decoration: none; }
#contact-info a:hover { text-decoration: underline; }
footer { text-align: center; padding: 2rem; color: #aaa; font-size: 0.8rem; border-top: 1px solid #eee; }`,
    },
    {
      path: 'config.json',
      content: JSON.stringify(
        {
          businessName: 'Business Name',
          tagline: 'Your business tagline goes here',
          ctaText: 'Get in Touch',
          ctaUrl: '#contact',
          accentColor: '#2563eb',
          about: 'Tell your story. Why does your business exist? What makes you different?',
          services: [
            { title: 'Service One', description: 'Describe what you offer.' },
            { title: 'Service Two', description: 'Explain the value.' },
            { title: 'Service Three', description: 'Make it clear and compelling.' },
          ],
          contactEmail: 'hello@example.com',
          contactPhone: '',
          contactAddress: '',
        },
        null,
        2,
      ),
    },
    {
      path: 'render.js',
      content: `// Render business page from config.json — re-run on every preview refresh
fetch('./config.json')
  .then((r) => r.json())
  .then((data) => {
    const name = data.businessName || 'Business Name';

    // Nav & footer
    document.getElementById('nav-name').textContent = name;
    document.getElementById('footer-text').textContent = '\\u00A9 ${new Date().getFullYear()} ' + name;

    // Hero
    document.getElementById('hero-tagline').textContent = data.tagline || '';
    const cta = document.getElementById('hero-cta');
    cta.textContent = data.ctaText || 'Get in Touch';
    cta.href = data.ctaUrl || '#contact';

    // Accent color
    if (data.accentColor) {
      document.documentElement.style.setProperty('--accent', data.accentColor);
    }

    // About
    document.getElementById('about-text').textContent = data.about || '';

    // Services
    const grid = document.getElementById('services-grid');
    grid.innerHTML = '';
    for (const svc of data.services || []) {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML =
        '<h3>' + escapeHtml(svc.title || '') + '</h3>' +
        '<p>' + escapeHtml(svc.description || '') + '</p>';
      grid.appendChild(card);
    }

    // Contact
    const info = document.getElementById('contact-info');
    info.innerHTML = '';
    if (data.contactEmail) {
      const p = document.createElement('p');
      p.innerHTML = 'Email: <a href="mailto:' + escapeHtml(data.contactEmail) + '">' + escapeHtml(data.contactEmail) + '</a>';
      info.appendChild(p);
    }
    if (data.contactPhone) {
      const p = document.createElement('p');
      p.innerHTML = 'Phone: <a href="tel:' + escapeHtml(data.contactPhone) + '">' + escapeHtml(data.contactPhone) + '</a>';
      info.appendChild(p);
    }
    if (data.contactAddress) {
      const p = document.createElement('p');
      p.textContent = 'Address: ' + data.contactAddress;
      info.appendChild(p);
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
