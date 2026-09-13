import type { TemplateDefinition } from './index';
import { LAYOUT_WORKSHOP } from './index';
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
const template: TemplateDefinition = {
  files: [
    ...Object.entries(sources).map(([path, content]) => ({
      path: path.replace('../../eventcalendar-crux/', ''),
      content,
    })),
    {
      path: 'data/project.json',
      content: JSON.stringify({ version: 1, app: 'eventcalendar', project: null }),
    },
  ],
  layout: LAYOUT_WORKSHOP,
  meta: { settings: { entryFile: 'index.html' } },
  greeting:
    'Plan with the calendar: drag across days or hours to add an event, click one to edit it, drag it to move it, and switch between month, week, day and list. Garden saves every change.',
  context:
    'A calendar organizer around the actual EventCalendar component (vkurko/calendar 5.12.3, MIT, the published standalone bundle under vendor/): month, week, day and list views, drag-and-drop moving and resizing, range selection. The component has no event form or storage, so the Crux adds one form (title, all day, start, end, colour, notes) and keeps the calendar as plain data in data/project.json: events with local wall-clock times, the view and the date in view. App Tools inspect the calendar, name it, add an event and remove an event by id. See UPSTREAM.md.',
};
export default template;
