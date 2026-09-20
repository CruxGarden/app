import { describe, it, expect } from 'vitest';
import { WORKSPACE_TOOL_DEFINITIONS, validateWorkspaceTool } from './workspace-tools';
import { defaultToolDefinitions } from './tools';
import { validateToolInput } from './validation';

describe("the crux collaborator's operating tools", () => {
  it('are offered to every workspace conversation', () => {
    const names = defaultToolDefinitions().map((t) => t.name);
    for (const t of WORKSPACE_TOOL_DEFINITIONS) expect(names).toContain(t.name);
  });
  it('validate what to show and which function to test', () => {
    expect(validateWorkspaceTool('show', { what: 'pane', pane: 'history' }).valid).toBe(true);
    expect(validateWorkspaceTool('show', { what: 'pane', pane: 'kitchen' }).valid).toBe(false);
    expect(validateWorkspaceTool('show', { what: 'file' }).valid).toBe(false);
    expect(validateWorkspaceTool('show', { what: 'file', path: 'index.html' }).valid).toBe(true);
    expect(validateWorkspaceTool('test_function', {}).valid).toBe(false);
    expect(validateWorkspaceTool('test_function', { name: 'hello' }).valid).toBe(true);
    expect(validateWorkspaceTool('test_function', { name: '../x' }).valid).toBe(false);
    expect(validateWorkspaceTool('test_function', { event: 'ping' }).valid).toBe(true);
    // The executor's validator knows them (an unknown tool is refused there).
    expect(validateToolInput('show', { what: 'pane', pane: 'history' }).valid).toBe(true);
    expect(validateToolInput('test_function', { event: 'ping' }).valid).toBe(true);
  });
});
