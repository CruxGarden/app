import type { TemplateDefinition } from './index';
import { LAYOUT_VISUAL } from './index';

const template: TemplateDefinition = {
  context:
    'This is a data-driven photo album/gallery template with a responsive grid and lightbox. ' +
    'The content lives in config.json — the user can edit it via the form view in the workshop. ' +
    'render.js reads config.json and builds the DOM. Help them add images, customize the layout, and add captions.',
  greeting:
    "I've set up a photo album with a responsive grid and a lightbox for viewing images full-size. " +
    "Switch to the Form tab on config.json to add your photos and captions, or edit the data directly. " +
    "Start by replacing the placeholder images with your own and updating the album title — I can help with captions and layout from there.",
  schema: {
    fields: [
      { key: 'albumTitle', label: 'Album Title', type: 'text', placeholder: 'Photo Album' },
      { key: 'description', label: 'Description', type: 'text', placeholder: 'A collection of moments' },
      {
        key: 'photos',
        label: 'Photos',
        type: 'repeater',
        fields: [
          { key: 'imageUrl', label: 'Image', type: 'image' },
          { key: 'caption', label: 'Caption', type: 'text', placeholder: 'Add a caption' },
          { key: 'date', label: 'Date', type: 'text', placeholder: 'e.g. June 2025' },
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
  <title>Photo Album</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header>
    <h1 id="album-title"></h1>
    <p id="album-description"></p>
  </header>
  <main id="gallery" class="gallery"></main>
  <script src="render.js"></script>
</body>
</html>`,
    },
    {
      path: 'style.css',
      content: `* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: system-ui, sans-serif; color: #333; background: #f8f8f8; }
header { text-align: center; padding: 3rem 1rem 2rem; }
header h1 { font-size: 1.75rem; font-weight: 600; }
header p { color: #888; margin-top: 0.25rem; }
.gallery {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
  padding: 1rem 2rem 3rem;
  max-width: 1200px;
  margin: 0 auto;
}
.photo { cursor: pointer; border-radius: 8px; overflow: hidden; background: white; box-shadow: 0 1px 4px rgba(0,0,0,0.08); transition: transform 0.2s; }
.photo:hover { transform: scale(1.02); }
.placeholder {
  aspect-ratio: 4/3;
  background: linear-gradient(135deg, #e0e0e0, #c8c8c8);
  display: flex; align-items: center; justify-content: center;
  color: #999; font-size: 0.9rem;
}
.photo img { width: 100%; aspect-ratio: 4/3; object-fit: cover; display: block; }
figcaption { padding: 0.75rem 1rem; font-size: 0.85rem; color: #666; }
figcaption .date { display: block; font-size: 0.75rem; color: #aaa; margin-top: 0.25rem; }
.lightbox {
  position: fixed; inset: 0; background: rgba(0,0,0,0.9);
  display: flex; align-items: center; justify-content: center;
  z-index: 100; cursor: pointer;
}
.lightbox img { max-width: 90vw; max-height: 90vh; border-radius: 4px; }`,
    },
    {
      path: 'config.json',
      content: JSON.stringify(
        {
          albumTitle: 'Photo Album',
          description: 'A collection of moments',
          photos: [
            { imageUrl: '', caption: 'Add a caption here', date: '' },
            { imageUrl: '', caption: 'Describe this moment', date: '' },
            { imageUrl: '', caption: 'What happened here?', date: '' },
            { imageUrl: '', caption: 'Another memory', date: '' },
            { imageUrl: '', caption: 'Tell the story', date: '' },
            { imageUrl: '', caption: 'One more', date: '' },
          ],
        },
        null,
        2,
      ),
    },
    {
      path: 'render.js',
      content: `// Render photo album from config.json — re-run on every preview refresh
fetch('./config.json')
  .then((r) => r.json())
  .then((data) => {
    // Album title
    document.getElementById('album-title').textContent = data.albumTitle || 'Photo Album';

    // Description
    document.getElementById('album-description').textContent = data.description || '';

    // Build photo grid
    const gallery = document.getElementById('gallery');
    gallery.innerHTML = '';

    for (const photo of data.photos || []) {
      const figure = document.createElement('figure');
      figure.className = 'photo';

      if (photo.imageUrl) {
        const img = document.createElement('img');
        img.src = photo.imageUrl;
        img.alt = photo.caption || '';
        figure.appendChild(img);
      } else {
        const placeholder = document.createElement('div');
        placeholder.className = 'placeholder';
        placeholder.textContent = photo.caption || 'Photo';
        figure.appendChild(placeholder);
      }

      const caption = document.createElement('figcaption');
      let captionHtml = escapeHtml(photo.caption || '');
      if (photo.date) {
        captionHtml += '<span class="date">' + escapeHtml(photo.date) + '</span>';
      }
      caption.innerHTML = captionHtml;
      figure.appendChild(caption);

      gallery.appendChild(figure);
    }

    // Lightbox — click a photo to view full-size
    gallery.addEventListener('click', (e) => {
      const img = e.target.closest('.photo')?.querySelector('img');
      if (!img) return;

      const lightbox = document.createElement('div');
      lightbox.className = 'lightbox';
      lightbox.innerHTML = '<img src="' + escapeHtml(img.src) + '" alt="' + escapeHtml(img.alt || '') + '">';
      lightbox.addEventListener('click', () => lightbox.remove());
      document.body.appendChild(lightbox);
    });
  })
  .catch((err) => console.warn('render.js: could not load config.json', err));

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}`,
    },
  ],
  layout: LAYOUT_VISUAL,
};

export default template;
