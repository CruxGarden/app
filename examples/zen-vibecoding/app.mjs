import { missions, validateArtifact, newProgress, restoreProgress } from './missions.mjs';
const $ = (id) => document.getElementById(id);
const key = 'crux-garden-zen-v1';
let progress = newProgress();
let storageWarning = '';
try {
  const saved = localStorage.getItem(key);
  if (saved) progress = restoreProgress(JSON.parse(saved));
} catch {
  storageWarning =
    'Browser progress could not be restored. Download your journal to keep it safely.';
}
function save() {
  try {
    localStorage.setItem(key, JSON.stringify(progress));
  } catch {
    storageWarning = 'Browser storage is unavailable. Download your journal before leaving.';
    $('feedback').textContent = storageWarning;
  }
}
function node(tag, text, cls) {
  const el = document.createElement(tag);
  if (text) el.textContent = text;
  if (cls) el.className = cls;
  return el;
}
function paintGarden() {
  const awake = [
    progress.completed.includes(0),
    progress.completed.includes(1),
    progress.completed.includes(1),
    progress.completed.includes(2),
    progress.completed.includes(4),
    progress.completed.includes(5),
  ];
  ['seed', 'pond', 'tree', 'lantern', 'bridge', 'fireflies'].forEach((name, i) =>
    $(name + '-art').classList.toggle('awake', awake[i]),
  );
  $('completion').textContent = `${progress.completed.length} / ${missions.length} milestones`;
  $('trail').replaceChildren(
    ...missions.map((mission, i) => {
      const button = node('button', String(i + 1), progress.completed.includes(i) ? 'done' : '');
      button.setAttribute(
        'aria-label',
        `${i + 1}. ${mission.label}${progress.completed.includes(i) ? ' — completed' : ''}`,
      );
      if (progress.chapter === i) button.setAttribute('aria-current', 'step');
      button.onclick = () => {
        progress.chapter = i;
        save();
        render();
      };
      return button;
    }),
  );
}
function render() {
  const chapter = progress.chapter,
    mission = missions[chapter];
  $('chapter-number').textContent = `STEPPING STONE ${chapter + 1} / ${missions.length}`;
  $('mission-title').textContent = mission.title;
  $('mission-description').textContent = mission.description;
  const body = $('mission-body');
  body.replaceChildren();
  const steps = node('ol', null, 'steps');
  mission.steps.forEach((text) => steps.append(node('li', text)));
  body.append(steps, node('p', mission.tip, 'tip'));
  for (const [title, prompt] of mission.prompts) {
    const details = node('details', null, 'prompt');
    details.append(node('summary', `Agent prompt · ${title}`));
    const field = node('textarea');
    field.readOnly = true;
    field.value = prompt;
    field.setAttribute('aria-label', `${title} prompt`);
    const copy = node('button', 'Copy prompt');
    copy.onclick = async () => {
      try {
        await navigator.clipboard.writeText(prompt);
        copy.textContent = 'Copied';
      } catch {
        field.focus();
        field.select();
        copy.textContent = 'Selected — copy with your keyboard';
      }
    };
    details.append(field, copy);
    body.append(details);
  }
  const checks = node('ul', null, 'checks');
  checks.setAttribute('aria-label', 'Files checked in Main');
  mission.checks.forEach((check) => checks.append(node('li', `File check · ${check.path}`)));
  body.append(checks);
  mission.observations.forEach((text, j) => {
    const label = node('label', null, 'observation');
    const input = node('input');
    input.type = 'checkbox';
    input.checked = progress.observations[chapter]?.[j] === true;
    input.onchange = () => {
      (progress.observations[chapter] ??= [])[j] = input.checked;
      if (!input.checked) progress.completed = progress.completed.filter((n) => n !== chapter);
      save();
      paintGarden();
      $('next').hidden = !progress.completed.includes(chapter) || chapter === missions.length - 1;
    };
    label.append(input, node('span', `Your observation · ${text}`));
    body.append(label);
  });
  $('feedback').textContent =
    storageWarning ||
    (progress.completed.includes(chapter)
      ? 'Previously completed. Check again to inspect the current files.'
      : '');
  $('next').hidden = !progress.completed.includes(chapter) || chapter === missions.length - 1;
  $('world-caption').textContent = progress.completed.includes(chapter)
    ? mission.reward
    : 'Nothing is timed. Curiosity counts more than speed.';
  paintGarden();
}
async function readArtifact(check) {
  const limit = check.png ? 5 * 1024 * 1024 : 65536;
  const response = await fetch(`./${check.path}?check=${Date.now()}`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(6000),
  });
  if (!response.ok)
    throw Error(
      response.status === 404
        ? 'Not in this preview yet. Finish the Task, merge, and check Main.'
        : `Could not read it (HTTP ${response.status}).`,
    );
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > limit)
        throw Error(`File is too large for this lesson (${check.png ? '5 MiB' : '64 KiB'} limit).`);
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  const problem = validateArtifact(check, bytes);
  if (problem) throw Error(problem);
  if (check.png) {
    const picture = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    picture.close();
  }
  return bytes;
}
$('check').onclick = async () => {
  const chapter = progress.chapter,
    mission = missions[chapter];
  $('check').disabled = true;
  for (const button of $('trail').children) button.disabled = true;
  $('next').hidden = true;
  $('feedback').textContent = 'Looking at the actual files in this preview…';
  const errors = [];
  let seed;
  for (const check of mission.checks) {
    try {
      const bytes = await readArtifact(check);
      if (check.color) seed = JSON.parse(new TextDecoder().decode(bytes));
    } catch (error) {
      errors.push(`${check.path}: ${error.message}`);
    }
  }
  if (!mission.observations.every((_, j) => progress.observations[chapter]?.[j]))
    errors.push(
      'Check the observations you actually made. Record a blocker in the journal if you could not complete one.',
    );
  if (errors.length) {
    progress.completed = progress.completed.filter((n) => n !== chapter);
    $('feedback').textContent = errors.join('\n\n');
    $('next').hidden = true;
  } else {
    if (!progress.completed.includes(chapter)) progress.completed.push(chapter);
    $('feedback').textContent = 'Files checked. Your UI observations recorded. ' + mission.reward;
    $('world-caption').textContent = mission.reward;
    $('next').hidden = chapter === missions.length - 1;
    if (seed) {
      $('garden-name').textContent = seed.name;
      $('seed-flower').setAttribute('fill', seed.color);
    }
  }
  save();
  paintGarden();
  void refreshSouvenirs();
  $('check').disabled = false;
};
$('next').onclick = () => {
  progress.chapter = Math.min(progress.chapter + 1, missions.length - 1);
  save();
  render();
  $('mission-title').scrollIntoView({ block: 'start', behavior: 'smooth' });
};
function journal() {
  $('note-title').value = missions[progress.chapter].title;
  $('notes').replaceChildren(
    ...progress.notes.map((note) => node('li', `${note.title} · ${note.feeling}\n${note.text}`)),
  );
  $('journal').showModal();
}
$('journal-open').onclick = journal;
$('save-note').onclick = () => {
  const text = $('note').value.trim();
  if (!text) {
    $('journal-status').textContent = 'Write a small observation first.';
    return;
  }
  if (progress.notes.length >= 500) {
    $('journal-status').textContent =
      'This journal has 500 observations. Download it before starting another.';
    return;
  }
  progress.notes.push({
    title: $('note-title').value,
    feeling: $('feeling').value,
    text,
    at: new Date().toISOString(),
  });
  save();
  $('note').value = '';
  $('notes').append(
    node('li', `${progress.notes.at(-1).title} · ${progress.notes.at(-1).feeling}\n${text}`),
  );
  $('journal-status').textContent = storageWarning || 'Observation saved in this preview.';
};
$('download').onclick = () => {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(progress, null, 2)], { type: 'application/json' }),
  );
  const link = node('a');
  link.href = url;
  link.download = 'zen-of-vibecoding-journal.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$('restore').onchange = async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 2 * 1024 * 1024) throw Error('Journal must be smaller than 2 MiB.');
    const incoming = restoreProgress(JSON.parse(await file.text())); // Validate before touching current work.
    // Preserve local observations when bringing a journal from another preview.
    const existing = new Set(incoming.notes.map((note) => JSON.stringify(note)));
    incoming.notes.push(...progress.notes.filter((note) => !existing.has(JSON.stringify(note))));
    if (incoming.notes.length > 500)
      throw Error(
        'Combined journal would exceed 500 observations. Download both journals separately.',
      );
    progress = incoming;
    save();
    render();
    $('notes').replaceChildren(
      ...progress.notes.map((note) => node('li', `${note.title} · ${note.feeling}\n${note.text}`)),
    );
    $('journal-status').textContent =
      'Progress restored; existing observations preserved. Recheck files in this preview.';
  } catch (error) {
    $('journal-status').textContent = error.message;
  }
  event.target.value = '';
};
render();

// Show the player's actual creations after a check and on a returning visit.
// This never awards a milestone: missing/changed files are assessed by Check.
async function refreshSouvenirs() {
  if (progress.completed.includes(0)) {
    try {
      const seed = JSON.parse(new TextDecoder().decode(await readArtifact(missions[0].checks[0])));
      $('garden-name').textContent = seed.name;
      $('seed-flower').setAttribute('fill', seed.color);
    } catch {
      /* Check explains missing files. */
    }
  }
  $('poem').hidden = true;
  if (progress.completed.includes(2)) {
    try {
      const poem = JSON.parse(new TextDecoder().decode(await readArtifact(missions[2].checks[1])));
      $('poem').textContent = poem.text;
      $('poem').hidden = false;
    } catch {
      /* Check explains missing files. */
    }
  }
  $('postcard').hidden = true;
  if (progress.completed.includes(4)) {
    try {
      await readArtifact(missions[4].checks[1]);
      $('postcard').src = './garden/postcard.png';
      $('postcard').hidden = false;
    } catch {
      /* Check explains missing files. */
    }
  }
}
void refreshSouvenirs();
