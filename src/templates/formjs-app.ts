import type { TemplateDefinition } from './index';
import { LAYOUT_WORKSHOP } from './index';
// The form builder travels with the Crux: form-js (bpmn.io) as published with its
// license, the builder page, the Garden bridge, the edition script and notes. Text
// stays text so the Crux is portable.
const sources = import.meta.glob(
  [
    '../../formjs-crux/{index.html,style.css,builder.js,package.json,UPSTREAM.md,.cruxignore}',
    '../../formjs-crux/{garden,vendor,scripts}/**/*',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const template: TemplateDefinition = {
  files: [
    ...Object.entries(sources).map(([path, content]) => ({
      path: path.replace('../../formjs-crux/', ''),
      content,
    })),
    { path: 'data/project.json', content: JSON.stringify({ version: 1, app: 'formjs', project: null }) },
  ],
  layout: LAYOUT_WORKSHOP,
  meta: { settings: { entryFile: 'index.html' } },
  greeting:
    'Build a form: drag fields from the palette, set their labels and options on the right, name the form, and use Preview to try it. Share selected content publishes the form; answers arrive in this Crux’s Store.',
  context:
    'A form builder around the actual form-js (bpmn.io, 1.26.0, MIT with watermark clause, vendored under vendor/): the FormEditor for building, the Form viewer for previews and the public edition. The Crux keeps the form as plain data in data/project.json: a name and the form-js schema. App Tools inspect the form, name it, add a field (textfield, textarea, number, checkbox, checklist, radio, select, datetime, taglist, text, separator) and remove a field by key. Publishing renders dist/ with the viewer; each visitor submission is a Crux Store entry response:<time>-<id> (protected mode: the visitor and the author can read it). See UPSTREAM.md.',
};
export default template;
