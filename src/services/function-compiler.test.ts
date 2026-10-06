import { expect, it } from 'vitest';
import { compileToCjs } from './function-compiler';
import cases from './function-compiler-cases.json';

// Same handler corpus as api/src/functions/compiler-cases.json.
it.each(cases)(
  '$name runs in the workspace execution environment',
  async ({ code, body, expected }) => {
    const module = { exports: {} as { default?: (req: unknown) => unknown } };
    new Function('module', 'exports', compileToCjs(code))(module, module.exports);
    expect(await module.exports.default!({ json: async () => body })).toEqual(expected);
  },
);
it.each([
  "import helper from './helper.js'; export default helper;",
  "export default async () => import('https://example.com/helper.js');",
])('refuses module imports in a handler', (code) => {
  expect(() => compileToCjs(code)).toThrow('Handler imports are not supported');
});
