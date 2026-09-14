import { describe, it, expect } from 'vitest';
import { svgeditCommand } from './svgedit-tools';
import { pdfmeCommand } from './pdfme-tools';
import { layoutHistory } from '../../pdfme-crux/garden/history.js';
describe('web graphics and page layout boundaries', () => {
  it('refuses active SVG attributes, invalid geometry and undocumented inputs before dispatch', () => {
    for (const attributes of [
      { onload: 'alert(1)' },
      { href: 'https://example.com' },
      { width: -1 },
      { x: Infinity },
    ])
      expect(() =>
        svgeditCommand('set_svgedit_object', { elementId: 'svg_1', attributes }),
      ).toThrow();
    expect(() =>
      svgeditCommand('add_svgedit_shape', {
        type: 'text',
        attributes: { x: 1, y: 1 },
        text: '<script>literal</script>',
      }),
    ).not.toThrow();
    expect(() =>
      svgeditCommand('add_svgedit_shape', { type: 'rect', attributes: { x: 1, y: 1 } }),
    ).toThrow();
  });
  it('bounds every layout edit, including optional properties and image page selection', () => {
    for (const edit of [
      { x: -1 },
      { fontSize: 201 },
      { align: 'bad' },
      { name: 'bad/name' },
      { pageIndex: -1 },
      { text: 'x'.repeat(5001) },
    ])
      expect(() =>
        pdfmeCommand('update_layout_block', { name: 'headline', text: 'Title', ...edit }),
      ).toThrow();
    expect(() => pdfmeCommand('save_layout_image', { name: 'Page', pageIndex: 100 })).toThrow();
    expect(
      pdfmeCommand('update_layout_block', { name: 'details', pageIndex: 1, x: 40 }),
    ).toMatchObject({ op: 'update-block', pageIndex: 1 });
  });
  it('undoes complete multi-page changes and discards redo after a manual revision', () => {
    const original = { pages: [['manual heading']] };
    const history = layoutHistory(original);
    const edited = { pages: [['manual heading'], ['agent details']] };
    history.record(edited);
    edited.pages[0]![0] = 'later mutation';
    expect(history.undo()).toEqual(original);
    expect(history.redo()).toEqual({ pages: [['manual heading'], ['agent details']] });
    history.undo();
    history.record({ pages: [['revised by person']] });
    expect(history.redo()).toBeNull();
    expect(history.undo()).toEqual(original);
  });
});
