import type { TemplateDefinition } from './index';
import { LAYOUT_VISUAL } from './index';

const template: TemplateDefinition = {
  context:
    'This is a data-driven social media post template styled like Instagram. ' +
    'The content lives in config.json — the user can edit it via the form view in the workshop. ' +
    'render.js reads config.json and builds the DOM. script.js handles like/double-tap interactivity. ' +
    'Help them customize the content, add photos, and style the card.',
  greeting:
    "I've set up a social post card with an avatar, photo area, caption, and interactive like button. " +
    "Switch to the Form tab on config.json to customize your post, or edit the data directly. " +
    "You could start by adding your photo and writing a caption — I can help with the styling and interactions.",
  schema: {
    fields: [
      { key: 'username', label: 'Username', type: 'text', placeholder: 'yourname' },
      { key: 'location', label: 'Location', type: 'text', placeholder: 'Location' },
      { key: 'photoUrl', label: 'Photo', type: 'image' },
      { key: 'caption', label: 'Caption', type: 'textarea', placeholder: 'Write your caption here...' },
      { key: 'likes', label: 'Likes', type: 'number', placeholder: '42' },
      {
        key: 'comments',
        label: 'Comments',
        type: 'repeater',
        fields: [
          { key: 'username', label: 'Username', type: 'text', placeholder: 'friend' },
          { key: 'text', label: 'Comment', type: 'text', placeholder: 'Great shot!' },
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
  <title>Post</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <article class="post">
    <header class="post-header">
      <div id="avatar" class="avatar"></div>
      <div class="user-info">
        <span id="username" class="username"></span>
        <span id="location" class="location"></span>
      </div>
    </header>
    <div id="post-image" class="post-image">
      <div id="placeholder" class="placeholder">Your photo here</div>
    </div>
    <div class="post-actions">
      <button class="action-btn" id="likeBtn" aria-label="Like">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        </svg>
      </button>
      <button class="action-btn" aria-label="Comment">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      </button>
      <button class="action-btn" aria-label="Share">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
        </svg>
      </button>
    </div>
    <div class="post-body">
      <p class="likes"><span id="likeCount"></span> likes</p>
      <p id="caption" class="caption"></p>
      <div id="comments" class="comments"></div>
      <p class="timestamp">2 hours ago</p>
    </div>
  </article>
  <script src="render.js"></script>
  <script src="script.js"></script>
</body>
</html>`,
    },
    {
      path: 'style.css',
      content: `* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: system-ui, sans-serif; color: #262626;
  background: #fafafa; display: flex; align-items: center; justify-content: center;
  min-height: 100vh; padding: 1rem;
}
.post {
  width: 100%; max-width: 470px; background: white;
  border: 1px solid #dbdbdb; border-radius: 8px; overflow: hidden;
}
.post-header {
  display: flex; align-items: center; gap: 0.75rem;
  padding: 0.75rem 1rem;
}
.avatar {
  width: 32px; height: 32px; border-radius: 50%;
  background: linear-gradient(135deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888);
  display: flex; align-items: center; justify-content: center;
  color: white; font-size: 0.65rem; font-weight: 700;
}
.username { font-weight: 600; font-size: 0.85rem; display: block; }
.location { font-size: 0.7rem; color: #8e8e8e; }
.post-image { background: #efefef; }
.placeholder {
  aspect-ratio: 1/1; display: flex; align-items: center; justify-content: center;
  color: #8e8e8e; font-size: 0.9rem;
}
.post-image img { width: 100%; display: block; }
.post-actions {
  display: flex; gap: 0.75rem; padding: 0.5rem 0.75rem;
}
.action-btn {
  background: none; border: none; cursor: pointer; padding: 0.25rem;
  color: #262626; transition: transform 0.15s;
}
.action-btn:hover { transform: scale(1.1); }
.action-btn.liked svg { fill: #ed4956; stroke: #ed4956; }
.post-body { padding: 0 1rem 1rem; }
.likes { font-weight: 600; font-size: 0.85rem; margin-bottom: 0.35rem; }
.caption { font-size: 0.85rem; line-height: 1.5; margin-bottom: 0.5rem; }
.comments { margin-bottom: 0.5rem; }
.comment { font-size: 0.85rem; line-height: 1.5; margin-bottom: 0.15rem; }
.comment strong, .caption strong { font-weight: 600; }
.timestamp { font-size: 0.65rem; color: #8e8e8e; text-transform: uppercase; letter-spacing: 0.02em; }`,
    },
    {
      path: 'config.json',
      content: JSON.stringify(
        {
          username: 'yourname',
          location: 'Location',
          photoUrl: '',
          caption: 'Write your caption here. Tell the story behind the photo.',
          likes: 42,
          comments: [
            { username: 'friend', text: 'Great shot!' },
            { username: 'another', text: 'Love this' },
          ],
        },
        null,
        2,
      ),
    },
    {
      path: 'render.js',
      content: `// Render social post from config.json — re-run on every preview refresh
fetch('./config.json')
  .then((r) => r.json())
  .then((data) => {
    // Username & avatar
    const name = data.username || 'yourname';
    document.getElementById('username').textContent = name;
    document.getElementById('avatar').textContent = name.charAt(0).toUpperCase();

    // Location
    document.getElementById('location').textContent = data.location || '';

    // Photo
    const imageContainer = document.getElementById('post-image');
    const placeholder = document.getElementById('placeholder');
    if (data.photoUrl) {
      placeholder.style.display = 'none';
      var img = imageContainer.querySelector('img');
      if (!img) {
        img = document.createElement('img');
        imageContainer.appendChild(img);
      }
      img.src = escapeHtml(data.photoUrl);
      img.alt = 'Post photo';
    } else {
      placeholder.style.display = '';
    }

    // Likes
    document.getElementById('likeCount').textContent = String(data.likes ?? 42);

    // Caption
    var captionEl = document.getElementById('caption');
    captionEl.innerHTML = '<strong>' + escapeHtml(name) + '</strong> ' + escapeHtml(data.caption || '');

    // Comments
    var commentsEl = document.getElementById('comments');
    commentsEl.innerHTML = '';
    for (var i = 0; i < (data.comments || []).length; i++) {
      var c = data.comments[i];
      var p = document.createElement('p');
      p.className = 'comment';
      p.innerHTML = '<strong>' + escapeHtml(c.username || '') + '</strong> ' + escapeHtml(c.text || '');
      commentsEl.appendChild(p);
    }
  })
  .catch((err) => console.warn('render.js: could not load config.json', err));

function escapeHtml(str) {
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}`,
    },
    {
      path: 'script.js',
      content: `const likeBtn = document.getElementById('likeBtn');
const likeCount = document.getElementById('likeCount');
let liked = false;

likeBtn.addEventListener('click', () => {
  liked = !liked;
  likeBtn.classList.toggle('liked', liked);
  const count = parseInt(likeCount.textContent, 10);
  likeCount.textContent = String(liked ? count + 1 : count - 1);
});

// Double-tap to like on image
const image = document.querySelector('.post-image');
let lastTap = 0;
image.addEventListener('click', () => {
  const now = Date.now();
  if (now - lastTap < 300 && !liked) {
    liked = true;
    likeBtn.classList.add('liked');
    const count = parseInt(likeCount.textContent, 10);
    likeCount.textContent = String(count + 1);
    // Show heart animation
    const heart = document.createElement('div');
    heart.textContent = '\\u2764\\uFE0F';
    heart.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) scale(0);font-size:4rem;pointer-events:none;animation:pop 0.6s ease forwards;';
    image.style.position = 'relative';
    image.appendChild(heart);
    setTimeout(() => heart.remove(), 700);
  }
  lastTap = now;
});

// Heart pop animation
const style = document.createElement('style');
style.textContent = '@keyframes pop{0%{transform:translate(-50%,-50%) scale(0);opacity:1}50%{transform:translate(-50%,-50%) scale(1.2);opacity:1}100%{transform:translate(-50%,-50%) scale(1);opacity:0}}';
document.head.appendChild(style);`,
    },
  ],
  layout: LAYOUT_VISUAL,
};

export default template;
