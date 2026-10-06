import homepage from './astro-homepage';
import page from './hello-world.astro?raw';
import type { TemplateDefinition } from './index';

// Share the tested Astro toolchain and name/photo form, but start with one public
// page. Existing Cruxes are never rewritten when the bundled starter changes.
const projectFiles = new Set([
  'package.json',
  'pnpm-lock.yaml',
  'tsconfig.json',
  '.nvmrc',
  'LICENSE',
  '.cruxignore',
  'src/config.json',
]);
const template: TemplateDefinition = {
  greeting: '',
  layout: homepage.layout,
  context:
    'A single personal home page. Edit src/config.json using the form, or src/pages/index.astro for its design. No AI is required to edit, preview or share it.',
  contentModel: {
    collections: [],
    settings: {
      ...homepage.contentModel!.settings!,
      fields: homepage.contentModel!.settings!.fields.filter((field) => field.key !== 'url'),
    },
    guide: {
      title: 'Your first home page',
      introduction:
        'Make a little place on the web that is yours. Add your name and a photo, preview your page, then share it when you are ready.',
    },
  },
  files: [
    ...homepage.files.filter((file) => projectFiles.has(file.path)),
    { path: 'src/pages/index.astro', content: page },
    {
      path: 'astro.config.mjs',
      content:
        "import { defineConfig } from 'astro/config';\n// Set enabled to true here if you want Astro's developer toolbar.\nexport default defineConfig({ devToolbar: { enabled: false } });\n",
    },
    {
      path: 'README.md',
      content:
        '# My home page\n\nEdit your name, introduction and photo with the Crux Garden form. The whole public site is src/pages/index.astro; it reads src/config.json. Preview and Share need no AI.\n\nFor custom design, open Advanced and edit index.astro. Enable devToolbar in astro.config.mjs if you want Astro development tools. The tested Astro dependencies and original MIT license come from the Home Page starter; this page design is by Crux Garden.\n',
    },
  ],
};
export default template;
