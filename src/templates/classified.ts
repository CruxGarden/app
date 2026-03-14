import type { TemplateDefinition } from './index';
import { LAYOUT_CHAT } from './index';

const template: TemplateDefinition = {
  context:
    'This is a data-driven classified ad / listing template. ' +
    'The content lives in config.json — the user can edit it via the form view in the workshop. ' +
    'render.js reads config.json and builds the DOM. Help them write compelling copy and add photos.',
  greeting:
    "I've set up a listing page with space for a photo, price, and item details. " +
    "Switch to the Form tab on config.json to fill in your listing, or edit the data directly. " +
    "Start by describing what you're selling and setting a price — I can help you write the description to make it stand out.",
  schema: {
    fields: [
      { key: 'title', label: 'Title', type: 'text', placeholder: 'Item Name' },
      { key: 'price', label: 'Price', type: 'text', placeholder: '$0.00' },
      {
        key: 'condition',
        label: 'Condition',
        type: 'select',
        options: [
          { label: 'New', value: 'New' },
          { label: 'Like New', value: 'Like New' },
          { label: 'Good', value: 'Good' },
          { label: 'Fair', value: 'Fair' },
        ],
      },
      {
        key: 'description',
        label: 'Description',
        type: 'textarea',
        placeholder:
          'Describe what you\'re selling. Be specific about condition, features, size, or anything a buyer needs to know.',
      },
      { key: 'location', label: 'Location', type: 'text', placeholder: 'Your City' },
      { key: 'contactEmail', label: 'Contact Email', type: 'text', placeholder: 'you@example.com' },
      { key: 'contactPhone', label: 'Contact Phone', type: 'text', placeholder: '(555) 123-4567' },
      { key: 'imageUrl', label: 'Photo', type: 'image' },
      {
        key: 'features',
        label: 'Features',
        type: 'repeater',
        fields: [
          { key: 'feature', label: 'Feature', type: 'text', placeholder: 'e.g. Includes original box' },
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
  <title>For Sale</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <article class="listing">
    <div class="photo-area">
      <div id="photo" class="placeholder">Add photos here</div>
    </div>
    <div class="info">
      <span class="badge">For Sale</span>
      <h1 id="title"></h1>
      <p id="price" class="price"></p>
      <p id="description" class="description"></p>
      <div id="features" class="features"></div>
      <div id="details" class="details-grid"></div>
      <a id="contact-btn" href="#" class="contact-btn">Contact Seller</a>
    </div>
  </article>
  <script src="render.js"></script>
</body>
</html>`,
    },
    {
      path: 'style.css',
      content: `* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: system-ui, sans-serif; color: #222; background: #f5f5f5; padding: 2rem 1rem; }
.listing {
  max-width: 600px; margin: 0 auto; background: white;
  border-radius: 12px; overflow: hidden; box-shadow: 0 1px 8px rgba(0,0,0,0.08);
}
.photo-area { background: #e8e8e8; }
.placeholder {
  aspect-ratio: 16/9;
  display: flex; align-items: center; justify-content: center;
  color: #999; font-size: 0.9rem;
}
.photo-area img {
  width: 100%; aspect-ratio: 16/9; object-fit: cover; display: block;
}
.info { padding: 1.5rem; }
.badge {
  display: inline-block; padding: 0.25rem 0.75rem;
  background: #dcfce7; color: #166534; border-radius: 999px;
  font-size: 0.75rem; font-weight: 600; text-transform: uppercase;
}
h1 { font-size: 1.5rem; margin-top: 0.75rem; }
.price { font-size: 1.75rem; font-weight: 700; color: #16a34a; margin: 0.5rem 0; }
.description { color: #555; line-height: 1.6; margin-bottom: 1rem; }
.features { margin-bottom: 1rem; }
.features ul { list-style: none; padding: 0; display: flex; flex-wrap: wrap; gap: 0.5rem; }
.features li {
  background: #f0f9ff; color: #0369a1; padding: 0.25rem 0.75rem;
  border-radius: 999px; font-size: 0.8rem; font-weight: 500;
}
.details-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; font-size: 0.9rem; margin-bottom: 1.5rem; color: #444; }
.contact-btn {
  display: block; text-align: center; padding: 0.875rem;
  background: #2563eb; color: white; border-radius: 8px;
  text-decoration: none; font-weight: 500;
}
.contact-btn:hover { background: #1d4ed8; }`,
    },
    {
      path: 'config.json',
      content: JSON.stringify(
        {
          title: 'Item Name',
          price: '$0.00',
          condition: 'Like New',
          description:
            "Describe what you're selling. Be specific about condition, features, size, or anything a buyer needs to know.",
          location: 'Your City',
          contactEmail: 'you@example.com',
          contactPhone: '',
          imageUrl: '',
          features: [{ feature: 'Includes original packaging' }],
        },
        null,
        2,
      ),
    },
    {
      path: 'render.js',
      content: `// Render classified listing from config.json — re-run on every preview refresh
fetch('./config.json')
  .then((r) => r.json())
  .then((data) => {
    // Title
    document.getElementById('title').textContent = data.title || 'Item Name';

    // Price
    document.getElementById('price').textContent = data.price || '$0.00';

    // Description
    document.getElementById('description').textContent = data.description || '';

    // Photo
    const photoEl = document.getElementById('photo');
    if (data.imageUrl) {
      const img = document.createElement('img');
      img.src = escapeHtml(data.imageUrl);
      img.alt = escapeHtml(data.title || 'Listing photo');
      photoEl.replaceWith(img);
    }

    // Features
    const featuresEl = document.getElementById('features');
    const items = data.features || [];
    if (items.length > 0) {
      const ul = document.createElement('ul');
      for (const item of items) {
        if (!item.feature) continue;
        const li = document.createElement('li');
        li.textContent = item.feature;
        ul.appendChild(li);
      }
      featuresEl.innerHTML = '';
      featuresEl.appendChild(ul);
    }

    // Details grid
    const detailsEl = document.getElementById('details');
    detailsEl.innerHTML = '';
    if (data.condition) {
      detailsEl.innerHTML += '<div><strong>Condition:</strong> ' + escapeHtml(data.condition) + '</div>';
    }
    if (data.location) {
      detailsEl.innerHTML += '<div><strong>Location:</strong> ' + escapeHtml(data.location) + '</div>';
    }
    if (data.contactPhone) {
      detailsEl.innerHTML += '<div><strong>Phone:</strong> ' + escapeHtml(data.contactPhone) + '</div>';
    }

    // Contact button
    const contactBtn = document.getElementById('contact-btn');
    if (data.contactEmail) {
      contactBtn.href = 'mailto:' + encodeURIComponent(data.contactEmail);
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
