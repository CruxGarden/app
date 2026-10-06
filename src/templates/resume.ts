import type { TemplateDefinition } from './index';
import { LAYOUT_WRITING } from './index';
// The Resume template (ADR 0006's bundled starter set): astro-resume (MIT) as
// an Astro Site Crux. The whole resume is one Markdown file, so everything here
// travels as text; the favicon as bytes.
const sources = import.meta.glob(
  [
    '../../resume-crux/{astro.config.ts,package.json,pnpm-lock.yaml,tsconfig.json,README.md,UPSTREAM.md,.cruxignore,.nvmrc}',
    '../../resume-crux/{src,public}/**/*',
    '!../../resume-crux/**/node_modules/**',
    '!../../resume-crux/**/*.{png,jpg,jpeg,webp,avif,ico,woff,woff2}',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const binaries = import.meta.glob(
  [
    '../../resume-crux/{src,public}/**/*.{png,jpg,jpeg,webp,avif,ico,woff,woff2}',
    '!../../resume-crux/**/node_modules/**',
  ],
  { query: '?url', import: 'default', eager: true },
) as Record<string, string>;
const template: TemplateDefinition = {
  skill: 'resume',
  greeting:
    'Your resume is a single Markdown file — src/pages/index.md. Headings make the sections: your name and what you do at the top, then Work Experience, Projects, Education and Skills. Write over the prompts and it takes shape as you go. The button at the top right prints it, which is how you save a PDF. Share publishes it as a page you can link to.',
  layout: LAYOUT_WRITING,
  files: [
    ...Object.entries(sources).map(([path, content]) => ({
      path: path.replace('../../resume-crux/', ''),
      content,
    })),
    ...Object.entries(binaries).map(([path, content]) => ({
      path: path.replace('../../resume-crux/', ''),
      content,
      encoding: 'asset-url' as const,
    })),
  ],
};
export default template;
