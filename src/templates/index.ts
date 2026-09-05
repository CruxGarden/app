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

/**
 * The product name of the interrogable-crux game (ADR 0016, WHO-AM-I-PLAN.md).
 * One constant: the template's label, default title and greeting read it; the
 * published site never does — each Shelf carries its own `question`.
 */
export const FIVE_WS_NAME = '5Ws';
export const FIVE_WS_TEMPLATE_ID = '5ws';
/** The picker blurb; with the name it is the site's default <title>. The headings are always the Shelf's own question. */
export const FIVE_WS_TAGLINE = 'Ten Questions. Five minutes. Good luck.';
export const FIVE_WS_SITE_TITLE = `${FIVE_WS_NAME} — ${FIVE_WS_TAGLINE}`;

// ── Form schema for data-driven templates ──

export type FormFieldType =
  | 'text'
  | 'textarea'
  | 'color'
  | 'image'
  | 'number'
  | 'select'
  | 'repeater';

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

// ── Content model (see TEMPLATE-CONTENT-MODEL.md) ──
// A template declares what the user MAKES inside it; the app renders generic
// friendly UI (the Builder — the Workshop's home view) from the declaration.
// Stored in crux.meta.contentModel at creation, so it travels with export,
// clone, and future Template Cruxes.

export interface ContentCollection {
  /** Plural display name — "Posts" */
  name: string;
  /** Singular — powers the "New Post" button */
  singular: string;
  /** Where items live — 'src/pages/posts/*.md' (single-star, one dir level) */
  glob: string;
  /** Preview route prefix — '/posts/' (item slug appended) */
  routeBase?: string;
  /** Frontmatter fields, rendered as a form above the body */
  fields: FormField[];
  /** New-item recipe. '{slug}', '{title}', '{today}' interpolate. */
  new: {
    pathTemplate: string;
    frontmatter: Record<string, string>;
    body?: string;
  };
  /** List ordering */
  sort?: { field: string; dir: 'asc' | 'desc' };
}

export interface BuilderAction {
  label: string;
  /** Emoji or short glyph shown on the button */
  icon?: string;
  do:
    | { type: 'new-item'; collection: string }
    | { type: 'edit-settings' }
    | { type: 'open-file'; path: string }
    | { type: 'add-image' }
    /** Upload audio/video into public/media/ (transcoding when needed) and write an item in `collection` */
    | { type: 'add-media'; collection: string }
    /** Upload images into public/images/ and write one item per image in `collection` (its `image` field) */
    | { type: 'add-photos'; collection: string }
    /** Append an entry to the Shelf at `path` through a form (ADR 0016) */
    | { type: 'add-shelf-entry'; path: string }
    /** Start a Round on this Interrogable Crux — opens the site's /play page in the preview (ADR 0016) */
    | { type: 'open-round' }
    | { type: 'publish' };
}

export interface ContentModel {
  collections: ContentCollection[];
  /** Site identity file (imported by the site's pages), edited as a form */
  settings?: { path: string; fields: FormField[] };
  /** Extra builder actions, merged after the derived ones */
  actions?: BuilderAction[];
}

export interface TemplateDefinition {
  files: TemplateFile[];
  /**
   * Skill (B6, ADR 0013) loaded automatically into every conversation in a
   * crux made from this template — the template's know-how, kept out of the
   * cached system prompt. Stamped on the crux as `meta.skills`.
   */
  skill?: string;
  /** Legacy: prose appended to the crux instructions at creation. Built-ins use `skill` instead. */
  context?: string;
  /** AI greeting message introducing the template and what's been set up */
  greeting: string;
  /** Optional form schema — when present, the workshop shows an editable form for config.json */
  schema?: FormSchema;
  /** Optional workspace layout — controls which panes open and their sizes */
  layout?: TemplateLayout;
  /**
   * Script-driven setup (desktop only): pnpm args run in the Project Folder
   * after `files` are written. This is how ecosystem templates scaffold, e.g.
   * `['dlx', 'create-astro@latest', '.', '--template', 'blog', '--no-install',
   * '--no-git', '--yes']` — the scaffold writes real files to disk and the
   * watcher/ingestion pipeline records them as artifacts automatically.
   */
  scaffold?: { pnpmArgs: string[] };
  /** What the user makes here — drives the Builder (Workshop home view) */
  contentModel?: ContentModel;
  /**
   * Extra crux meta stamped at creation (shallow-merged over the existing
   * meta, before the keys above). 5Ws uses it for `meta.game` —
   * `{ shelfPath }` — whose presence is what marks the crux interrogable to
   * the Builder (ADR 0016).
   */
  meta?: Record<string, unknown>;
}

// Lazy-load template files to keep the modal bundle small
// Starting afresh (ADR 0006): the old bundled library is retired. Built-ins
// are the Empty Crux (blank) plus real toolchain projects; the library of
// dozens/hundreds lives on crux.garden as clonable Template Cruxes, and
// ecosystem templates arrive via TemplateDefinition.scaffold scripts.
const loaders: Record<string, () => Promise<{ default: TemplateDefinition }>> = {
  'astro-homepage': () => import('./astro-homepage'),
  'astro-blog': () => import('./astro-blog'),
  'astro-feed': () => import('./astro-feed'),
  'astro-media': () => import('./astro-media'),
  'astro-empty': () => import('./astro-empty'),
  [FIVE_WS_TEMPLATE_ID]: () => import('./5ws'),
};

export async function loadTemplate(id: string): Promise<TemplateDefinition | null> {
  const loader = loaders[id];
  if (!loader) return null;
  const mod = await loader();
  return mod.default;
}

/**
 * Merge a template's declarations into a new crux's meta: greeting message,
 * workspace context appended to the system prompt, and the Builder inputs
 * (contentModel / formSchema).
 *
 * Pure so the stamping rules are testable — this ran behind a
 * `settings.systemPrompt` guard that new cruxes never satisfy, which silently
 * disabled every template's Builder view, config form, and AI context.
 */
export function applyTemplateMeta(
  existingMeta: Record<string, unknown> | undefined,
  def: TemplateDefinition,
  templateId?: string,
): Record<string, unknown> {
  const meta: Record<string, unknown> = { ...(existingMeta ?? {}), ...(def.meta ?? {}) };
  // Which template this crux grew from — AGENTS.md and (per ADR 0006) lineage read it
  if (templateId) meta.template = templateId;
  // The template's skill rides with the crux (export, clone, Template Cruxes)
  if (def.skill) meta.skills = [def.skill];
  const settings: Record<string, unknown> = {
    ...((meta.settings as Record<string, unknown> | undefined) ?? {}),
  };

  // The template's greeting replaces the persona greeting for this crux
  if (def.greeting) {
    meta.messages = [{ role: 'assistant', content: def.greeting }];
  }

  // Workspace context is instructions, appended to whatever is already there
  if (def.context) {
    const existing = typeof settings.systemPrompt === 'string' ? settings.systemPrompt.trim() : '';
    settings.systemPrompt = existing
      ? `${existing}\n\nCONTEXT: ${def.context}`
      : `CONTEXT: ${def.context}`;
  }
  meta.settings = settings;

  // Data-driven templates ship a form schema; content-model templates reuse
  // the same machinery for their settings file.
  if (def.schema) meta.formSchema = def.schema;
  if (def.contentModel) {
    meta.contentModel = def.contentModel;
    if (def.contentModel.settings && !def.schema) {
      meta.formSchema = { fields: def.contentModel.settings.fields };
    }
  }

  return meta;
}
