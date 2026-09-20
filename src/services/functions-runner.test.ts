import { describe, it, expect } from 'vitest';
import { compileToCjs, matches } from './functions-runner';
import { CLIENT_SOURCE, handlerSource } from './crux-functions';

/**
 * The local runner's pure parts: the ESM → CommonJS rewrite the API's runner
 * also does, event matching, and the crux.js client shipped into a crux.
 * The Worker itself runs in the desktop journey (electron/e2e/functions-local.spec.ts).
 */
describe('functions-runner', () => {
  it('rewrites a handler file to CommonJS the way the API does', () => {
    const cjs = compileToCjs(handlerSource({ event: 'ping', then: { kind: 'log' } }));
    expect(cjs).toContain('module.exports.default = async function');
    expect(cjs).not.toMatch(/^export /m);
    expect(
      compileToCjs(`export const match = 'store:*';\nexport default function (req, ctx) {}`),
    ).toBe(
      `const match = module.exports.match = 'store:*';\nmodule.exports.default = function (req, ctx) {}`,
    );
    const exports: Record<string, unknown> = {};
    new Function(
      'module',
      'exports',
      compileToCjs(`export const match = 'a*'; export default async () => 1;`),
    )({ exports }, exports);
    expect(exports.match).toBe('a*');
    expect(typeof exports.default).toBe('function');
  });

  it('matches names, prefixes and everything', () => {
    expect(matches('ping', 'ping')).toBe(true);
    expect(matches('ping', 'pong')).toBe(false);
    expect(matches('store:*', 'store:write')).toBe(true);
    expect(matches('*', 'anything')).toBe(true);
  });

  it('ships a client that steps aside for the published one and speaks the proxy protocol', () => {
    expect(CLIENT_SOURCE).toContain('if (window.crux && window.crux.fn) return;');
    for (const t of ['crux:fn:call', 'crux:fn:emit', 'crux:fn:on', 'crux:store:set', 'crux:ready'])
      expect(CLIENT_SOURCE).toContain(t);
    // Plain script: it parses as a function body.
    expect(() => new Function(CLIENT_SOURCE)).not.toThrow();
  });
});
