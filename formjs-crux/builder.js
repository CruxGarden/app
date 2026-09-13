// The form builder around form-js (bpmn.io): the actual FormEditor for
// building, the actual Form viewer for a preview, and the plain data the Crux
// keeps: a name and the form-js schema. Inside a Crux the Garden bridge saves
// it; standalone the browser does.
/* global FormEditor, FormViewer */
(function () {
  const Editor = FormEditor.FormEditor || FormEditor;
  const Viewer = FormViewer.Form || FormViewer;
  const state = { name: 'Form', schema: null };
  const empty = () => ({ type: 'default', id: 'Form_' + crypto.randomUUID().slice(0, 8), components: [] });
  let editor = null;
  let viewer = null;
  let listeners = [];
  let hydrating = false;
  const notify = () => listeners.forEach((fn) => fn());
  const nameInput = document.getElementById('form-name');
  const tabEdit = document.getElementById('tab-edit');
  const tabPreview = document.getElementById('tab-preview');
  const editorEl = document.getElementById('editor');
  const previewEl = document.getElementById('preview');
  const result = document.getElementById('preview-result');
  const FIELD_TYPES = ['textfield', 'textarea', 'number', 'checkbox', 'checklist', 'radio', 'select', 'datetime', 'taglist', 'text', 'separator'];
  const keyFor = (label) =>
    (label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'field').slice(0, 60);

  async function mount() {
    if (editor) editor.destroy();
    editor = new Editor({ container: editorEl });
    hydrating = true;
    await editor.importSchema(state.schema);
    hydrating = false;
    editor.on('changed', () => {
      if (hydrating) return;
      state.schema = editor.saveSchema ? editor.saveSchema() : editor.getSchema();
      notify();
    });
  }
  async function showPreview(on) {
    tabEdit.setAttribute('aria-selected', String(!on));
    tabPreview.setAttribute('aria-selected', String(on));
    editorEl.hidden = on;
    previewEl.hidden = !on;
    result.hidden = true;
    if (!on) return;
    if (viewer) viewer.destroy();
    viewer = new Viewer({ container: document.getElementById('viewer') });
    await viewer.importSchema(state.schema, {});
    // form-js leaves the submit control to its host: the page's own button asks the form to submit.
    document.getElementById('preview-submit').onclick = () => viewer.submit();
    viewer.on('submit', (event) => {
      result.hidden = false;
      result.textContent =
        'Preview only (nothing is stored). ' +
        (Object.keys(event.errors || {}).length ? 'Fix the marked fields.' : 'Submitted: ' + JSON.stringify(event.data, null, 2));
    });
  }
  nameInput.addEventListener('input', () => {
    state.name = nameInput.value;
    notify();
  });
  tabEdit.onclick = () => showPreview(false);
  tabPreview.onclick = () => showPreview(true);

  window.builder = {
    fieldTypes: FIELD_TYPES,
    async load(saved) {
      state.name = (saved && saved.name) || 'Form';
      state.schema = (saved && saved.schema) || empty();
      nameInput.value = state.name;
      await mount();
    },
    snapshot: () => JSON.parse(JSON.stringify(state)),
    onChange(fn) {
      listeners.push(fn);
    },
    setName(name) {
      state.name = name;
      nameInput.value = name;
      notify();
    },
    async addField(field) {
      const type = String(field.type || 'textfield');
      if (!FIELD_TYPES.includes(type)) throw new Error('Choose a field type: ' + FIELD_TYPES.join(', ') + '.');
      const label = String(field.label || '').trim();
      const component = { type, id: 'Field_' + crypto.randomUUID().slice(0, 8) };
      if (type !== 'separator') component.label = label || type;
      if (type === 'text') component.text = label || 'Text';
      if (!['text', 'separator'].includes(type)) component.key = field.key ? String(field.key) : keyFor(label || type);
      if (['checklist', 'radio', 'select', 'taglist'].includes(type))
        component.values = (field.options || ['Option 1', 'Option 2']).map((v) => ({ label: String(v), value: keyFor(String(v)) }));
      if (field.required) component.validate = { required: true };
      state.schema = { ...state.schema, components: [...state.schema.components, component] };
      await mount();
      notify();
      return component;
    },
    async removeField(key) {
      const before = state.schema.components.length;
      state.schema = { ...state.schema, components: state.schema.components.filter((c) => c.key !== key && c.id !== key) };
      if (state.schema.components.length === before) return false;
      await mount();
      notify();
      return true;
    },
    preview: showPreview,
    ready: () => !!editor,
  };

  if (parent === window) {
    const KEY = 'formjs.project';
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    } catch (e) {
      saved = null;
    }
    window.builder.load(saved);
    window.builder.onChange(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(state));
      } catch (e) {
        /* storage unavailable: the session still works */
      }
    });
  }
})();
