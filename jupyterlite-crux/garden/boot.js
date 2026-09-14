import { startGarden } from './bridge.js';
import { notebookCommands } from './notebook.js';
export const garden = window.parent === window ? null : await startGarden();
async function connect() {
  const deadline = Date.now() + 90000;
  while (!window.jupyterapp) {
    if (Date.now() > deadline) throw new Error('The notebook app did not finish opening.');
    await new Promise((r) => setTimeout(r, 50));
  }
  const app = window.jupyterapp;
  await app.restored;
  const contents = app.serviceManager.contents;
  const widgets = () => [...app.shell.widgets('main')].filter((w) => w.context?.model);
  const initial = garden.initial;
  if (initial) {
    const directories = initial.files
      .filter((f) => f.type === 'directory')
      .sort((a, b) => a.path.split('/').length - b.path.split('/').length);
    for (const file of [...directories, ...initial.files.filter((f) => f.type !== 'directory')])
      await contents.save(file.path, { ...file });
    for (const path of initial.open) await app.commands.execute('docmanager:open', { path });
    if (initial.active) await app.commands.execute('docmanager:open', { path: initial.active });
    if (app.commands.hasCommand('filebrowser:refresh'))
      await app.commands.execute('filebrowser:refresh');
  }
  const observed = new WeakSet();
  function watch() {
    for (const widget of widgets())
      if (!observed.has(widget.context.model)) {
        observed.add(widget.context.model);
        widget.context.model.contentChanged.connect(() => garden.changed());
      }
  }
  watch();
  app.shell.layoutModified.connect(() => {
    watch();
    garden.changed();
  });
  contents.fileChanged.connect(() => garden.changed());
  const capture = async () => {
    for (const widget of widgets()) if (widget.context.model.dirty) await widget.context.save();
    const files = [];
    async function visit(path) {
      const dir = await contents.get(path, { content: true });
      for (const child of dir.content) {
        if (child.type === 'directory') {
          files.push({
            path: child.path,
            type: 'directory',
            format: null,
            mimetype: '',
            content: null,
          });
          await visit(child.path);
        } else {
          const file = await contents.get(child.path, { content: true });
          files.push({
            path: file.path,
            type: file.type,
            format: file.format,
            mimetype: file.mimetype || '',
            content: file.content,
          });
        }
      }
    }
    await visit('');
    files.sort((a, b) => a.path.localeCompare(b.path));
    const paths = new Set(files.map((f) => f.path));
    const open = [
      ...new Set(
        widgets()
          .map((w) => w.context.path)
          .filter((p) => paths.has(p)),
      ),
    ];
    const active = app.shell.currentWidget?.context?.path;
    return { files, open, active: open.includes(active) ? active : null };
  };
  const commands = notebookCommands(app, garden.saveOutput);
  garden.connect({
    capture,
    busy: () =>
      widgets().some((w) =>
        ['busy', 'starting'].includes(w.sessionContext?.session?.kernel?.status),
      ),
    prepare: commands.prepare,
  });
}
if (garden) connect().catch(garden.failed);
