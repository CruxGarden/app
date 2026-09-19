import type { ToolTemplateFiles } from './index';
// The calendar organizer travels with the Crux: the EventCalendar standalone bundle
// (MIT) as published with its license and option reference, the organizer page and
// form, the Garden bridge and notes. Text stays text so the Crux is portable.
const sources = import.meta.glob(
  [
    '../../eventcalendar-crux/{index.html,style.css,organizer.js,package.json,UPSTREAM.md,.cruxignore}',
    '../../eventcalendar-crux/{garden,vendor}/**/*',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const template: ToolTemplateFiles = {
  files: [
    ...Object.entries(sources).map(([path, content]) => ({
      path: path.replace('../../eventcalendar-crux/', ''),
      content,
    })),
  ],
};
export default template;
