import type { TemplateDefinition } from './index';
import { LAYOUT_BALANCED } from './index';

const template: TemplateDefinition = {
  context:
    'This is a data-driven step-by-step tutorial template. ' +
    'The tutorial content lives in config.json — the user can edit it via the form view in the workshop. ' +
    'render.js reads config.json and builds the DOM. Help them add steps, code examples, screenshots, and clear explanations.',
  greeting:
    "I've set up a tutorial page with numbered steps, a table of contents, and space for code blocks — all editable through the form view. " +
    "Switch to the Form tab on config.json to add your steps, or edit the data directly. " +
    "The preview updates live as you make changes.",
  schema: {
    fields: [
      { key: 'title', label: 'Title', type: 'text', placeholder: 'How to Do the Thing' },
      { key: 'description', label: 'Description', type: 'textarea', placeholder: 'A short description of what you\'ll learn and why it matters.' },
      { key: 'author', label: 'Author', type: 'text', placeholder: 'Your Name' },
      {
        key: 'steps',
        label: 'Steps',
        type: 'repeater',
        fields: [
          { key: 'title', label: 'Title', type: 'text', placeholder: 'Step title' },
          { key: 'content', label: 'Content', type: 'textarea', placeholder: 'Explain this step clearly...' },
          { key: 'code', label: 'Code', type: 'textarea', placeholder: 'example command or code here' },
          { key: 'tip', label: 'Tip', type: 'text', placeholder: 'Optional helpful tip' },
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
  <title>How To</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <article>
    <header>
      <p class="label">Tutorial</p>
      <h1 id="tutorial-title"></h1>
      <p id="tutorial-intro" class="intro"></p>
      <div id="tutorial-meta" class="meta"></div>
    </header>
    <nav class="toc">
      <h2>Contents</h2>
      <ol id="toc-list"></ol>
    </nav>
    <div id="steps-content"></div>
    <footer>
      <h2>Next steps</h2>
      <p id="tutorial-footer">Suggest where to go from here — related tutorials, documentation, or advanced topics.</p>
    </footer>
  </article>
  <script src="render.js"></script>
</body>
</html>`,
    },
    {
      path: 'style.css',
      content: `* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: system-ui, sans-serif; color: #1a1a2e; background: #f8f9fa; }
article { max-width: 680px; margin: 0 auto; padding: 3rem 1.5rem; }
header { margin-bottom: 2.5rem; }
.label {
  font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.12em;
  color: #6366f1; font-weight: 600; margin-bottom: 0.5rem;
}
header h1 { font-size: 2rem; font-weight: 800; line-height: 1.2; margin-bottom: 0.75rem; }
.intro { color: #555; font-size: 1.05rem; line-height: 1.6; }
.meta { color: #888; font-size: 0.8rem; margin-top: 0.75rem; }
.toc {
  background: white; border: 1px solid #e8e8e8; border-radius: 10px;
  padding: 1.25rem 1.5rem; margin-bottom: 2.5rem;
}
.toc h2 { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.1em; color: #888; margin-bottom: 0.75rem; }
.toc ol { padding-left: 1.25rem; }
.toc li { margin-bottom: 0.4rem; }
.toc a { color: #6366f1; text-decoration: none; font-size: 0.9rem; }
.toc a:hover { text-decoration: underline; }
.step {
  display: flex; gap: 1.25rem; margin-bottom: 2.5rem;
  padding-bottom: 2.5rem; border-bottom: 1px solid #eee;
}
.step:last-of-type { border-bottom: none; }
.step-number {
  flex-shrink: 0; width: 36px; height: 36px; border-radius: 50%;
  background: #6366f1; color: white; font-weight: 700; font-size: 0.9rem;
  display: flex; align-items: center; justify-content: center; margin-top: 0.15rem;
}
.step-body { flex: 1; }
.step-body h2 { font-size: 1.2rem; font-weight: 700; margin-bottom: 0.75rem; }
.step-body p { color: #444; line-height: 1.7; margin-bottom: 0.75rem; }
pre {
  background: #1a1a2e; color: #e2e8f0; padding: 1rem 1.25rem;
  border-radius: 8px; overflow-x: auto; font-size: 0.85rem;
  line-height: 1.6; margin: 0.75rem 0;
}
code { font-family: 'JetBrains Mono', ui-monospace, monospace; }
.note {
  background: #eff6ff; border-left: 3px solid #6366f1; padding: 0.75rem 1rem;
  border-radius: 0 6px 6px 0; font-size: 0.9rem; color: #333;
}
footer { margin-top: 2rem; padding-top: 2rem; border-top: 1px solid #eee; }
footer h2 { font-size: 1rem; font-weight: 600; margin-bottom: 0.5rem; }
footer p { color: #555; line-height: 1.6; }`,
    },
    {
      path: 'config.json',
      content: JSON.stringify(
        {
          title: 'How to Do the Thing',
          description: 'A short description of what you\'ll learn and why it matters.',
          author: '',
          steps: [
            {
              title: 'Set things up',
              content: 'Explain any prerequisites or setup needed before the main task.',
              code: 'example command or code here',
              tip: '',
            },
            {
              title: 'Do the main task',
              content: 'Walk through the core steps clearly. Use code blocks, screenshots, or diagrams as needed.',
              code: '',
              tip: 'Add helpful tips in callout boxes like this.',
            },
            {
              title: 'Verify it works',
              content: 'Explain how to confirm everything is working correctly.',
              code: 'expected output here',
              tip: '',
            },
          ],
        },
        null,
        2,
      ),
    },
    {
      path: 'render.js',
      content: `// Render tutorial from config.json — re-run on every preview refresh
fetch('./config.json')
  .then(function (r) { return r.json(); })
  .then(function (data) {
    var steps = data.steps || [];

    // Header
    document.getElementById('tutorial-title').textContent = data.title || 'How To';
    document.getElementById('tutorial-intro').textContent = data.description || '';

    // Meta
    var metaParts = [];
    var readMin = Math.max(1, Math.ceil(steps.length * 1.5));
    metaParts.push(readMin + ' min read');
    if (data.author) metaParts.push(escapeHtml(data.author));
    document.getElementById('tutorial-meta').innerHTML = metaParts.join(' \\u00b7 ');

    // Table of contents
    var tocList = document.getElementById('toc-list');
    tocList.innerHTML = '';
    for (var i = 0; i < steps.length; i++) {
      var li = document.createElement('li');
      li.innerHTML = '<a href="#step-' + (i + 1) + '">' + escapeHtml(steps[i].title || 'Step ' + (i + 1)) + '</a>';
      tocList.appendChild(li);
    }

    // Steps
    var container = document.getElementById('steps-content');
    container.innerHTML = '';
    for (var i = 0; i < steps.length; i++) {
      var step = steps[i];
      var section = document.createElement('section');
      section.className = 'step';
      section.id = 'step-' + (i + 1);

      var html = '';
      html += '<div class="step-number">' + (i + 1) + '</div>';
      html += '<div class="step-body">';
      html += '<h2>' + escapeHtml(step.title || 'Step ' + (i + 1)) + '</h2>';
      html += '<p>' + escapeHtml(step.content || '') + '</p>';

      if (step.code) {
        html += '<pre><code>' + escapeHtml(step.code) + '</code></pre>';
      }

      if (step.tip) {
        html += '<div class="note"><strong>Tip:</strong> ' + escapeHtml(step.tip) + '</div>';
      }

      html += '</div>';
      section.innerHTML = html;
      container.appendChild(section);
    }

    // Footer
    var footerParts = ['Made with Crux Garden'];
    if (data.author) footerParts.unshift('By ' + escapeHtml(data.author));
    document.getElementById('tutorial-footer').innerHTML = footerParts.join(' \\u00b7 ');
  })
  .catch(function (err) { console.warn('render.js: could not load config.json', err); });

function escapeHtml(str) {
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}`,
    },
  ],
  layout: LAYOUT_BALANCED,
};

export default template;
