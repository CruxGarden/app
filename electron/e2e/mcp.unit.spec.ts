import { test, expect } from '@playwright/test';

/** Pure Agent Host rules (compiled to dist/mcp-server.js by `npm run build`) — no Electron needed. */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mcp = require('../dist/mcp-server.js') as typeof import('../src/mcp-server');

test.describe('Agent Host request rules', () => {
  test('only loopback Host headers pass, with or without a port', () => {
    for (const ok of ['127.0.0.1', '127.0.0.1:5123', 'localhost', 'LOCALHOST:80', '[::1]:5123']) {
      expect(mcp.isLoopbackHost(ok), ok).toBe(true);
    }
    for (const bad of [
      undefined,
      '',
      'crux.garden',
      '127.0.0.1.evil.com',
      '10.0.0.5:5123',
      'localhost.evil.com',
    ]) {
      expect(mcp.isLoopbackHost(bad), String(bad)).toBe(false);
    }
  });

  test('only loopback peers pass', () => {
    expect(mcp.isLoopbackAddress('127.0.0.1')).toBe(true);
    expect(mcp.isLoopbackAddress('::1')).toBe(true);
    expect(mcp.isLoopbackAddress('::ffff:127.0.0.1')).toBe(true);
    expect(mcp.isLoopbackAddress('192.168.1.20')).toBe(false);
    expect(mcp.isLoopbackAddress(undefined)).toBe(false);
  });

  test('bearer parsing is strict and comparison is length-safe', () => {
    expect(mcp.bearerOf('Bearer abc')).toBe('abc');
    expect(mcp.bearerOf('bearer   abc  ')).toBe('abc');
    expect(mcp.bearerOf('Basic abc')).toBeNull();
    expect(mcp.bearerOf(undefined)).toBeNull();
    expect(mcp.bearerOf(['Bearer first', 'Bearer second'])).toBe('first');
    expect(mcp.tokensEqual('abc', 'abc')).toBe(true);
    expect(mcp.tokensEqual('abc', 'abd')).toBe(false);
    expect(mcp.tokensEqual('abc', 'abcd')).toBe(false);
  });

  test('tokens are long, URL-safe and unique; the config lives under .crux/', () => {
    const a = mcp.generateToken();
    const b = mcp.generateToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(40);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(mcp.mcpConfigPath('/g/blog')).toBe('/g/blog/.crux/mcp.json');
    expect(mcp.CRUX_RESOURCES.map((r) => r.uri)).toEqual([
      'crux://files',
      'crux://growth',
      'crux://preview',
      'crux://persona',
      'crux://agents-md',
    ]);
  });
});
