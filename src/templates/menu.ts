import type { TemplateDefinition } from './index';
import { LAYOUT_CHAT } from './index';

const template: TemplateDefinition = {
  context:
    'This is a data-driven restaurant/cafe menu template. ' +
    'The menu content lives in config.json — the user can edit it via the form view in the workshop. ' +
    'render.js reads config.json and builds the DOM. Help them customize categories, items, and styling.',
  greeting:
    "I've set up a menu with categories, items, and prices — all editable through the form view. " +
    "Switch to the Form tab on config.json to add your dishes, or edit the data directly. " +
    "The preview updates live as you make changes.",
  schema: {
    fields: [
      { key: 'restaurantName', label: 'Restaurant Name', type: 'text', placeholder: 'Our Menu' },
      { key: 'tagline', label: 'Tagline', type: 'text', placeholder: 'Fresh · Local · Made with love' },
      { key: 'accentColor', label: 'Accent Color', type: 'color' },
      {
        key: 'categories',
        label: 'Categories',
        type: 'repeater',
        fields: [
          { key: 'name', label: 'Category Name', type: 'text', placeholder: 'Starters' },
          {
            key: 'items',
            label: 'Items',
            type: 'repeater',
            fields: [
              { key: 'name', label: 'Dish Name', type: 'text', placeholder: 'Dish Name' },
              { key: 'description', label: 'Description', type: 'text', placeholder: 'Brief description' },
              { key: 'price', label: 'Price', type: 'text', placeholder: '$12' },
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
  <title>Our Menu</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header>
    <h1 id="restaurant-name">Our Menu</h1>
    <p id="tagline">Fresh &middot; Local &middot; Made with love</p>
  </header>
  <main id="menu-content"></main>
  <script src="render.js"></script>
</body>
</html>`,
    },
    {
      path: 'style.css',
      content: `* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: Georgia, serif; color: #2c2c2c;
  background: #faf8f4; max-width: 600px; margin: 0 auto; padding: 3rem 1.5rem;
}
header { text-align: center; margin-bottom: 3rem; }
header h1 { font-size: 2rem; font-weight: 400; letter-spacing: 0.05em; }
header p { color: #999; font-size: 0.85rem; margin-top: 0.5rem; font-family: system-ui, sans-serif; }
.category { margin-bottom: 2.5rem; }
.category h2 {
  font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.15em;
  color: var(--accent, #b8860b); margin-bottom: 1rem; font-family: system-ui, sans-serif;
  padding-bottom: 0.5rem; border-bottom: 1px solid #e8e4de;
}
.item { display: flex; justify-content: space-between; align-items: flex-start; padding: 0.75rem 0; }
.item-info { flex: 1; }
.item h3 { font-size: 1rem; font-weight: 600; }
.item p { color: #888; font-size: 0.85rem; margin-top: 0.15rem; font-family: system-ui, sans-serif; }
.price { font-weight: 600; color: #2c2c2c; font-size: 1rem; margin-left: 1rem; white-space: nowrap; }`,
    },
    {
      path: 'config.json',
      content: JSON.stringify(
        {
          restaurantName: 'Our Menu',
          tagline: 'Fresh · Local · Made with love',
          accentColor: '#b8860b',
          categories: [
            {
              name: 'Starters',
              items: [
                { name: 'Dish Name', description: 'Brief description of ingredients or preparation.', price: '$12' },
                { name: 'Another Starter', description: 'Something delicious to begin with.', price: '$10' },
              ],
            },
            {
              name: 'Mains',
              items: [
                { name: 'Main Course', description: 'The star of the show.', price: '$24' },
              ],
            },
            {
              name: 'Drinks',
              items: [
                { name: 'House Wine', description: 'Red or white, by the glass.', price: '$9' },
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
      content: `// Render menu from config.json — re-run on every preview refresh
fetch('./config.json')
  .then((r) => r.json())
  .then((data) => {
    document.getElementById('restaurant-name').textContent = data.restaurantName || 'Our Menu';
    document.getElementById('tagline').textContent = data.tagline || '';

    // Apply accent color
    if (data.accentColor) {
      document.documentElement.style.setProperty('--accent', data.accentColor);
    }

    // Build category sections
    const main = document.getElementById('menu-content');
    main.innerHTML = '';

    for (const cat of data.categories || []) {
      const section = document.createElement('section');
      section.className = 'category';

      const h2 = document.createElement('h2');
      h2.textContent = cat.name || 'Category';
      section.appendChild(h2);

      for (const item of cat.items || []) {
        const div = document.createElement('div');
        div.className = 'item';
        div.innerHTML =
          '<div class="item-info">' +
            '<h3>' + escapeHtml(item.name || '') + '</h3>' +
            '<p>' + escapeHtml(item.description || '') + '</p>' +
          '</div>' +
          '<span class="price">' + escapeHtml(item.price || '') + '</span>';
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
