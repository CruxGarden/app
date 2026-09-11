import { describe, it, expect } from 'vitest';
import { isToolNotice, toolInfo } from './tool-info';
import { applyTemplateMeta, loadTemplate } from '@/templates';

describe('portable tool credits', () => {
  it('stamps an actual template and keeps its own version/adaptation record with the project', async () => {
    const template = (await loadTemplate('tool-tables'))!;
    const meta = JSON.parse(JSON.stringify(applyTemplateMeta({}, template, 'tool-tables')));
    const info = toolInfo(meta)!;
    expect(info.name).toBe('Tabulator');
    expect(info.relationship).toContain('custom Garden');
    expect(template.files.find((file) => file.path === info.detailsPath)?.content).toContain(
      'Tabulator 6.5.2',
    );
    expect(template.files.some((file) => isToolNotice(file.path))).toBe(true);
    // A portable custom identity survives without depending on a built-in template ID.
    expect(toolInfo({ ...meta, template: 'my-own-fork' })).toEqual(info);
  });
  it('supports older Cruxes without inventing the version of their installed files', () => {
    expect(toolInfo({ template: 'gdevelop-app' })?.detailsPath).toBe('UPSTREAM.md');
    expect(toolInfo({ template: 'notes' })?.detailsPath).toBe('README.md');
    expect(toolInfo({ template: 'blank' })).toBeNull();
    expect(
      toolInfo({
        toolInfo: {
          name: 'Unsafe',
          relationship: 'x',
          detailsPath: '../secrets',
          upstream: 'javascript:alert(1)',
        },
      }),
    ).toBeNull();
  });
  it('finds original and dependency notices without mistaking executable source for a notice', () => {
    for (const path of [
      'TIGRANA-LICENSE',
      'MIT-LICENSE.txt',
      'runtime/THIRD_PARTY_NOTICES.txt',
      'licenses/Rack-LICENSE.md',
      'vendor/COPYING',
    ])
      expect(isToolNotice(path)).toBe(true);
    for (const path of ['license.js', 'src/LicenseDialog.ts', 'package.json', 'README.md'])
      expect(isToolNotice(path)).toBe(false);
  });
});
