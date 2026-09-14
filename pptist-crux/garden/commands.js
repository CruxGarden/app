// Shared by the host validator and the native bridge. Keep input bounds identical.
const fields = {
  inspect: ['slideId', 'offset', 'limit'],
  'save-presentation': ['name'],
  'set-title': ['title'],
  'add-slide': ['text'],
  'add-text': ['slideId', 'text', 'left', 'top', 'width', 'height', 'fontSize', 'color'],
  'edit-element': [
    'slideId',
    'elementId',
    'find',
    'replace',
    'left',
    'top',
    'width',
    'height',
    'rotate',
  ],
  'delete-element': ['slideId', 'elementId'],
  'move-slide': ['slideId', 'index'],
  'delete-slide': ['slideId'],
};
function text(value, max, empty = false) {
  return typeof value === 'string' && value.length <= max && (empty || value.trim().length > 0);
}
export function validateCommand(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !Object.hasOwn(fields, value.op)
  )
    throw Error('Choose a supported PPTist operation.');
  const allowed = fields[value.op];
  if (Object.keys(value).some((key) => key !== 'op' && !allowed.includes(key)))
    throw Error('Unexpected PPTist property.');
  for (const key of ['slideId', 'elementId']) {
    const required = allowed.includes(key) && value.op !== 'inspect';
    if ((required || value[key] !== undefined) && !text(value[key], 100))
      throw Error(`Provide a valid ${key} from inspection.`);
  }
  if (value.op === 'save-presentation' && !text(value.name, 120))
    throw Error('Name the presentation output (up to 120 characters).');
  if (value.op === 'set-title' && !text(value.title, 200))
    throw Error('Use a presentation title up to 200 characters.');
  if ((value.op === 'add-text' || value.text !== undefined) && !text(value.text, 2000))
    throw Error('Use text up to 2000 characters.');
  const bounds = {
    left: [-10000, 10000],
    top: [-10000, 10000],
    width: [1, 10000],
    height: [1, 10000],
    rotate: [-360, 360],
    fontSize: [8, 300],
  };
  for (const [key, [min, max]] of Object.entries(bounds)) {
    if (
      value[key] !== undefined &&
      (!Number.isFinite(value[key]) || value[key] < min || value[key] > max)
    )
      throw Error(`${key} must be a number between ${min} and ${max}.`);
    if (
      value.op === 'add-text' &&
      ['left', 'top', 'width', 'height'].includes(key) &&
      value[key] === undefined
    )
      throw Error(`Specify ${key} in slide pixels.`);
  }
  if (
    value.color !== undefined &&
    (typeof value.color !== 'string' || !/^#[a-f\d]{6}$/i.test(value.color))
  )
    throw Error('Use a six-digit hex colour.');
  if (value.find !== undefined || value.replace !== undefined) {
    if (!text(value.find, 2000) || !text(value.replace, 2000, true))
      throw Error('Provide exact find text and replacement text (up to 2000 characters).');
  }
  if (
    value.op === 'edit-element' &&
    !Object.keys(value).some((key) => !['op', 'slideId', 'elementId'].includes(key))
  )
    throw Error('Specify text replacement or geometry to change.');
  for (const key of ['offset', 'limit', 'index']) {
    if (
      (value[key] !== undefined || (key === 'index' && value.op === 'move-slide')) &&
      (!Number.isSafeInteger(value[key]) ||
        value[key] < (key === 'limit' ? 1 : 0) ||
        value[key] > (key === 'limit' ? 50 : 10000))
    )
      throw Error(`Use a valid ${key}${key === 'limit' ? ' between 1 and 50' : ''}.`);
  }
  return {
    ...value,
    ...(value.title !== undefined ? { title: value.title.trim() } : {}),
    ...(value.op === 'add-slide' && value.text !== undefined ? { text: value.text.trim() } : {}),
  };
}

export function resolveTargets(slides, command) {
  if (!command.slideId) return {};
  const slide = slides.find((item) => item.id === command.slideId);
  if (!slide) throw Error('Slide no longer exists. Inspect the presentation again.');
  const element = command.elementId
    ? slide.elements.find((item) => item.id === command.elementId)
    : undefined;
  if (command.elementId && !element)
    throw Error('Element no longer exists on that slide. Inspect it again.');
  if (
    element?.type === 'line' &&
    ['width', 'height', 'rotate'].some((key) => command[key] !== undefined)
  )
    throw Error('Line geometry uses endpoints. This tool can move a line; resize it in PPTist.');
  if (element?.lock) throw Error('This element is locked. Unlock it in PPTist before editing.');
  if (command.find !== undefined && element?.type !== 'text')
    throw Error('Exact text replacement requires a text element.');
  if (command.op === 'delete-slide' && slides.length <= 1) throw Error('Keep at least one slide.');
  if (command.op === 'move-slide' && command.index >= slides.length)
    throw Error('Slide index is outside this presentation.');
  return { slide, element };
}

/** Replace one exact occurrence across rich-text runs, retaining unaffected markup. */
export function replaceText(html, find, replacement) {
  const root = document.createElement('div');
  root.innerHTML = html;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let node;
  while ((node = walker.nextNode())) nodes.push(node);
  const full = nodes.map((item) => item.textContent).join('');
  const start = full.indexOf(find);
  if (start < 0 || full.indexOf(find, start + 1) >= 0)
    throw Error(
      'Find text must occur exactly once in the element. Inspect and use a unique phrase.',
    );
  const end = start + find.length;
  let offset = 0;
  let inserted = false;
  for (const item of nodes) {
    const value = item.textContent;
    const next = offset + value.length;
    if (next > start && offset < end) {
      item.textContent =
        value.slice(0, Math.max(0, start - offset)) +
        (inserted ? '' : replacement) +
        value.slice(Math.min(value.length, end - offset));
      inserted = true;
    }
    offset = next;
  }
  return root.innerHTML;
}

export function textElement(command, theme) {
  const root = document.createElement('div');
  for (const line of command.text.split('\n')) {
    const p = document.createElement('p');
    const span = document.createElement('span');
    span.style.fontSize = `${command.fontSize ?? 32}px`;
    if (command.color) span.style.color = command.color;
    span.textContent = line;
    p.append(span);
    root.append(p);
  }
  return {
    type: 'text',
    id: crypto.randomUUID().slice(0, 10),
    left: command.left,
    top: command.top,
    width: command.width,
    height: command.height,
    rotate: 0,
    content: root.innerHTML,
    defaultFontName: theme.fontName,
    defaultColor: command.color ?? theme.fontColor,
    lineHeight: 1.2,
  };
}
