import { validateCommand, replaceSource, summarizeCell } from './commands.js';

/** Native JupyterLab operations; persistence is supplied by the common command session. */
export function notebookCommands(app, saveOutput) {
  const widgets = () =>
    [...app.shell.widgets('main')].filter((w) => w.context?.model?.sharedModel?.cells);
  function current() {
    const widget = app.shell.currentWidget;
    if (!widget?.context?.model?.sharedModel?.cells)
      throw new Error('Open a notebook before using this operation.');
    return widget;
  }
  const modelOf = (widget) => widget.context.model.sharedModel;
  function findCell(widget, id) {
    const index = modelOf(widget).cells.findIndex((c) => c.getId() === id);
    if (index < 0) throw new Error('The cell no longer exists in this notebook. Inspect again.');
    return { index, cell: modelOf(widget).cells[index] };
  }
  function inspect(widget, options = {}) {
    const cells = widget ? modelOf(widget).cells : [];
    const offset = options.cellId ? findCell(widget, options.cellId).index : (options.offset ?? 0);
    const limit = options.cellId ? 1 : (options.limit ?? 3);
    return {
      active: widget?.context.path ?? null,
      open: widgets()
        .slice(0, 30)
        .map((w) => w.context.path),
      kernel: widget?.sessionContext?.session?.kernel?.status ?? 'not started',
      totalCells: cells.length,
      offset,
      nextOffset: offset + limit < cells.length ? offset + limit : null,
      cells: cells
        .slice(offset, offset + limit)
        .map((c, i) =>
          summarizeCell(c, offset + i, options.sourceOffset ?? 0, options.cellId ? 6000 : 600),
        ),
    };
  }
  function select(widget, index) {
    app.shell.activateById(widget.id);
    widget.content.deselectAll();
    widget.content.activeCellIndex = index;
    widget.content.mode = 'command';
  }
  function edit(widget, cell, apply) {
    const managers = new Set([modelOf(widget).undoManager, cell?.undoManager].filter(Boolean));
    for (const manager of managers) manager.stopCapturing();
    try {
      return apply();
    } finally {
      for (const manager of managers) manager.stopCapturing();
    }
  }
  async function run(widget, index) {
    select(widget, index);
    // Select only the requested cell; native run owns execution, outputs and errors.
    const running = app.commands.execute('notebook:run-cell');
    let timer;
    try {
      const succeeded = await Promise.race([
        running,
        new Promise((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error(
                  'Execution exceeded 60 seconds. Inspect the notebook before retrying; execution may have changed files.',
                ),
              ),
            60000,
          );
        }),
      ]);
      return { executionSucceeded: succeeded === true };
    } catch (error) {
      // Stop a timed-out kernel without replaying an uncertain operation.
      widget.sessionContext?.session?.kernel?.interrupt().catch(() => {});
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  return {
    inspect: () =>
      inspect(widgets().includes(app.shell.currentWidget) ? app.shell.currentWidget : null),
    prepare(raw) {
      const value = validateCommand(raw);
      if (value.op === 'create-notebook')
        return {
          mutates: true,
          apply: async () => {
            const contents = app.serviceManager.contents;
            const root = await contents.get('', { content: true });
            if (root.content.some((file) => file.path === value.name))
              throw new Error(
                'That file already exists. Open it in the file browser or choose a new name.',
              );
            await contents.save(value.name, {
              type: 'notebook',
              format: 'json',
              content: {
                nbformat: 4,
                nbformat_minor: 5,
                metadata: {
                  kernelspec: {
                    name: 'python',
                    display_name: 'Python (Pyodide)',
                    language: 'python',
                  },
                },
                cells: [
                  {
                    id: crypto.randomUUID(),
                    cell_type: 'code',
                    source: '',
                    metadata: {},
                    outputs: [],
                    execution_count: null,
                  },
                ],
              },
            });
            const widget = await app.commands.execute('docmanager:open', { path: value.name });
            await widget.context.ready;
            return inspect(widget);
          },
        };
      const widget =
        value.op === 'inspect' && !value.cellId
          ? widgets().includes(app.shell.currentWidget)
            ? app.shell.currentWidget
            : null
          : current();
      if (value.op === 'inspect') return { mutates: false, apply: () => inspect(widget, value) };
      const model = modelOf(widget);
      const target = value.cellId ? findCell(widget, value.cellId) : null;
      if (value.op === 'insert-cell' && value.index > model.cells.length)
        throw new Error('Insert within the current cell count. Inspect again.');
      if (['append-cell', 'insert-cell'].includes(value.op) && model.cells.length >= 1000)
        throw new Error('Agent insertion supports at most 1,000 cells per notebook.');
      if (value.op === 'replace-cell')
        replaceSource(target.cell.getSource(), value.find, value.replace);
      if (value.op === 'delete-cell' && model.cells.length <= 1)
        throw new Error('Keep at least one cell in the notebook.');
      if (
        value.op === 'move-cell' &&
        (value.direction === 'up' ? target.index === 0 : target.index === model.cells.length - 1)
      )
        throw new Error('The cell is already at that end of the notebook.');
      if (
        value.op === 'save-plot' &&
        !target.cell.getOutputs?.()[value.outputIndex]?.data?.['image/png']
      )
        throw new Error('Choose an outputIndex with an image/png result from inspection.');
      return {
        mutates: true,
        apply: async () => {
          // Re-resolve after pre-save: manual edits may have happened while awaiting confirmation.
          const live = value.cellId ? findCell(widget, value.cellId) : null;
          let extra = {};
          if (value.op === 'append-cell' || value.op === 'insert-cell') {
            const index = value.op === 'append-cell' ? model.cells.length : value.index;
            if (index > model.cells.length)
              throw new Error('The cell order changed. Inspect again.');
            edit(widget, null, () =>
              model.insertCell(index, {
                cell_type: value.cellType,
                source: value.source,
                metadata: {},
                ...(value.cellType === 'code' ? { outputs: [], execution_count: null } : {}),
              }),
            );
            select(widget, index);
            extra = { cellId: model.cells[index].getId() };
          } else if (value.op === 'replace-cell') {
            const source = replaceSource(live.cell.getSource(), value.find, value.replace);
            edit(widget, live.cell, () => live.cell.setSource(source));
            select(widget, live.index);
            extra = { cellId: value.cellId, outputsMayBeStale: live.cell.cell_type === 'code' };
          } else if (value.op === 'move-cell' || value.op === 'delete-cell') {
            if (value.op === 'delete-cell' && model.cells.length <= 1)
              throw new Error('Keep at least one cell.');
            select(widget, live.index);
            await edit(widget, null, () =>
              app.commands.execute(
                value.op === 'delete-cell'
                  ? 'notebook:delete-cell'
                  : `notebook:move-cell-${value.direction}`,
              ),
            );
          } else if (value.op === 'run-cell') extra = await run(widget, live.index);
          else if (value.op === 'save-notebook') {
            await widget.context.save();
            const json = JSON.stringify(widget.context.model.toJSON());
            extra = await saveOutput(
              value.label,
              'application/x-ipynb+json',
              new TextEncoder().encode(json),
            );
          } else if (value.op === 'save-plot') {
            const png = live.cell.getOutputs()[value.outputIndex]?.data?.['image/png'];
            if (!png) throw new Error('The PNG output changed. Inspect again.');
            const encoded = Array.isArray(png) ? png.join('') : png;
            if (encoded.length > 43000000) throw new Error('Keep plot outputs below 32 MB.');
            extra = await saveOutput(
              value.label,
              'image/png',
              Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0)),
            );
          }
          return extra;
        },
        result: (extra) => ({
          ...inspect(
            widget,
            value.cellId && model.cells.some((c) => c.getId() === value.cellId)
              ? { cellId: value.cellId }
              : {},
          ),
          ...extra,
        }),
      };
    },
  };
}
