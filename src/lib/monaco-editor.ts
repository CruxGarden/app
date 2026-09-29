import Editor, { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker';
import JsonWorker from 'monaco-editor/language/json/json.worker.js?worker';
import CssWorker from 'monaco-editor/language/css/css.worker.js?worker';
import HtmlWorker from 'monaco-editor/language/html/html.worker.js?worker';
import TypeScriptWorker from 'monaco-editor/language/typescript/ts.worker.js?worker';

// The editor and its language workers travel with the app. The React wrapper's
// default CDN loader would otherwise ignore our pinned, audited package.
self.MonacoEnvironment = {
  getWorker(_moduleId, language) {
    if (language === 'json') return new JsonWorker();
    if (['css', 'scss', 'less'].includes(language)) return new CssWorker();
    if (['html', 'handlebars', 'razor'].includes(language)) return new HtmlWorker();
    if (['typescript', 'javascript'].includes(language)) return new TypeScriptWorker();
    return new EditorWorker();
  },
};
loader.config({ monaco });

export default Editor;
