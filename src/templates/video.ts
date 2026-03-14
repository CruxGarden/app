import type { TemplateDefinition } from './index';
import { LAYOUT_VISUAL } from './index';

const template: TemplateDefinition = {
  context:
    'This is a data-driven video player page template. ' +
    'The video content lives in config.json — the user can edit it via the form view in the workshop. ' +
    'render.js reads config.json and builds the DOM. script.js handles interactivity (chapter seeking, overlay). ' +
    'Help them embed videos, add chapters, and style the viewing experience.',
  greeting:
    "I've set up a video page with a player, chapter markers, and a description area — all editable through the form view. " +
    "Switch to the Form tab on config.json to set your video URL, add chapters, and update the info. " +
    "The preview updates live as you make changes.",
  schema: {
    fields: [
      { key: 'title', label: 'Title', type: 'text', placeholder: 'Video Title' },
      { key: 'date', label: 'Date', type: 'text', placeholder: 'Jan 1, 2025' },
      { key: 'duration', label: 'Duration', type: 'text', placeholder: '3:24' },
      { key: 'description', label: 'Description', type: 'textarea', placeholder: 'Describe what this video is about...' },
      { key: 'videoUrl', label: 'Video URL', type: 'text', placeholder: 'https://example.com/video.mp4' },
      {
        key: 'chapters',
        label: 'Chapters',
        type: 'repeater',
        fields: [
          { key: 'time', label: 'Time', type: 'text', placeholder: '0:30' },
          { key: 'title', label: 'Title', type: 'text', placeholder: 'Chapter title' },
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
  <title>Video</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <main>
    <div class="player-wrap">
      <video id="player" controls preload="metadata">
        <source id="video-source" src="" type="video/mp4">
        Your browser does not support the video tag.
      </video>
      <div class="placeholder-overlay" id="placeholderOverlay">
        <div class="play-icon">&#9654;</div>
        <p>Add a video source above</p>
      </div>
    </div>
    <div class="info">
      <h1 id="video-title"></h1>
      <p id="video-meta" class="meta"></p>
      <p id="video-description" class="description"></p>
    </div>
    <div class="chapters">
      <h2>Chapters</h2>
      <ul id="chapter-list"></ul>
    </div>
  </main>
  <script src="render.js"></script>
  <script src="script.js"></script>
</body>
</html>`,
    },
    {
      path: 'style.css',
      content: `* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: system-ui, sans-serif; color: #eee; background: #0a0a0a; }
main { max-width: 720px; margin: 0 auto; padding: 2rem 1rem; }
.player-wrap {
  position: relative; width: 100%; aspect-ratio: 16/9;
  background: #111; border-radius: 10px; overflow: hidden;
}
video { width: 100%; height: 100%; display: block; }
.placeholder-overlay {
  position: absolute; inset: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  background: linear-gradient(135deg, #1a1a2e, #16213e);
  color: #555; gap: 0.75rem;
}
.placeholder-overlay.hidden { display: none; }
.play-icon { font-size: 3rem; color: #444; }
.placeholder-overlay p { font-size: 0.85rem; }
.info { padding: 1.25rem 0; }
h1 { font-size: 1.35rem; font-weight: 700; margin-bottom: 0.35rem; }
.meta { font-size: 0.8rem; color: #666; margin-bottom: 0.75rem; }
.description { font-size: 0.95rem; color: #aaa; line-height: 1.6; }
.chapters { border-top: 1px solid #1a1a1a; padding-top: 1.25rem; margin-top: 0.5rem; }
.chapters h2 {
  font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.1em;
  color: #555; margin-bottom: 0.75rem;
}
.chapters ul { list-style: none; }
.chapters li { margin-bottom: 0.25rem; }
.chapter-link {
  background: none; border: none; color: #60a5fa; cursor: pointer;
  font-size: 0.9rem; padding: 0.35rem 0.5rem; border-radius: 4px;
  font-family: monospace; transition: background 0.15s;
}
.chapter-link:hover { background: #1a1a2e; }`,
    },
    {
      path: 'config.json',
      content: JSON.stringify(
        {
          title: 'Video Title',
          date: 'Jan 1, 2025',
          duration: '3:24',
          description: 'Describe what this video is about. Add context, links, or credits.',
          videoUrl: '',
          chapters: [
            { time: '0:00', title: 'Introduction' },
            { time: '0:30', title: 'Main Topic' },
            { time: '2:00', title: 'Wrap Up' },
          ],
        },
        null,
        2,
      ),
    },
    {
      path: 'render.js',
      content: `// Render video page from config.json — re-run on every preview refresh
fetch('./config.json')
  .then(function (r) { return r.json(); })
  .then(function (data) {
    // Title
    document.getElementById('video-title').textContent = data.title || 'Video Title';

    // Meta line
    var parts = [];
    if (data.date) parts.push(data.date);
    if (data.duration) parts.push(data.duration);
    document.getElementById('video-meta').innerHTML = parts.map(escapeHtml).join(' \\u00b7 ');

    // Description
    document.getElementById('video-description').textContent = data.description || '';

    // Video source
    var source = document.getElementById('video-source');
    var player = document.getElementById('player');
    if (data.videoUrl) {
      source.setAttribute('src', data.videoUrl);
      player.load();
    }

    // Chapters
    var list = document.getElementById('chapter-list');
    list.innerHTML = '';
    var chapters = data.chapters || [];
    for (var i = 0; i < chapters.length; i++) {
      var ch = chapters[i];
      var seconds = parseTime(ch.time || '0:00');
      var li = document.createElement('li');
      var btn = document.createElement('button');
      btn.className = 'chapter-link';
      btn.setAttribute('data-time', String(seconds));
      btn.innerHTML = escapeHtml(ch.time || '0:00') + ' \\u2014 ' + escapeHtml(ch.title || 'Untitled');
      li.appendChild(btn);
      list.appendChild(li);
    }
  })
  .catch(function (err) { console.warn('render.js: could not load config.json', err); });

function escapeHtml(str) {
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function parseTime(str) {
  var parts = str.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}`,
    },
    {
      path: 'script.js',
      content: `// Interactivity — chapter seeking and placeholder overlay
var player = document.getElementById('player');
var overlay = document.getElementById('placeholderOverlay');

// Hide placeholder once a real source is loaded
player.addEventListener('loadeddata', function () {
  overlay.classList.add('hidden');
});

// Chapter links — seek to timestamp (delegated for dynamically rendered buttons)
document.addEventListener('click', function (e) {
  var btn = e.target.closest('.chapter-link');
  if (!btn) return;
  var time = parseInt(btn.dataset.time, 10);
  if (!isNaN(time)) {
    player.currentTime = time;
    player.play();
    overlay.classList.add('hidden');
  }
});`,
    },
  ],
  layout: LAYOUT_VISUAL,
};

export default template;
