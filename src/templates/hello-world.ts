import homepage from './astro-homepage';
import type { TemplateDefinition } from './index';

/** The first project is the normal Astro starter, with private workspace guidance. */
const template: TemplateDefinition = {
  ...homepage,
  greeting: '',
  contentModel: {
    ...homepage.contentModel!,
    guide: {
      title: 'Your first home page',
      introduction:
        'Make a little place on the web that is yours. Start with this Astro home page, add your name and a photo, then share it when you are ready.',
    },
  },
};
export default template;
