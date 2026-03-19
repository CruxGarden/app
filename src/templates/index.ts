/**
 * Crux templates — real starter files for each template type.
 *
 * Each template provides:
 * - `files`: Array of { path, content } to create as artifacts
 * - `context`: Description for the AI so it understands the starter structure
 * - `schema` (optional): Form field definitions for data-driven templates
 */

export interface TemplateFile {
  path: string;
  content: string;
}

// ── Form schema for data-driven templates ──

export type FormFieldType = 'text' | 'textarea' | 'color' | 'image' | 'number' | 'select' | 'repeater';

export interface FormFieldBase {
  key: string;
  label: string;
  type: FormFieldType;
  placeholder?: string;
}

export interface TextFormField extends FormFieldBase {
  type: 'text' | 'textarea' | 'color' | 'image' | 'number';
}

export interface SelectFormField extends FormFieldBase {
  type: 'select';
  options: { label: string; value: string }[];
}

export interface RepeaterFormField extends FormFieldBase {
  type: 'repeater';
  fields: FormField[];
}

export type FormField = TextFormField | SelectFormField | RepeaterFormField;

export interface FormSchema {
  fields: FormField[];
}

// ── Workspace layout presets ──
// Control which panes open and their split percentages when a template is created.
// splitPercentage = % of space given to the `first` child.

export interface TemplateMosaicBranch {
  direction: 'row' | 'column';
  first: string | TemplateMosaicBranch;
  second: string | TemplateMosaicBranch;
  splitPercentage: number;
}

export interface TemplateLayout {
  panes: string[];
  mosaic: TemplateMosaicBranch;
}

/** Workshop-heavy: form-driven or preview-focused (25% chat | 15% files | 60% workshop) */
export const LAYOUT_WORKSHOP: TemplateLayout = {
  panes: ['collaboration', 'artifacts', 'workshop'],
  mosaic: {
    direction: 'row',
    first: 'collaboration',
    second: { direction: 'row', first: 'artifacts', second: 'workshop', splitPercentage: 20 },
    splitPercentage: 25,
  },
};

/** Balanced: multi-file webapps (30% chat | 20% files | 50% workshop) */
export const LAYOUT_BALANCED: TemplateLayout = {
  panes: ['collaboration', 'artifacts', 'workshop'],
  mosaic: {
    direction: 'row',
    first: 'collaboration',
    second: { direction: 'row', first: 'artifacts', second: 'workshop', splitPercentage: 29 },
    splitPercentage: 30,
  },
};

/** Chat-heavy: AI writes most content (40% chat | 15% files | 45% workshop) */
export const LAYOUT_CHAT: TemplateLayout = {
  panes: ['collaboration', 'artifacts', 'workshop'],
  mosaic: {
    direction: 'row',
    first: 'collaboration',
    second: { direction: 'row', first: 'artifacts', second: 'workshop', splitPercentage: 25 },
    splitPercentage: 40,
  },
};

/** Writing: pure text collaboration, no file tree (45% chat | 55% workshop) */
export const LAYOUT_WRITING: TemplateLayout = {
  panes: ['collaboration', 'workshop'],
  mosaic: { direction: 'row', first: 'collaboration', second: 'workshop', splitPercentage: 45 },
};

/** Visual: photo/video uploads need prominent file tree (25% chat | 25% files | 50% workshop) */
export const LAYOUT_VISUAL: TemplateLayout = {
  panes: ['collaboration', 'artifacts', 'workshop'],
  mosaic: {
    direction: 'row',
    first: 'collaboration',
    second: { direction: 'row', first: 'artifacts', second: 'workshop', splitPercentage: 33 },
    splitPercentage: 25,
  },
};

export interface TemplateDefinition {
  files: TemplateFile[];
  context: string;
  /** AI greeting message introducing the template and what's been set up */
  greeting: string;
  /** Optional form schema — when present, the workshop shows an editable form for config.json */
  schema?: FormSchema;
  /** Optional workspace layout — controls which panes open and their sizes */
  layout?: TemplateLayout;
}

// Lazy-load template files to keep the modal bundle small
const loaders: Record<string, () => Promise<{ default: TemplateDefinition }>> = {
  blog: () => import('./blog'),
  story: () => import('./story'),
  zine: () => import('./zine'),
  album: () => import('./album'),
  portfolio: () => import('./portfolio'),
  journal: () => import('./journal'),
  homepage: () => import('./homepage'),
  business: () => import('./business'),
  resume: () => import('./resume'),
  links: () => import('./links'),
  event: () => import('./event'),
  tribute: () => import('./tribute'),
  classified: () => import('./classified'),
  product: () => import('./product'),
  recipes: () => import('./recipes'),
  menu: () => import('./menu'),
  tutorial: () => import('./tutorial'),
  slides: () => import('./slides'),
  game: () => import('./game'),
  video: () => import('./video'),
  social: () => import('./social'),
  ransom: () => import('./ransom'),
  conspiracy: () => import('./conspiracy'),
  fortune: () => import('./fortune'),
  wanted: () => import('./wanted'),
  geocities: () => import('./geocities'),
  petrock: () => import('./petrock'),
  board: () => import('./board'),
};

export async function loadTemplate(id: string): Promise<TemplateDefinition | null> {
  const loader = loaders[id];
  if (!loader) return null;
  const mod = await loader();
  return mod.default;
}
