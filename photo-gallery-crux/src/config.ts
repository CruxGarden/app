// ────────────────────────────────────────────────────────────────────────────
//  Site configuration.
//
//  The values live in `src/config.json` so the Builder's settings form, any
//  editor and the collaborator can all change them without touching code.
//  Everything visitor-facing (titles, the brand, SEO, JSON-LD, llms.txt) is
//  derived from here.
// ────────────────────────────────────────────────────────────────────────────
import settings from './config.json';

export interface NavItem {
  label: string;
  href: string;
}

export const site = {
  name: settings.name,
  // Optional second-script name (e.g. a Chinese 中文名) shown under the brand.
  // Leave it '' to hide it everywhere.
  nameZh: '',
  title: settings.title || settings.name,
  description: settings.description,
  // The public address, once the gallery has one. Empty until then: links stay
  // relative and nothing claims a domain it does not have.
  url: settings.url ?? '',
};

// Left-hand navigation. "Digital" is the home page and shows by default.
export const nav: NavItem[] = [
  { label: 'Digital', href: '/' },
  { label: 'Analog', href: '/analog' },
  { label: 'Calendar', href: '/calendar' },
  { label: 'Journal', href: '/journal' },
  { label: 'About', href: '/about' },
  { label: 'Contact', href: '/contact' },
  { label: 'Licensing', href: '/license' },
];

// Social / external links shown in the sidebar and on the contact page. Replace
// the placeholders with your own. If you drop or add one, also update the
// matching <Icon> in Sidebar.astro and the list in Contact.astro.
export const social = {
  instagram: settings.social?.instagram ?? '',
  linkedin: settings.social?.linkedin ?? '',
  github: settings.social?.github ?? '',
};
