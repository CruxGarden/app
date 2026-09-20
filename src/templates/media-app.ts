import type { ToolTemplateFiles } from './index';

/**
 * Media Tools (MAKING-THE-AD-PARITY gap 13, the full form): a bench over the
 * real FFmpeg and ImageMagick, run as programs inside the crux's Project
 * Folder through the shell's audited seam. The binaries are resolved per
 * platform (`electron/src/media-binaries.ts`); the page is the interface.
 * Everything else about this tool — its name, greeting, drop routes,
 * provenance and the collaborator's context — is `crux-tool.json` (ADR 0050).
 */
const sources = import.meta.glob(
  [
    '../../media-crux/{index.html,style.css,app.js,README.md,UPSTREAM.md}',
    '../../media-crux/garden/*.js',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

const template: ToolTemplateFiles = {
  files: [
    ...Object.entries(sources).map(([path, content]) => ({
      path: path.replace('../../media-crux/', ''),
      content,
    })),
    { path: 'log.md', content: '# Runs\n\nWhat this bench has done, newest last.\n' },
  ],
};
export default template;
