import type { TemplateDefinition } from './index';
import { LAYOUT_BALANCED } from './index';

const template: TemplateDefinition = {
  context:
    'This is a data-driven event page template with date, location, schedule, and details. ' +
    'The event content lives in config.json — the user can edit it via the form view in the workshop. ' +
    'render.js reads config.json and builds the DOM. Help them customize all the details.',
  greeting:
    "I've set up an event page with a hero, date and location details, and a schedule section. " +
    "Switch to the Form tab on config.json to fill in your event name and when it's happening — " +
    "we can flesh out the rest from there.",
  schema: {
    fields: [
      { key: 'eventName', label: 'Event Name', type: 'text', placeholder: 'Event Name' },
      { key: 'tagline', label: 'Tagline', type: 'text', placeholder: "You're Invited" },
      { key: 'date', label: 'Date', type: 'text', placeholder: 'Saturday, April 5, 2026' },
      { key: 'time', label: 'Time', type: 'text', placeholder: '6:00 PM' },
      { key: 'location', label: 'Location', type: 'text', placeholder: 'The Venue · 123 Main St, City' },
      { key: 'description', label: 'Description', type: 'textarea', placeholder: 'Tell your guests what to expect — dress code, parking, what to bring, or just a warm welcome.' },
      { key: 'accentColor', label: 'Accent Color', type: 'color' },
      {
        key: 'schedule',
        label: 'Schedule',
        type: 'repeater',
        fields: [
          { key: 'time', label: 'Time', type: 'text', placeholder: '6:00 PM' },
          { key: 'title', label: 'Title', type: 'text', placeholder: 'Doors Open' },
          { key: 'description', label: 'Description', type: 'text', placeholder: 'Optional description' },
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
  <title>My Event</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header class="hero">
    <p class="label" id="tagline">You're Invited</p>
    <h1 id="event-name">Event Name</h1>
    <p class="date" id="date-time">Saturday, April 5, 2026 · 6:00 PM</p>
    <p class="location" id="location">The Venue · 123 Main St, City</p>
  </header>
  <main>
    <section class="details">
      <h2>Details</h2>
      <p id="description"></p>
    </section>
    <section class="schedule">
      <h2>Schedule</h2>
      <div id="schedule-content"></div>
    </section>
  </main>
  <script src="render.js"></script>
</body>
</html>`,
    },
    {
      path: 'style.css',
      content: `* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: system-ui, sans-serif; color: #222; background: #faf9f6; }
.hero {
  text-align: center; padding: 5rem 2rem 4rem;
  background: linear-gradient(135deg, #fdf6e3, #fef9ef);
}
.label { text-transform: uppercase; letter-spacing: 0.15em; font-size: 0.8rem; color: var(--accent, #b8860b); margin-bottom: 0.75rem; }
.hero h1 { font-size: 2.5rem; font-weight: 700; margin-bottom: 0.75rem; }
.date { font-size: 1.1rem; color: #555; }
.location { color: #888; font-size: 0.95rem; margin-top: 0.25rem; }
main { max-width: 600px; margin: 0 auto; padding: 3rem 1.5rem; }
section { margin-bottom: 2.5rem; }
section h2 { font-size: 1.25rem; font-weight: 600; margin-bottom: 1rem; }
section p { color: #555; line-height: 1.7; }
.timeline-item {
  padding: 0.75rem 0;
  border-bottom: 1px solid #eee;
  font-size: 0.95rem;
}
.time { font-weight: 600; margin-right: 1rem; color: var(--accent, #b8860b); }
.item-desc { color: #888; font-size: 0.85rem; margin-top: 0.15rem; }`,
    },
    {
      path: 'config.json',
      content: JSON.stringify(
        {
          eventName: 'Event Name',
          tagline: "You're Invited",
          date: 'Saturday, April 5, 2026',
          time: '6:00 PM',
          location: 'The Venue · 123 Main St, City',
          description: 'Tell your guests what to expect — dress code, parking, what to bring, or just a warm welcome.',
          accentColor: '#b8860b',
          schedule: [
            { time: '6:00 PM', title: 'Doors Open', description: '' },
            { time: '6:30 PM', title: 'Welcome & Introductions', description: '' },
            { time: '7:00 PM', title: 'Main Event', description: '' },
            { time: '9:00 PM', title: 'Wrap Up', description: '' },
          ],
        },
        null,
        2,
      ),
    },
    {
      path: 'render.js',
      content: `// Render event from config.json — re-run on every preview refresh
fetch('./config.json')
  .then((r) => r.json())
  .then((data) => {
    document.getElementById('event-name').textContent = data.eventName || 'Event Name';
    document.getElementById('tagline').textContent = data.tagline || '';

    // Date and time combined
    const parts = [data.date, data.time].filter(Boolean);
    document.getElementById('date-time').textContent = parts.join(' · ');

    document.getElementById('location').textContent = data.location || '';
    document.getElementById('description').textContent = data.description || '';

    // Apply accent color
    if (data.accentColor) {
      document.documentElement.style.setProperty('--accent', data.accentColor);
    }

    // Build schedule
    const container = document.getElementById('schedule-content');
    container.innerHTML = '';

    for (const entry of data.schedule || []) {
      const div = document.createElement('div');
      div.className = 'timeline-item';

      let html = '<span class="time">' + escapeHtml(entry.time || '') + '</span>' +
        escapeHtml(entry.title || '');

      if (entry.description) {
        html += '<div class="item-desc">' + escapeHtml(entry.description) + '</div>';
      }

      div.innerHTML = html;
      container.appendChild(div);
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
