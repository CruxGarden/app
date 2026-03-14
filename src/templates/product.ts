import type { TemplateDefinition } from './index';
import { LAYOUT_BALANCED } from './index';

const template: TemplateDefinition = {
  context:
    'This is a data-driven product page template with hero, features, and CTA. ' +
    'The product content lives in config.json — the user can edit it via the form view in the workshop. ' +
    'render.js reads config.json and builds the DOM. Help them write compelling copy and design the page.',
  greeting:
    "I've set up a product page with a hero section, feature highlights, and a call to action. " +
    "Switch to the Form tab on config.json to fill in your product details, or edit the data directly. " +
    "Start with your product name and what it does — we can refine the copy and visuals from there.",
  schema: {
    fields: [
      { key: 'productName', label: 'Product Name', type: 'text', placeholder: 'Product Name' },
      { key: 'tagline', label: 'Tagline', type: 'text', placeholder: 'One sentence that explains what this product does and why it matters.' },
      { key: 'description', label: 'Description', type: 'textarea', placeholder: 'A longer description of your product...' },
      { key: 'price', label: 'Price', type: 'text', placeholder: '$49' },
      { key: 'ctaText', label: 'CTA Button Text', type: 'text', placeholder: 'Get Started' },
      { key: 'ctaUrl', label: 'CTA URL', type: 'text', placeholder: '#' },
      { key: 'imageUrl', label: 'Product Image', type: 'image' },
      { key: 'accentColor', label: 'Accent Color', type: 'color' },
      {
        key: 'features',
        label: 'Features',
        type: 'repeater',
        fields: [
          { key: 'title', label: 'Title', type: 'text', placeholder: 'Feature title' },
          { key: 'description', label: 'Description', type: 'text', placeholder: 'Brief description of this feature' },
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
  <title>My Product</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header class="hero">
    <div class="hero-content">
      <h1 id="product-name"></h1>
      <p id="tagline"></p>
      <p id="description"></p>
      <span id="price"></span>
      <a id="cta" href="#" class="cta"></a>
    </div>
    <div class="hero-image">
      <div id="product-image" class="placeholder">Product Image</div>
    </div>
  </header>
  <section id="features" class="features"></section>
  <section class="cta-section">
    <h2>Ready to try it?</h2>
    <a id="cta-bottom" href="#" class="cta"></a>
  </section>
  <script src="render.js"></script>
</body>
</html>`,
    },
    {
      path: 'style.css',
      content: `* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: system-ui, sans-serif; color: #111; }
.hero {
  display: flex; align-items: center; gap: 3rem;
  max-width: 960px; margin: 0 auto; padding: 5rem 2rem;
}
.hero-content { flex: 1; }
.hero h1 { font-size: 2.5rem; font-weight: 800; line-height: 1.1; margin-bottom: 1rem; }
.hero #tagline { color: #555; font-size: 1.1rem; margin-bottom: 1rem; max-width: 400px; }
.hero #description { color: #666; font-size: 0.95rem; margin-bottom: 1rem; max-width: 400px; line-height: 1.6; }
.hero #price { display: inline-block; font-size: 1.25rem; font-weight: 700; color: var(--accent, #111); margin-bottom: 1.5rem; }
.hero-image { flex: 1; }
.placeholder {
  aspect-ratio: 4/3; background: linear-gradient(135deg, #e8e8e8, #d0d0d0);
  border-radius: 16px; display: flex; align-items: center; justify-content: center;
  color: #999; overflow: hidden;
}
.placeholder img {
  width: 100%; height: 100%; object-fit: cover;
}
.cta {
  display: inline-block; padding: 0.875rem 2rem;
  background: var(--accent, #111); color: white; border-radius: 8px;
  text-decoration: none; font-weight: 600;
  transition: opacity 0.2s;
}
.cta:hover { opacity: 0.85; }
.features {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 2rem;
  max-width: 960px; margin: 0 auto; padding: 4rem 2rem;
  border-top: 1px solid #eee;
}
.feature h3 { font-size: 1.1rem; margin-bottom: 0.5rem; }
.feature p { color: #666; font-size: 0.9rem; line-height: 1.5; }
.cta-section {
  text-align: center; padding: 4rem 2rem;
  background: #f8f8f8;
}
.cta-section h2 { font-size: 1.5rem; margin-bottom: 1.5rem; }
@media (max-width: 640px) {
  .hero { flex-direction: column; text-align: center; }
  .features { grid-template-columns: 1fr; }
}`,
    },
    {
      path: 'config.json',
      content: JSON.stringify(
        {
          productName: 'Product Name',
          tagline: 'One sentence that explains what this product does and why it matters.',
          description: '',
          price: '',
          ctaText: 'Get Started',
          ctaUrl: '#',
          imageUrl: '',
          accentColor: '#111111',
          features: [
            { title: 'Fast', description: 'Explain speed or efficiency.' },
            { title: 'Simple', description: 'Explain ease of use.' },
            { title: 'Reliable', description: 'Explain trust and quality.' },
          ],
        },
        null,
        2,
      ),
    },
    {
      path: 'render.js',
      content: `// Render product page from config.json — re-run on every preview refresh
fetch('./config.json')
  .then((r) => r.json())
  .then((data) => {
    document.getElementById('product-name').textContent = data.productName || 'Product Name';
    document.getElementById('tagline').textContent = data.tagline || '';
    document.getElementById('description').textContent = data.description || '';

    // Price
    const priceEl = document.getElementById('price');
    if (data.price) {
      priceEl.textContent = data.price;
      priceEl.style.display = '';
    } else {
      priceEl.style.display = 'none';
    }

    // CTA buttons
    const ctaText = data.ctaText || 'Get Started';
    const ctaUrl = data.ctaUrl || '#';
    const ctaTop = document.getElementById('cta');
    ctaTop.textContent = ctaText;
    ctaTop.href = ctaUrl;
    const ctaBottom = document.getElementById('cta-bottom');
    ctaBottom.innerHTML = escapeHtml(ctaText) + ' &rarr;';
    ctaBottom.href = ctaUrl;

    // Accent color
    if (data.accentColor) {
      document.documentElement.style.setProperty('--accent', data.accentColor);
    }

    // Product image
    const imageContainer = document.getElementById('product-image');
    if (data.imageUrl) {
      imageContainer.innerHTML = '<img src="' + escapeHtml(data.imageUrl) + '" alt="' + escapeHtml(data.productName || 'Product') + '">';
    } else {
      imageContainer.textContent = 'Product Image';
    }

    // Page title
    document.title = data.productName || 'My Product';

    // Build features
    const featuresEl = document.getElementById('features');
    featuresEl.innerHTML = '';

    for (const feat of data.features || []) {
      const div = document.createElement('div');
      div.className = 'feature';
      div.innerHTML =
        '<h3>' + escapeHtml(feat.title || '') + '</h3>' +
        '<p>' + escapeHtml(feat.description || '') + '</p>';
      featuresEl.appendChild(div);
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
