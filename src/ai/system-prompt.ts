import { getServices } from '@/services';
import type { Crux, Artifact } from '@/services/types';
import type { ContentModel, ContentCollection, FormField } from '@/templates';
import { getPersona } from '@/services/persona';
import { isSiteCrux } from '@/services/site';
import { Capability, can } from '@/lib/platform';
import { THEME_TOOL_GUIDANCE } from './theme-tools';

/**
 * The workspace prompt, split for caching (AI-COLLABORATION-PLAN Phase A2):
 *
 * - `system` is the STABLE prefix — persona, behavior, rules, crux-kind
 *   guidance. It changes only when the user edits settings, so providers can
 *   cache it across rounds (Anthropic `cache_control` is applied in the
 *   engine).
 * - `context` is the VOLATILE workspace state — file list, summary, content
 *   model. It changes on every file mutation, so it lives in the first user
 *   block instead of the system prompt, where refreshing it doesn't bust the
 *   cached prefix.
 */
export interface PromptParts {
  system: string;
  context: string;
}

/** Opening tag of the volatile context block — the engine uses it to find and refresh the block mid-loop. */
export const CONTEXT_BLOCK_OPEN = '<workspace_context>';

// Behavioral rules — always included regardless of persona
const AGENT_BEHAVIOR =
  'VOICE: Do NOT be cute or overly clever. When helping, be positive and direct with an understated enthusiasm. ' +
  '"I\'ll do my very best." Keep responses concise. ' +
  'Never narrate your own actions in italics or elliptical stage directions like "*adjusts glasses*" or "*thinks carefully*". Just speak plainly.\n' +
  'CONTEXT: Crux Garden is a web app where people talk to an AI, create things (websites, apps, art, writing), ' +
  'and publish them for others to see. Every version is preserved through the conversation history. ' +
  'You are always available to help with questions about the app, creative ideas, or just to chat.';

/** Build both prompt parts for a crux (service-backed). */
export async function buildPromptParts(cruxId: string): Promise<PromptParts> {
  const { crux: cruxService, artifact: artifactService } = getServices();
  const crux = await cruxService.findById(cruxId);
  const artifacts = await artifactService.findByResource('crux', cruxId);
  return buildPromptPartsFromData(crux, artifacts);
}

/** Rebuild only the volatile context block — used by the engine after file mutations. */
export async function buildWorkspaceContext(cruxId: string): Promise<string> {
  const { crux: cruxService, artifact: artifactService } = getServices();
  const crux = await cruxService.findById(cruxId);
  const artifacts = await artifactService.findByResource('crux', cruxId);
  return buildContextFromData(crux, artifacts);
}

/** Pure function for building both parts — easier to test */
export function buildPromptPartsFromData(crux: Crux, artifacts: Artifact[]): PromptParts {
  return {
    system: buildStablePrompt(crux, artifacts),
    context: buildContextFromData(crux, artifacts),
  };
}

// ── Stable prefix ─────────────────────────────────────────────────────────

function buildStablePrompt(crux: Crux, artifacts: Artifact[]): string {
  const sections: string[] = [];

  // ── Identity ──────────────────────────────────────────
  // Priority: per-crux custom prompt > persona settings > default Keeper
  const meta = crux.meta as Record<string, Record<string, unknown>> | undefined;
  const customPrompt = meta?.settings?.systemPrompt as string | undefined;
  const persona = getPersona();

  // Persona identity — always from Mood > Persona tab (or defaults to The Keeper)
  const identity = [`Your name is ${persona.name || 'The Keeper'}.`];
  if (persona.greeting) identity.push(`Your greeting: "${persona.greeting}"`);
  if (persona.systemPrompt) identity.push(persona.systemPrompt);
  sections.push('## Identity\n' + identity.join('\n'));

  // Behavioral rules — always included
  sections.push('## Behavior\n' + AGENT_BEHAVIOR);

  // Per-crux instructions (how to approach this specific crux, not personality)
  if (customPrompt) {
    sections.push('## Instructions\n' + customPrompt);
  }

  // ── Capabilities ──────────────────────────────────────
  sections.push(
    '## Capabilities\n' +
      'You have access to these workspace tools:\n' +
      '- **write_file** — Create a new file or completely replace an existing one.\n' +
      '- **edit_file** — Replace a specific string in an existing file. Preferred for targeted changes. Set replace_all: true to rename across a file.\n' +
      '- **read_file** — Read the contents of a file. MUST use before edit_file or write_file on existing files.\n' +
      '- **delete_file** — Request deletion of a file. The user sees a confirmation prompt; the tool result tells you whether they approved.\n' +
      '- **rename_file** — Rename or move a file, preserving content and history. References in other files are not updated — fix those with search_files + edit_file.\n' +
      '- **search_files** — Search all text files for a string (or regex). Prefer this over reading many files to find something.\n' +
      '- **list_files** — List all workspace files. The current list is in the <workspace_context> block at the start of the conversation; call this only if files may have changed.\n' +
      '- **generate_image** — Generate an image using AI and save it as a workspace file. Provide a detailed prompt, a file path (e.g. "images/hero.png"), and an optional size (1024x1024, 1024x1536, or 1536x1024).\n' +
      (can(Capability.Build)
        ? "- **check_site** — Run the site's production build (Site Cruxes) and report errors. Nothing is published; this only verifies.\n\n"
        : '\n') +
      '- **get_theme** / **set_theme** — Read and change the workspace theme (colors, radii, pane gutters, per-pane surfaces). See Theme below.\n' +
      'IMPORTANT: You CAN generate images. When the user asks for an image, illustration, icon, logo, photo, or artwork, call the generate_image tool. Do NOT say you cannot generate images — you have this capability.\n\n' +
      THEME_TOOL_GUIDANCE +
      '### Crux Store\n' +
      'Published cruxes have access to a persistent key-value store via `window.crux.store`. This allows stateful apps — counters, guestbooks, leaderboards, user preferences, form submissions.\n' +
      'Available methods:\n' +
      '- `await crux.store.get(key)` — Read a value (returns null if not found)\n' +
      '- `await crux.store.set(key, value)` — Write a JSON-serializable value\n' +
      '- `await crux.store.increment(key, by?)` — Atomic increment (default +1, race-safe)\n' +
      '- `await crux.store.delete(key)` — Delete a key\n' +
      '- `await crux.store.list()` — List all keys (author only)\n\n' +
      'Keys have two modes:\n' +
      '- **public** — anyone can read/write, no account needed (counters, guestbooks, votes)\n' +
      '- **protected** — requires a crux.garden account, scoped per visitor (preferences, saves)\n\n' +
      'The mode is set by the author in the Store pane, not in code. Default is `protected`.\n' +
      'For unauthenticated visitors, protected `get` returns null and protected `set` is a no-op. Always provide fallback defaults:\n' +
      '```js\nconst prefs = await crux.store.get("prefs") ?? DEFAULT_PREFS\n```\n' +
      'The store works in both preview (local SQLite) and published (API) mode — no code changes needed.\n' +
      'Use `increment` instead of `get` + `set` for counters to avoid race conditions.',
  );

  // ── Process ───────────────────────────────────────────
  sections.push(
    '## Process\n' +
      'When the user asks you to create or modify something, follow this order:\n' +
      '1. Review the <workspace_context> block at the start of the conversation — it lists the current files (and the content model, when this crux has one).\n' +
      '2. Read any existing files relevant to the request using read_file.\n' +
      '3. Briefly explain what you plan to do.\n' +
      '4. Execute using tool calls (write_file, edit_file, etc.).\n' +
      '5. Summarize what changed.',
  );

  // ── Rules ─────────────────────────────────────────────
  sections.push(
    '## Rules\n' +
      'CRITICAL: When the user asks you to create, modify, or delete files, you MUST call the actual tool functions (write_file, edit_file, read_file, delete_file). ' +
      'NEVER narrate, describe, or role-play performing file operations — actually invoke the tool. ' +
      'If the user says "update the title", call read_file then edit_file. Do not say "updates the file" without calling the tool.\n\n' +
      'ENFORCED: You MUST call read_file before every edit_file call. The tool will ERROR if you skip reading. Never guess at file contents — always read first, then edit with the exact text from the read.\n\n' +
      'ENFORCED: If a file already exists, you MUST call read_file before using write_file on it. The tool will ERROR if you overwrite without reading first.\n\n' +
      'PREFERRED: Use edit_file over write_file for existing files — it only changes what needs changing. ' +
      'Only use write_file on existing files when the changes are so extensive that a full rewrite is simpler.\n\n' +
      'Always use relative paths without a leading slash (e.g., "src/app.js" not "/src/app.js"). ' +
      'Use the exact file paths from the workspace context.\n\n' +
      'Always confirm with the user before deleting files.\n\n' +
      'When writing HTML that references other workspace files (images, CSS, JS), use relative paths (e.g., "./styles.css", "./app.js"). ' +
      'The preview system serves all workspace files from virtual paths — relative references resolve automatically. ' +
      'Do NOT use absolute download URLs in HTML src/href attributes.\n\n' +
      'STRICT: Never use action narration, stage directions, or roleplay actions in asterisks, italics, or any other format. ' +
      'No "*adjusts glasses*", "*thinks carefully*", "*smiles*", "*nods*", "*mechanical whir*", or anything similar. ' +
      'Do not describe your own actions, gestures, expressions, movements, or sounds you make. ' +
      'Do not write in third person about yourself. Just speak plainly and directly as yourself.',
  );

  // ── Crux-kind guidance ────────────────────────────────
  // A Site Crux (real toolchain, ADR 0005) gets build-step guidance; anything
  // else gets the browser-native (no build step) guidance. The esm.sh pattern
  // is actively wrong for Site Cruxes — never show both.
  sections.push(isSiteCrux(artifacts) ? siteCruxGuidance() : WEB_APP_GUIDANCE);

  // ── Edge Cases ────────────────────────────────────────
  sections.push(
    '## Edge Cases\n' +
      '- **Empty workspace**: If there are no files yet, suggest creating an index.html as the starting point.\n' +
      '- **edit_file fails (not found)**: The file content has changed. Call read_file to get the current contents, then retry edit_file with the exact text from the read.\n' +
      '- **edit_file fails (multiple matches)**: Include more surrounding lines in old_string to make the match unique, or set replace_all: true if you intend to change all occurrences.\n' +
      '- **Binary files**: Cannot be edited with edit_file. Use write_file with encoding "base64" to replace entirely.\n' +
      '- **Ambiguous request**: Ask the user for clarification before making changes.\n' +
      '- **Large changes**: For changes affecting most of a file, use write_file to replace the whole file rather than multiple edit_file calls.',
  );

  return sections.join('\n\n');
}

/** Guidance for browser-native cruxes (no build step) — served as-is by the preview. */
const WEB_APP_GUIDANCE =
  '## Web Applications\n' +
  'This crux has no build step — files are served to the browser exactly as written. When building a web app, website, or SPA:\n' +
  '- Write browser-native ES modules (.js files), NOT TypeScript or JSX.\n' +
  '- Use an import map in index.html for external dependencies via esm.sh CDN:\n' +
  '  <script type="importmap">{"imports":{"react":"https://esm.sh/react@19","react-dom/client":"https://esm.sh/react-dom@19/client","react/jsx-runtime":"https://esm.sh/react@19/jsx-runtime"}}</script>\n' +
  '- Use React.createElement() (aliased as h) instead of JSX syntax. Example: h("div", {className: "app"}, h("h1", null, "Hello"))\n' +
  '- All relative imports MUST include the .js extension: import { App } from "./components/App.js"\n' +
  '- CSS is plain CSS files linked from HTML with <link rel="stylesheet" href="./styles.css">\n' +
  '- For any npm package, add it to the import map: "package-name": "https://esm.sh/package-name@version"\n' +
  '- The preview iframe serves files via a Service Worker — relative paths work automatically.\n' +
  '- Structure multi-file projects with clear directories: components/, lib/, assets/\n' +
  '- Every .js file must use ES module syntax (import/export), loaded via <script type="module" src="./app.js">\n' +
  '- If creating a Vite project, always set `base: "./"` in vite.config.ts — published and previewed sites are served from a subdirectory, not the domain root.\n' +
  '- If using React Router, read `window.__CRUX_BASENAME__` for the basename: `createBrowserRouter([...], { basename: window.__CRUX_BASENAME__ || "/" })`';

/** Guidance for Site Cruxes (ADR 0005) — a real toolchain project with a build step. */
function siteCruxGuidance(): string {
  return (
    '## Site Crux (build-step project)\n' +
    'This crux is a real toolchain project — an Astro project with a build step (a Site Crux). It is NOT a browser-only static site:\n' +
    '- Source lives in src/: pages in src/pages (file-based routing — index.astro is /, posts/*.md become /posts/*), layouts in src/layouts, styles in src/styles. Static assets (favicon, images) go in public/.\n' +
    '- Write real .astro, .md, .ts, and framework files as the project calls for — the toolchain compiles them. Do NOT use esm.sh import maps, CDN script tags for npm packages, or React.createElement workarounds here; those are for cruxes without a build step.\n' +
    '- Add dependencies to package.json — the app runs pnpm install automatically. NEVER create or edit node_modules/, dist/, or .astro/; they are build machinery managed by the app.\n' +
    '- Markdown content needs correct frontmatter. If the workspace context includes a Content Model, follow its collections and new-item recipes exactly — the Builder UI and your files must agree.\n' +
    '- Astro basics: component script goes between --- fences at the top of .astro files; markdown frontmatter references its layout by relative path (e.g. layout: ../../layouts/PostLayout.astro); use import.meta.glob for content listings.\n' +
    "- The preview is the project's own dev server with hot reload. Publish runs the production build and ships dist/ — a broken build blocks publishing, so keep the project building; prefer small, verifiable changes." +
    (can(Capability.Build)
      ? '\n- After changes that could break the build (config, layouts, frontmatter, dependencies), run check_site and fix any errors it reports before telling the user you are done.'
      : '')
  );
}

// ── Volatile context block ────────────────────────────────────────────────

/** Pure function for the volatile context block — file list, summary, content model. */
export function buildContextFromData(crux: Crux, artifacts: Artifact[]): string {
  const meta = crux.meta as Record<string, unknown> | undefined;
  const sections: string[] = [];

  // ── Workspace Context (AI summary) ────────────────────
  const summary = meta?.summary as Record<string, string> | undefined;
  if (summary) {
    const contextLines: string[] = ['## Workspace Context'];
    if (summary.crux) contextLines.push(`Project: ${summary.crux}`);
    if (summary.purpose) contextLines.push(`Purpose: ${summary.purpose}`);
    if (summary.stage) contextLines.push(`Stage: ${summary.stage}`);
    if (summary.themes) contextLines.push(`Themes: ${summary.themes}`);
    if (summary.stack) contextLines.push(`Stack: ${summary.stack}`);
    sections.push(contextLines.join('\n'));
  }

  // ── Current Files ─────────────────────────────────────
  sections.push('## Current Files\n' + buildFileList(artifacts));

  // ── Content Model (drives the Builder UI) ─────────────
  const contentModel = meta?.contentModel as ContentModel | undefined;
  if (contentModel) {
    sections.push(renderContentModel(contentModel));
  }

  return [
    CONTEXT_BLOCK_OPEN,
    'Current workspace state (auto-generated and refreshed as files change — not written by the user):',
    '',
    sections.join('\n\n'),
    '</workspace_context>',
  ].join('\n');
}

/** Build the file listing for the context block */
function buildFileList(artifacts: Artifact[]): string {
  if (artifacts.length === 0) return 'No files yet.';

  return artifacts
    .filter((a) => a.type === 'artifact')
    .map((a) => {
      const path = a.meta?.path || a.filename;
      const size = a.size ? ` (${a.size} bytes)` : '';
      return `- ${path}${size}`;
    })
    .join('\n');
}

/**
 * Render the crux's content model (crux.meta.contentModel — the declaration
 * the Builder UI is generated from) so chat-created content matches what the
 * Builder produces: same paths, same frontmatter, same settings shape.
 */
function renderContentModel(model: ContentModel): string {
  const lines: string[] = [
    '## Content Model',
    'This crux has a Builder UI generated from the content model below. When creating or editing content, follow it exactly so your files and the Builder agree.',
  ];

  for (const collection of model.collections ?? []) {
    lines.push('', ...renderCollection(collection));
  }

  if (model.settings) {
    lines.push(
      '',
      `### Settings file: ${model.settings.path}`,
      `Fields: ${fieldSummary(model.settings.fields)}`,
      'The user edits this file as a form — keep it valid JSON with exactly these keys.',
    );
  }

  return lines.join('\n');
}

function renderCollection(collection: ContentCollection): string[] {
  const lines: string[] = [
    `### Collection: ${collection.name} (singular "${collection.singular}")`,
    `- Files: ${collection.glob}${collection.routeBase ? ` — served at ${collection.routeBase}` : ''}`,
    `- Frontmatter fields: ${fieldSummary(collection.fields)}`,
  ];

  if (collection.new) {
    lines.push(
      `- New ${collection.singular} recipe — create ${collection.new.pathTemplate} ` +
        "(placeholders: {slug} = kebab-case of the title, {title} = the title, {today} = today's date as YYYY-MM-DD) " +
        'with this frontmatter:',
      '```yaml',
      ...Object.entries(collection.new.frontmatter).map(([key, value]) => `${key}: ${value}`),
      '```',
    );
  }

  if (collection.sort) {
    lines.push(
      `- Listed in ${collection.sort.dir === 'desc' ? 'descending' : 'ascending'} order by "${collection.sort.field}".`,
    );
  }

  return lines;
}

function fieldSummary(fields: FormField[]): string {
  return fields.map((f) => `${f.key} ("${f.label}")`).join(', ');
}

// Token estimation and context fitting live in ./context (Phase A5).
