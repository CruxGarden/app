// SPDX-License-Identifier: GPL-3.0-or-later
import { CardinalEngine } from './engine.js';
import { validateDocument, macroState, macroChanges } from './model.js';
const $ = (id) => document.getElementById(id);
const engine = new CardinalEngine();
let doc,
  expected,
  saved = '',
  ready = false,
  timer,
  dirty = false,
  loading = false;
let tail = Promise.resolve();
let commandTail = Promise.resolve();
let commandBusy = false;
let automaticSaveFailed = false;
const requests = new Map();
function send(op, args = {}) {
  if (parent === window)
    return Promise.reject(new Error('Open this instrument inside Crux Garden Workshop.'));
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      requests.delete(id);
      reject(new Error('Garden did not confirm the save. Your draft is still here.'));
    }, 60000);
    requests.set(id, { resolve, reject, timeout });
    parent.postMessage({ type: 'crux:app', id, op, ...args }, '*');
  });
}
function signal(op, args) {
  parent.postMessage({ type: 'crux:app', id: crypto.randomUUID(), op, ...args }, '*');
}
function setDirty(value) {
  dirty = value;
  signal('dirty', { dirty: value });
}
function showError(error) {
  automaticSaveFailed = true;
  $('error').textContent = error.message || String(error);
  $('error').hidden = false;
  $('status').textContent = 'Not saved';
}
function clearError() {
  automaticSaveFailed = false;
  $('error').hidden = true;
}
function capture() {
  if (ready && !loading) doc.patch = engine.patch();
  return JSON.stringify(doc);
}
function changed() {
  setDirty(true);
  $('status').textContent = 'Unsaved changes';
  clearTimeout(timer);
  timer = setTimeout(() => void save().catch(showError), 600);
}
function save() {
  clearTimeout(timer);
  const work = tail.then(async () => {
    if (!ready || loading) throw new Error('Wait for the instrument to finish opening.');
    const content = capture();
    if (content === saved) {
      setDirty(false);
      $('status').textContent = 'Saved in this Crux';
      return;
    }
    validateDocument(doc);
    $('status').textContent = 'Saving…';
    const result = await send('write', {
      path: 'instrument.json',
      content: content + '\n',
      expected,
    });
    expected = result.fingerprint;
    saved = content;
    const stillDirty = capture() !== saved;
    setDirty(stillDirty);
    clearError();
    $('status').textContent = stillDirty ? 'Unsaved changes' : 'Saved in this Crux';
    if (stillDirty) changed();
  });
  tail = work.catch(() => {});
  return work;
}
function render() {
  $('sliders').replaceChildren();
  for (const macro of doc.macros) {
    const state = macroState(doc.patch, macro);
    const label = document.createElement('label');
    const title = document.createElement('span');
    title.textContent = macro.label;
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '1';
    slider.step = '0.001';
    slider.value = String(state.value);
    slider.disabled = !state.available;
    slider.setAttribute('aria-label', macro.label);
    const detail = document.createElement('small');
    detail.textContent = !state.available
      ? 'Mapped module removed'
      : state.custom
        ? 'Custom rack settings'
        : `${Math.round(state.value * 100)}%`;
    slider.addEventListener('input', () => {
      try {
        engine.call({ op: 'parameters', changes: macroChanges(macro, Number(slider.value)) });
        detail.textContent = `${Math.round(Number(slider.value) * 100)}%`;
        capture();
        changed();
      } catch (error) {
        showError(error);
      }
    });
    label.append(title, slider, detail);
    $('sliders').append(label);
  }
  $('preset').replaceChildren(new Option('Choose a sound', ''));
  for (const preset of doc.presets) $('preset').append(new Option(preset.name, preset.id));
}
async function stop() {
  await engine.stop();
  $('play').textContent = 'Start sound';
  $('playing').textContent = 'Silent';
}
async function readSaved() {
  loading = true;
  try {
    const result = await send('read', { path: 'instrument.json' });
    const next = validateDocument(JSON.parse(result.content));
    await engine.load(next.patch);
    doc = next;
    expected = result.fingerprint;
    doc.patch = engine.patch(); // Cardinal normalizes IDs/order and default module fields on load.
    saved = JSON.stringify(doc);
    setDirty(false);
    render();
    clearError();
    $('status').textContent = 'Saved in this Crux';
  } finally {
    loading = false;
  }
}
window.addEventListener('message', (event) => {
  if (event.source !== parent || !event.data || typeof event.data.id !== 'string') return;
  if (event.data.type === 'crux:app:result') {
    const pending = requests.get(event.data.id);
    if (!pending) return;
    requests.delete(event.data.id);
    clearTimeout(pending.timeout);
    if (event.data.error) pending.reject(new Error(event.data.error));
    else pending.resolve(event.data.result);
  } else if (event.data.type === 'crux:app:command') {
    const commandId = event.data.id;
    const command = event.data.command;
    const run = commandTail.then(() => runCommand(command));
    commandTail = run.catch(() => {});
    void run.then(
      (result) => signal('tool-result', { commandId, result }),
      (error) => {
        showError(error);
        signal('tool-result', { commandId, error: error.message });
      },
    );
  } else if (event.data.type === 'crux:app:flush') {
    const flushId = event.data.id;
    void stop()
      .then(save)
      .then(
        () => signal('flushed', { flushId }),
        (error) => {
          showError(error);
          signal('flushed', { flushId, error: error.message });
        },
      );
  }
});
function inspectInstrument() {
  capture();
  return {
    name: doc.name,
    playing: engine.audio.state === 'running',
    saved: JSON.stringify(doc) === saved,
    fingerprint: expected,
    controls: doc.macros.map((macro) => ({
      id: macro.id,
      label: macro.label,
      ...macroState(doc.patch, macro),
    })),
    presets: doc.presets.map((preset) => ({ id: preset.id, name: preset.name })),
    modules: doc.patch.modules.map((module) => ({
      id: module.id,
      plugin: module.plugin,
      model: module.model,
    })),
  };
}
async function runCommand(command) {
  if (!ready || loading || commandBusy)
    throw new Error('Wait for the instrument to finish opening.');
  if (command?.op === 'inspect') return inspectInstrument();
  commandBusy = true;
  const disabled = [...document.querySelectorAll('button,input,select,fieldset')].map((element) => [
    element,
    element.disabled,
  ]);
  for (const [element] of disabled) element.disabled = true;
  $('canvas').style.pointerEvents = 'none';
  try {
    let changes, preset;
    if (
      command?.op === 'controls' &&
      command.values &&
      typeof command.values === 'object' &&
      !Array.isArray(command.values)
    ) {
      const entries = Object.entries(command.values);
      if (!entries.length || entries.length > 16)
        throw new Error('Choose between 1 and 16 controls.');
      changes = entries.flatMap(([id, value]) => {
        const macro = doc.macros.find((m) => m.id === id);
        if (!macro) throw new Error(`Unknown instrument control: ${id}`);
        return macroChanges(macro, value);
      });
    } else if (command?.op === 'preset') {
      preset = doc.presets.find((p) => p.id === command.presetId);
      if (!preset) throw new Error('Choose an existing preset from inspect_instrument.');
    } else throw new Error('Unknown instrument command.');
    // Preserve any pending manual edit before an agent changes the live instrument.
    await save();
    if (changes) engine.call({ op: 'parameters', changes });
    else await engine.load(preset.patch);
    capture();
    render();
    changed();
    await save();
    return inspectInstrument();
  } finally {
    commandBusy = false;
    for (const [element, wasDisabled] of disabled) element.disabled = wasDisabled;
    $('canvas').style.pointerEvents = '';
  }
}
$('play').addEventListener('click', async () => {
  $('play').disabled = true;
  try {
    if (engine.audio.state === 'running') await stop();
    else {
      await engine.start();
      $('play').textContent = 'Stop sound';
      $('playing').textContent = 'Playing through Cardinal';
    }
  } catch (error) {
    showError(error);
  } finally {
    $('play').disabled = false;
  }
});
$('rack').addEventListener('click', () => {
  document.body.dataset.view = 'rack';
  $('back').hidden = false;
  window.dispatchEvent(new Event('resize'));
  $('canvas').focus();
});
$('back').addEventListener('click', () => {
  capture();
  render();
  document.body.dataset.view = 'instrument';
  $('back').hidden = true;
  void save().catch(showError);
});
for (const type of ['pointerdown', 'keyup', 'wheel'])
  $('canvas').addEventListener(type, () => {
    if (ready && !loading) changed();
  });
// Capture long rack drags while they happen; the queued writer still compares actual patch state.
setInterval(() => {
  if (ready && !loading && dirty && !automaticSaveFailed) void save().catch(showError);
}, 2500);
$('save').addEventListener('click', () => void save().catch(showError));
$('reload').addEventListener('click', async () => {
  if (
    (dirty || capture() !== saved) &&
    !confirm('Discard this unsaved draft and load the instrument saved in the Crux?')
  )
    return;
  clearTimeout(timer);
  $('reload').disabled = true;
  try {
    await tail;
    await stop();
    await readSaved();
  } catch (error) {
    showError(error);
  } finally {
    $('reload').disabled = false;
  }
});
$('preset').addEventListener('change', async () => {
  const preset = doc.presets.find((p) => p.id === $('preset').value);
  if (!preset) return;
  $('preset').disabled = true;
  try {
    await engine.load(preset.patch);
    capture();
    render();
    $('preset').value = preset.id;
    changed();
  } catch (error) {
    showError(error);
  } finally {
    $('preset').disabled = false;
  }
});
$('save-preset').addEventListener('click', () => {
  const name = $('preset-name').value.trim();
  if (!name) {
    showError(new Error('Give your preset a name.'));
    return;
  }
  if (doc.presets.length >= 16) {
    showError(new Error('This instrument supports up to 16 presets.'));
    return;
  }
  capture();
  doc.presets.push({ id: crypto.randomUUID(), name, patch: structuredClone(doc.patch) });
  $('preset-name').value = '';
  render();
  changed();
});
window.addEventListener('blur', () => {
  if (ready) {
    void stop().catch(showError);
    void save().catch(showError);
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && ready) void stop().catch(showError);
});
window.addEventListener('pagehide', () => {
  void engine.stop();
});
try {
  await engine.initialize($('canvas'));
  await readSaved();
  ready = true;
  for (const id of ['play', 'rack', 'controls', 'preset', 'save-preset', 'save', 'reload'])
    $(id).disabled = false;
} catch (error) {
  showError(error);
  await engine.stop();
}
