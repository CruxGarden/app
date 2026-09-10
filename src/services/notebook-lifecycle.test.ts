import { it, expect, vi } from 'vitest';
import {
  registerNotebookEditor,
  notebookIsDirty,
  flushNotebook,
  deferNotebookAction,
} from './notebook-lifecycle';
import { createCruxStore } from '@/stores/cruxStore';
import { createUIStore } from '@/stores/uiStore';
import { documentsFor } from './workspace-documents';

it('holds navigation until the notebook confirms its pending save', async () => {
  // The iframe's dirty message may still be queued when a host control is clicked.
  let dirty = false;
  let finish!: () => void;
  const release = registerNotebookEditor('notebook', {
    dirty: () => dirty,
    flush: () =>
      new Promise<void>((r) => {
        finish = () => {
          dirty = false;
          r();
        };
      }),
  });
  try {
    const action = vi.fn(() => {
      expect(deferNotebookAction('notebook', () => {})).toBe(false);
    });
    expect(deferNotebookAction('notebook', action)).toBe(true);
    expect(action).not.toHaveBeenCalled();
    finish();
    await Promise.resolve();
    await Promise.resolve();
    expect(action).toHaveBeenCalledOnce();
    expect(notebookIsDirty('notebook')).toBe(false);
  } finally {
    release();
  }
});
it('failed notebook saves keep file-tab close guards dirty', async () => {
  const data = createCruxStore();
  data.setState({ crux: { id: 'notebook' } as never });
  const docs = documentsFor(data, createUIStore());
  const release = registerNotebookEditor('notebook', {
    dirty: () => true,
    flush: async () => {
      throw new Error('Disk full');
    },
  });
  try {
    expect(docs.hasDirty()).toBe(true);
    await expect(docs.saveAll()).rejects.toThrow('Disk full');
    await expect(flushNotebook('notebook')).rejects.toThrow('Disk full');
    expect(docs.hasDirty()).toBe(true);
  } finally {
    release();
  }
});
