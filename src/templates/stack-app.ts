import type { ToolTemplateFiles } from './index';

/**
 * Stack: a set of services run on the person's machine with Docker Compose.
 *
 * `compose.yaml` is the stack and the only source the bench reads — the page
 * is built from it, so a Crux carrying any compose file describes itself.
 * It is seeded with the Crux Garden nursery from this project's CLI, and it
 * is an ordinary Artifact: Growth keeps every version, export carries it, and
 * publishing the Crux hands the whole setup to whoever installs it.
 *
 * Everything else about this tool — its name, greeting, provenance and the
 * collaborator's context — is `crux-tool.json` (ADR 0050).
 */
const sources = import.meta.glob(
  [
    '../../stack-crux/{index.html,style.css,app.js,compose.yaml,README.md,UPSTREAM.md}',
    '../../stack-crux/garden/*.js',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

const template: ToolTemplateFiles = {
  files: Object.entries(sources).map(([path, content]) => ({
    path: path.replace('../../stack-crux/', ''),
    content,
  })),
};
export default template;
