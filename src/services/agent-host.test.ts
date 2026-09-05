import { describe, it, expect } from 'vitest';
import {
  HOST_TOOL_DEFINITIONS,
  agentActor,
  agentToolDefinitions,
  connectSnippets,
  serverKey,
} from './agent-host';
import { TOOL_DEFINITIONS } from '@/ai/tools';

/**
 * The pure surface of the Agent Host (ADR 0013). The forwarding path itself is
 * exercised end to end by electron/e2e/mcp.spec.ts against the real app.
 */
describe('agent tool surface', () => {
  it('offers every collaborator tool plus the product actions, with no duplicates', () => {
    const names = agentToolDefinitions().map((t) => t.name);
    for (const t of TOOL_DEFINITIONS) expect(names).toContain(t.name);
    expect(names).toEqual(expect.arrayContaining(['publish', 'unpublish', 'get_usage']));
    expect(new Set(names).size).toBe(names.length);
  });

  it('host tools take no input and say the person approves in the app', () => {
    for (const t of HOST_TOOL_DEFINITIONS) {
      expect(t.input_schema.type).toBe('object');
      expect(t.input_schema.required).toEqual([]);
    }
    expect(HOST_TOOL_DEFINITIONS.find((t) => t.name === 'publish')!.description).toMatch(
      /approve/i,
    );
  });

  it('stamps external agents as agent:<name>', () => {
    expect(agentActor('claude-code')).toBe('agent:claude-code');
  });
});

describe('connect snippets', () => {
  const server = {
    slug: 'my-blog',
    url: 'http://127.0.0.1:51234/mcp',
    token: 'tok_abc',
    stdioCommand: 'node /app/dist/mcp-stdio.js --config "/g/my-blog/.crux/mcp.json"',
  };

  it('names the server after the crux', () => {
    expect(serverKey('my-blog')).toBe('crux-my-blog');
  });

  it('gives Claude Code one command with the bearer header', () => {
    expect(connectSnippets(server).claudeCode).toBe(
      'claude mcp add --transport http crux-my-blog http://127.0.0.1:51234/mcp --header "Authorization: Bearer tok_abc"',
    );
  });

  it('gives Codex a TOML table and Cursor valid JSON', () => {
    const s = connectSnippets(server);
    expect(s.codex).toContain('[mcp_servers.crux-my-blog]');
    expect(s.codex).toContain(`url = "${server.url}"`);
    expect(s.codex).toContain('Authorization = "Bearer tok_abc"');
    const cursor = JSON.parse(s.cursor) as {
      mcpServers: Record<string, { url: string; headers: Record<string, string> }>;
    };
    expect(cursor.mcpServers['crux-my-blog']).toEqual({
      url: server.url,
      headers: { Authorization: 'Bearer tok_abc' },
    });
    expect(s.stdio).toBe(server.stdioCommand);
  });
});
