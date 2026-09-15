import { expect, it } from 'vitest';
import { MOQIRA_TOOLS, moqiraCommand } from './moqira-tools';
import { embeddedAppToolAdapter } from '@/services/embedded-app-tool-adapters';
it('registers scoped Moqira tools with writes limited to its project and outputs', () => {
  const adapter = embeddedAppToolAdapter({ meta: { template: 'moqira' } });
  expect(adapter?.tools).toBe(MOQIRA_TOOLS);
  expect(MOQIRA_TOOLS).toHaveLength(18);
  expect(MOQIRA_TOOLS.find((tool) => tool.name === 'inspect_moqira')?.writes).toEqual([]);
  expect(MOQIRA_TOOLS.find((tool) => tool.name === 'update_moqira_components')?.writes).toEqual([
    'mockups/project.json',
  ]);
  expect(MOQIRA_TOOLS.find((tool) => tool.name === 'save_moqira_project')?.writes).toEqual([
    'outputs/*',
  ]);
});
it('rejects command injection, absent revision guards and malformed property batches before dispatch', () => {
  expect(moqiraCommand('inspect_moqira', {})).toEqual({ op: 'inspect' });
  expect(() => moqiraCommand('inspect_moqira', { op: 'delete-components' })).toThrow();
  expect(() => moqiraCommand('create_moqira_wireframe', { name: 'Landing' })).toThrow();
  expect(() =>
    moqiraCommand('update_moqira_components', {
      wireframeId: 'w',
      expectedState: 's',
      patches: [{ id: 'a', properties: { id: 'other' } }],
    }),
  ).toThrow();
  expect(() =>
    moqiraCommand('set_moqira_link', {
      wireframeId: 'w',
      id: 'a',
      key: 'whole',
      expectedState: 's',
      link: { kind: 'url', url: 'javascript:alert(1)' },
    }),
  ).toThrow();
});
