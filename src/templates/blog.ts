import type { TemplateDefinition } from './index';
import { LAYOUT_CHAT } from './index';

const template: TemplateDefinition = {
  context:
    'This is a data-driven blog template. ' +
    'The blog content lives in config.json — the user can edit it via the form view in the workshop. ' +
    'render.js reads config.json and builds the DOM. Help them customize posts, styling, and layout.',
  greeting:
    "I've set up a blog with a post listing page, a sample post, and some clean typography — all editable through the form view. " +
    "Switch to the Form tab on config.json to add your posts, or edit the data directly. " +
    "The preview updates live as you make changes.",
  schema: {
    fields: [
      { key: 'blogTitle', label: 'Blog Title', type: 'text', placeholder: 'My Blog' },
      { key: 'blogDescription', label: 'Description', type: 'text', placeholder: 'Thoughts, ideas, and stories' },
      { key: 'authorName', label: 'Author Name', type: 'text', placeholder: 'Your Name' },
      {
        key: 'posts',
        label: 'Posts',
        type: 'repeater',
        fields: [
          { key: 'title', label: 'Title', type: 'text', placeholder: 'Post title' },
          { key: 'date', label: 'Date', type: 'text', placeholder: 'March 12, 2026' },
          { key: 'content', label: 'Content', type: 'textarea', placeholder: 'Write your post here...' },
          { key: 'tags', label: 'Tags', type: 'text', placeholder: 'life, thoughts, code' },
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
  <title>My Blog</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header>
    <h1 id="blog-title">My Blog</h1>
    <p id="blog-description" class="subtitle"></p>
  </header>
  <main id="posts-content"></main>
  <footer>
    <p id="blog-footer"></p>
  </footer>
  <script src="render.js"></script>
</body>
</html>`,
    },
    {
      path: 'style.css',
      content: `* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: Georgia, 'Times New Roman', serif;
  line-height: 1.7;
  color: #2c2c2c;
  background: #fafaf8;
  max-width: 640px;
  margin: 0 auto;
  padding: 2rem 1.5rem;
}
header { margin-bottom: 3rem; padding-bottom: 1.5rem; border-bottom: 1px solid #e0ddd8; }
header h1 { font-size: 1.5rem; font-weight: 600; }
.subtitle { color: #888; font-size: 0.9rem; margin-top: 0.25rem; }
.post-preview { margin-bottom: 2.5rem; }
.post-preview time { display: block; color: #999; font-size: 0.8rem; font-family: system-ui, sans-serif; margin-bottom: 0.25rem; }
.post-preview h2 { font-size: 1.25rem; margin-bottom: 0.5rem; }
.post-preview p { color: #555; }
.post-preview .tags { margin-top: 0.5rem; }
.post-preview .tag {
  display: inline-block; font-size: 0.75rem; font-family: system-ui, sans-serif;
  color: #888; background: #f0eeea; padding: 0.15rem 0.5rem; border-radius: 3px; margin-right: 0.35rem;
}
footer { margin-top: 4rem; padding-top: 1.5rem; border-top: 1px solid #e0ddd8; color: #bbb; font-size: 0.8rem; }`,
    },
    {
      path: 'config.json',
      content: JSON.stringify(
        {
          blogTitle: 'My Blog',
          blogDescription: 'Thoughts, ideas, and stories',
          authorName: '',
          posts: [
            {
              title: 'Hello World',
              date: 'March 12, 2026',
              content:
                'Welcome to my blog. This is where I\'ll share my thoughts and ideas with the world.\n\nMore posts coming soon.',
              tags: 'intro, hello',
            },
          ],
        },
        null,
        2,
      ),
    },
    {
      path: 'render.js',
      content: `// Render blog from config.json — re-run on every preview refresh
fetch('./config.json')
  .then((r) => r.json())
  .then((data) => {
    document.getElementById('blog-title').textContent = data.blogTitle || 'My Blog';
    document.getElementById('blog-description').textContent = data.blogDescription || '';

    // Footer
    const footerParts = ['Made with Crux Garden'];
    if (data.authorName) footerParts.unshift('By ' + data.authorName);
    document.getElementById('blog-footer').textContent = footerParts.join(' · ');

    // Build post previews
    const main = document.getElementById('posts-content');
    main.innerHTML = '';

    for (const post of data.posts || []) {
      const article = document.createElement('article');
      article.className = 'post-preview';

      let html = '';
      if (post.date) {
        html += '<time>' + escapeHtml(post.date) + '</time>';
      }
      html += '<h2>' + escapeHtml(post.title || 'Untitled') + '</h2>';

      // Show first paragraph as excerpt
      const lines = (post.content || '').split('\\n').filter(Boolean);
      if (lines.length > 0) {
        html += '<p>' + escapeHtml(lines[0]) + '</p>';
      }

      // Tags
      if (post.tags) {
        const tags = post.tags.split(',').map(function (t) { return t.trim(); }).filter(Boolean);
        if (tags.length > 0) {
          html += '<div class="tags">';
          for (var i = 0; i < tags.length; i++) {
            html += '<span class="tag">' + escapeHtml(tags[i]) + '</span>';
          }
          html += '</div>';
        }
      }

      article.innerHTML = html;
      main.appendChild(article);
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
