import type { TemplateDefinition } from './index';
import { LAYOUT_WORKSHOP } from './index';

const template: TemplateDefinition = {
  context:
    'This is a pet rock profile page — an absurd, loving tribute to a rock treated as a beloved pet. ' +
    'The content lives in config.json — the user edits via the form view. ' +
    'render.js reads config.json and builds the profile. Help them take their rock very seriously.',
  greeting:
    "I've set up a profile page for your pet rock — complete with stats, personality traits, care instructions, and a testimonials section. " +
    "Switch to the Form tab on config.json to introduce your rock to the world. They deserve it.",
  schema: {
    fields: [
      { key: 'rockName', label: 'Rock Name', type: 'text', placeholder: 'Gerald' },
      { key: 'species', label: 'Species / Type', type: 'text', placeholder: 'Igneous (but emotionally sedimentary)' },
      { key: 'photoUrl', label: 'Rock Photo', type: 'image' },
      { key: 'age', label: 'Age', type: 'text', placeholder: '4.5 billion years (approx.)' },
      { key: 'weight', label: 'Weight', type: 'text', placeholder: '247g of pure presence' },
      { key: 'bio', label: 'Bio', type: 'textarea', placeholder: 'Gerald was found at the beach in 2019. He immediately radiated calm energy and has been a loyal companion ever since.' },
      { key: 'accentColor', label: 'Theme Color', type: 'color' },
      {
        key: 'traits',
        label: 'Personality Traits',
        type: 'repeater',
        fields: [
          { key: 'trait', label: 'Trait', type: 'text', placeholder: 'Very stable' },
          { key: 'rating', label: 'Rating (1-10)', type: 'number' },
        ],
      },
      {
        key: 'careInstructions',
        label: 'Care Instructions',
        type: 'repeater',
        fields: [
          { key: 'instruction', label: 'Instruction', type: 'text', placeholder: 'Place near window for optimal sun absorption' },
        ],
      },
      {
        key: 'testimonials',
        label: 'Testimonials',
        type: 'repeater',
        fields: [
          { key: 'author', label: 'From', type: 'text', placeholder: 'A satisfied shelf' },
          { key: 'quote', label: 'Quote', type: 'text', placeholder: 'Gerald has never once complained. 10/10.' },
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
  <title>Meet My Rock</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div class="container">
    <div class="hero">
      <div id="rock-photo" class="rock-photo">
        <div class="rock-placeholder">&#129704;</div>
      </div>
      <h1 id="rock-name" class="rock-name"></h1>
      <p id="species" class="species"></p>
    </div>

    <div class="stats-bar">
      <div class="stat"><span class="stat-label">Age</span><span id="stat-age" class="stat-value"></span></div>
      <div class="stat"><span class="stat-label">Weight</span><span id="stat-weight" class="stat-value"></span></div>
      <div class="stat"><span class="stat-label">Mood</span><span class="stat-value">Steadfast</span></div>
      <div class="stat"><span class="stat-label">Energy</span><span class="stat-value">Potential</span></div>
    </div>

    <section class="section">
      <h2>About</h2>
      <p id="bio" class="bio"></p>
    </section>

    <section class="section">
      <h2>Personality Assessment</h2>
      <div id="traits" class="traits"></div>
    </section>

    <section class="section">
      <h2>Care Guide</h2>
      <ol id="care" class="care-list"></ol>
    </section>

    <section class="section">
      <h2>What Others Say</h2>
      <div id="testimonials" class="testimonials"></div>
    </section>

    <footer class="footer">
      <p>No rocks were harmed in the making of this page.</p>
      <p class="small">Rock rights are human rights. Adopt, don't shop.</p>
    </footer>
  </div>
  <script src="render.js"></script>
</body>
</html>`,
    },
    {
      path: 'style.css',
      content: `@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;500;700&display=swap');

* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  min-height: 100vh;
  background: #f5f0eb;
  color: #2a2a2a;
  font-family: 'Outfit', system-ui, sans-serif;
  font-weight: 300;
}
.container {
  max-width: 560px; margin: 0 auto;
  padding: 3rem 1.5rem;
}
.hero { text-align: center; margin-bottom: 2rem; }
.rock-photo {
  width: 160px; height: 160px;
  margin: 0 auto 1.25rem;
  border-radius: 50%;
  background: #e8e0d8;
  border: 4px solid var(--accent, #8B7355);
  display: flex; align-items: center; justify-content: center;
  overflow: hidden;
  box-shadow: 0 4px 20px rgba(0,0,0,0.1);
}
.rock-photo img { width: 100%; height: 100%; object-fit: cover; }
.rock-placeholder { font-size: 4rem; }
.rock-name {
  font-size: 2.5rem; font-weight: 700;
  color: var(--accent, #8B7355);
  margin-bottom: 0.25rem;
}
.species {
  font-size: 0.95rem; color: #888;
  font-style: italic;
}
.stats-bar {
  display: grid; grid-template-columns: repeat(4, 1fr);
  gap: 0.5rem; margin-bottom: 2.5rem;
  background: white;
  border-radius: 12px; padding: 1rem;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
}
.stat { text-align: center; }
.stat-label {
  display: block; font-size: 0.65rem;
  text-transform: uppercase; letter-spacing: 1px;
  color: #aaa; margin-bottom: 0.25rem;
}
.stat-value {
  display: block; font-weight: 500;
  font-size: 0.85rem; color: #333;
}
.section { margin-bottom: 2rem; }
.section h2 {
  font-size: 1rem; font-weight: 500;
  text-transform: uppercase; letter-spacing: 2px;
  color: var(--accent, #8B7355);
  margin-bottom: 1rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid #e0d8d0;
}
.bio {
  font-size: 1rem; line-height: 1.8;
  color: #444; white-space: pre-wrap;
}
.traits { display: flex; flex-direction: column; gap: 0.75rem; }
.trait-row {
  display: flex; align-items: center; gap: 1rem;
}
.trait-name {
  min-width: 120px; font-size: 0.9rem;
  font-weight: 500; color: #555;
}
.trait-bar-bg {
  flex: 1; height: 8px; background: #e8e0d8;
  border-radius: 4px; overflow: hidden;
}
.trait-bar-fill {
  height: 100%; border-radius: 4px;
  background: var(--accent, #8B7355);
  transition: width 0.6s ease;
}
.trait-value {
  min-width: 30px; text-align: right;
  font-size: 0.8rem; color: #888;
}
.care-list {
  padding-left: 1.25rem;
  font-size: 0.95rem; line-height: 1.8;
  color: #555;
}
.care-list li { padding: 0.15rem 0; }
.testimonials { display: flex; flex-direction: column; gap: 1rem; }
.testimonial {
  background: white;
  border-radius: 12px; padding: 1rem 1.25rem;
  box-shadow: 0 2px 8px rgba(0,0,0,0.05);
  position: relative;
}
.testimonial-quote {
  font-style: italic; color: #555;
  font-size: 0.95rem; line-height: 1.6;
  margin-bottom: 0.5rem;
}
.testimonial-quote::before { content: '\\201C'; color: var(--accent, #8B7355); font-size: 1.5rem; margin-right: 0.25rem; }
.testimonial-author {
  font-size: 0.8rem; color: #aaa;
  text-align: right;
}
.footer {
  text-align: center; margin-top: 3rem;
  padding-top: 1.5rem;
  border-top: 1px solid #e0d8d0;
  font-size: 0.8rem; color: #aaa;
}
.footer .small { font-size: 0.7rem; margin-top: 0.25rem; opacity: 0.6; }`,
    },
    {
      path: 'config.json',
      content: JSON.stringify(
        {
          rockName: 'Gerald',
          species: 'Igneous (but emotionally sedimentary)',
          photoUrl: '',
          age: '4.5 billion years (approx.)',
          weight: '247g of pure presence',
          bio: "Gerald was found at the beach in 2019. He immediately radiated calm energy and has been a loyal companion ever since.\n\nHe enjoys windowsills, being held during stressful meetings, and the occasional rinse under cool water.\n\nHe has never once let me down.",
          accentColor: '#8B7355',
          traits: [
            { trait: 'Stability', rating: 10 },
            { trait: 'Loyalty', rating: 10 },
            { trait: 'Conversational skills', rating: 2 },
            { trait: 'Speed', rating: 0 },
            { trait: 'Emotional support', rating: 9 },
            { trait: 'Fetch ability', rating: 1 },
          ],
          careInstructions: [
            { instruction: 'Place near window for optimal sun absorption' },
            { instruction: 'Rinse gently under cool water once a month' },
            { instruction: 'Talk to rock daily (they are good listeners)' },
            { instruction: 'Do NOT microwave' },
            { instruction: 'Rotate quarterly for even tan' },
          ],
          testimonials: [
            { author: 'The shelf Gerald sits on', quote: "Gerald has never once complained. 10/10 occupant." },
            { author: 'My therapist', quote: "I... I don't think that's what I meant when I said 'find something grounding.'" },
            { author: 'Gerald', quote: '...' },
          ],
        },
        null,
        2,
      ),
    },
    {
      path: 'render.js',
      content: `fetch('./config.json')
  .then(r => r.json())
  .then(data => {
    document.getElementById('rock-name').textContent = data.rockName || 'Unnamed Rock';
    document.getElementById('species').textContent = data.species || 'Species unknown';

    if (data.accentColor) {
      document.documentElement.style.setProperty('--accent', data.accentColor);
    }

    // Photo
    const photoEl = document.getElementById('rock-photo');
    if (data.photoUrl) {
      photoEl.innerHTML = '<img src="' + escapeHtml(data.photoUrl) + '" alt="' + escapeHtml(data.rockName || 'Rock') + '">';
    }

    // Stats
    document.getElementById('stat-age').textContent = data.age || '???';
    document.getElementById('stat-weight').textContent = data.weight || '???';

    // Bio
    document.getElementById('bio').textContent = data.bio || '';

    // Traits
    const traitsEl = document.getElementById('traits');
    traitsEl.innerHTML = '';
    for (const t of data.traits || []) {
      const row = document.createElement('div');
      row.className = 'trait-row';
      const pct = Math.max(0, Math.min(100, (t.rating || 0) * 10));
      row.innerHTML =
        '<span class="trait-name">' + escapeHtml(t.trait || '???') + '</span>' +
        '<div class="trait-bar-bg"><div class="trait-bar-fill" style="width:' + pct + '%"></div></div>' +
        '<span class="trait-value">' + (t.rating ?? '?') + '/10</span>';
      traitsEl.appendChild(row);
    }

    // Care
    const careEl = document.getElementById('care');
    careEl.innerHTML = '';
    for (const c of data.careInstructions || []) {
      const li = document.createElement('li');
      li.textContent = c.instruction || '';
      careEl.appendChild(li);
    }

    // Testimonials
    const testEl = document.getElementById('testimonials');
    testEl.innerHTML = '';
    for (const t of data.testimonials || []) {
      const card = document.createElement('div');
      card.className = 'testimonial';
      card.innerHTML =
        '<div class="testimonial-quote">' + escapeHtml(t.quote || '') + '</div>' +
        '<div class="testimonial-author">\\u2014 ' + escapeHtml(t.author || 'Anonymous') + '</div>';
      testEl.appendChild(card);
    }
  })
  .catch(err => console.warn('render.js:', err));

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}`,
    },
  ],
  layout: LAYOUT_WORKSHOP,
};

export default template;
