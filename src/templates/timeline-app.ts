import type { TemplateDefinition } from './index';
import { LAYOUT_WORKSHOP } from './index';
// TimelineJS travels with the Crux: the page, the editor, the starter, the bridge, the
// validator, notes, licences and upstream's stylesheets as text; its script, locales and
// icon font as published assets (stylesheets stay text so Vite leaves their font paths alone).
const sources = import.meta.glob(
  [
    '../../timeline-crux/{index.html,style.css,app.js,timeline.json,package.json,README.md,UPSTREAM.md}',
    '../../timeline-crux/{garden,licenses}/**/*',
    '../../timeline-crux/runtime/css/**/*.css',
    '!../../timeline-crux/**/node_modules/**',
    '!../../timeline-crux/**/*.test.*',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const runtime = import.meta.glob(
  ['../../timeline-crux/runtime/**/*', '!../../timeline-crux/runtime/css/**/*.css'],
  { query: '?url', import: 'default', eager: true },
) as Record<string, string>;
const template: TemplateDefinition = {
  files: [
    ...Object.entries(sources).map(([path, content]) => ({
      path: path.replace('../../timeline-crux/', ''),
      content,
    })),
    ...Object.entries(runtime).map(([path, content]) => ({
      path: path.replace('../../timeline-crux/', ''),
      content,
      encoding: 'asset-url' as const,
    })),
    { path: 'data/project.json', content: JSON.stringify({ version: 1, app: 'timeline', project: null }) },
  ],
  layout: LAYOUT_WORKSHOP,
  meta: { settings: { entryFile: 'index.html' } },
  greeting:
    'A storytelling timeline opens in TimelineJS: a garden year to start. Edit the events on the left (dates, text, a picture or a video, a group) and the timeline redraws as you type; Share selected content publishes it as a page people can scroll through. Ask me to add events, fill in dates and captions, or lay out a whole story.',
  context:
    'A timeline tool around TimelineJS (Knight Lab, 3.9, MPL-2.0; upstream’s build vendored unmodified in runtime/) with the smallest editor around it, since upstream has none. The timeline’s name and whole TimelineJS JSON live in data/project.json; the page saves after every change. App Tools: inspect_timeline, set_timeline_name, set_timeline (the whole JSON), upsert_events (add or replace by unique_id), remove_events. TimelineJS JSON: events[] with start_date {year, month, day}, optional end_date, text {headline, text (HTML allowed)}, media {url (an image, YouTube, Vimeo, a page…), caption, credit}, group (a lane), unique_id; an optional title slide; eras[] spans; scale cosmological for deep time. Read data/project.json before editing. Sharing publishes the page as it is: the timeline alone, the editor behind ?edit. See UPSTREAM.md.',
};
export default template;
