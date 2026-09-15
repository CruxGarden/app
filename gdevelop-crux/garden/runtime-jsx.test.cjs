const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { build } = require('../GDJS/node_modules/esbuild');
const { JSDOM } = require('../newIDE/app/node_modules/jsdom');

test('native runtime JSX renders and dismisses debugger UI without a React global', async () => {
  // Use the same compiler and automatic tsconfig resolution as GDJS/scripts/build.js.
  const { outputFiles } = await build({
    absWorkingDir: path.join(__dirname, '../GDJS'),
    entryPoints: [path.join(__dirname, '../GDJS/Runtime/debugger-client/InGameDebugger.tsx')],
    minify: true,
    write: false,
  });
  const dom = new JSDOM('<main></main>');
  try {
    const container = dom.window.document.querySelector('main');
    const context = vm.createContext({
      document: dom.window.document,
      gdjs: { AbstractDebuggerClient: { isErrorComingFromJavaScriptCode: () => false } },
    });
    vm.runInContext(outputFiles[0].text, context);
    const debuggerUI = new context.gdjs.InGameDebugger({
      getRenderer: () => ({ getDomElementContainer: () => container }),
    });
    debuggerUI.setUncaughtException(new Error('Native runtime test error'));
    assert.match(container.textContent, /Native runtime test error/);
    container.querySelector('button').click();
    assert.equal(container.children.length, 0);
  } finally {
    dom.window.close();
  }
});
