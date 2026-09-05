import { getServices } from '@/services';
import type { Crux, Artifact } from '@/services/types';
import { getPersona } from '@/services/persona';
import { isSiteCrux } from '@/services/site';
import { Capability, can } from '@/lib/platform';
import { renderWorkspaceGuide, syncAgentsMd } from '@/services/agents-md';
import { PLAN_PROMPT_LINE } from '@/services/turn-jobs';
import { VERIFY_PROMPT_LINE } from '@/services/verify';
import { renderMemoryForPrompt, syncMemoryFromDisk } from '@/services/memory';
import { renderSkillsIndex, renderLoadedSkills, skillsForCrux } from './skills';

// The content-model renderer lives with the AGENTS.md renderer (one source for
// both readers); re-exported so existing callers keep their import path.
export { renderContentModel } from '@/services/agents-md';

/**
 * The workspace prompt, split for caching (AI-COLLABORATION-PLAN Phase A2):
 *
 * - `system` is the STABLE prefix — persona, behavior, rules, garden memory,
 *   the skills index, crux-kind essentials. It changes only when the user
 *   edits settings (or something is remembered), so providers can cache it
 *   across rounds (Anthropic `cache_control` is applied in the engine).
 * - `context` is the VOLATILE workspace state — file list, summary, content
 *   model, the skills this crux loads automatically. It changes on every file
 *   mutation, so it lives in the first user block instead of the system
 *   prompt, where refreshing it doesn't bust the cached prefix.
 *
 * Know-how that only some conversations need (Astro details, template
 * specifics, composing a Mood, the soundscape, the Crux Store) lives in
 * skills (`./skills`, B6) — loaded on demand through `load_skill`, or
 * automatically for the crux's template — instead of in this prefix.
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
  // The Project Folder's AGENTS.md renders from the same data as the context
  // block below — bring it up to date (persona or instructions may have
  // changed since it was written). Fingerprint compare; no write when equal.
  await syncAgentsMd(crux, artifacts);
  // Garden Memory: adopt an outside edit of <Garden Root>/memory.md (desktop)
  // before it is read into the prefix. One file read; no-op on web.
  await syncMemoryFromDisk();
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

  // ── Garden Memory (B6) ────────────────────────────────
  // About the gardener, distinct from the persona above. Rarely changes, so it
  // belongs in the cached prefix; capped and truncated by whole lines.
  sections.push(renderMemoryForPrompt());

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
        ? "- **check_site** — Run the site's production build (Site Cruxes) and report errors. Nothing is published; this only verifies.\n"
        : '') +
      '- **get_theme** / **set_theme** / **set_background** — Read and change the workspace look (theme tokens, backdrop). Load the mood-design skill before restyling.\n' +
      '- **get_resonance** / **set_resonance** — Read, steer and compose the soundscape. Load the resonance skill before composing.\n' +
      '- **snapshot** / **list_snapshots** / **restore** / **branch** / **diff** — Growth, the version history, as tools. See Growth below.\n' +
      '- **remember** — Save one line to Garden Memory when the person asks you to remember something or states a durable preference (see above).\n' +
      '- **load_skill** — Load the know-how for one kind of work (see Skills below).\n' +
      'IMPORTANT: You CAN generate images. When the user asks for an image, illustration, icon, logo, photo, or artwork, call the generate_image tool. Do NOT say you cannot generate images — you have this capability.\n\n' +
      '### Theme and soundscape\n' +
      'Use set_theme mode "preview" to signal what you are doing (tint the pane you work in, warm the accent during a long step) and clear it with reset: true when done; mode "persist" only when the person asks for a lasting change. Never persist a change they did not ask for. ' +
      "Edits to the person's existing mixes are saved, so only make them when asked; a request for music or a vibe means composing a new mix.\n\n" +
      GROWTH_TOOL_GUIDANCE.trimEnd(),
  );

  // ── Skills index (B6) ─────────────────────────────────
  sections.push(renderSkillsIndex());

  // ── Process ───────────────────────────────────────────
  sections.push(
    '## Process\n' +
      'When the user asks you to create or modify something, follow this order:\n' +
      '1. Review the <workspace_context> block at the start of the conversation — it lists the current files (and the content model and skills, when this crux has them).\n' +
      '2. Read any existing files relevant to the request using read_file.\n' +
      '3. Briefly explain what you plan to do. ' +
      PLAN_PROMPT_LINE +
      ' ' +
      VERIFY_PROMPT_LINE +
      '\n' +
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
  // A Site Crux (real toolchain, ADR 0005) gets the build-step essentials —
  // the long form is the astro-basics skill in the context block; anything
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

/** How and when to use the Growth tools (B0). */
const GROWTH_TOOL_GUIDANCE =
  '### Growth (version history)\n' +
  'Every snapshot holds every file plus the conversation so far; the person sees them in the Growth timeline with your label and that you took them.\n' +
  '- Before a risky or multi-file change, call snapshot with a short label — a checkpoint you can come back to.\n' +
  '- If a check fails after your change (check_site errors, a broken preview) and going back beats fixing forward, call restore with that snapshot id. A safety snapshot of the current state is taken first, so nothing is lost.\n' +
  '- After finishing a coherent piece of work, snapshot again. The app also snapshots automatically after a turn that changed files, and skips its own when yours already captured the same files.\n' +
  '- Use diff to see what a restore would change, branch when the user wants to try another direction from an earlier version, list_snapshots for ids.\n' +
  '- Snapshots refer to files and the conversation, never to the theme or the soundscape.\n\n';

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
  '- If using React Router, read `window.__CRUX_BASENAME__` for the basename: `createBrowserRouter([...], { basename: window.__CRUX_BASENAME__ || "/" })`\n' +
  '- For stateful published apps (counters, guestbooks, saves) load the crux-store skill.';

/** Essentials for Site Cruxes (ADR 0005); the astro-basics skill in the context block has the rest. */
function siteCruxGuidance(): string {
  return (
    '## Site Crux (build-step project)\n' +
    'This crux is a real toolchain project — an Astro project with a build step (a Site Crux), NOT a browser-only static site. The astro-basics skill is loaded in your workspace context; follow it.\n' +
    '- Write real .astro, .md and .ts files under src/; add dependencies to package.json (the app installs them). Do NOT use esm.sh import maps or CDN workarounds here. Never create or edit node_modules/, dist/ or .astro/.\n' +
    '- A broken build blocks publishing — keep the project building; prefer small, verifiable changes.' +
    (can(Capability.Build)
      ? '\n- After changes that could break the build (config, layouts, frontmatter, dependencies), run check_site and fix any errors it reports before telling the user you are done.'
      : '')
  );
}

// ── Volatile context block ────────────────────────────────────────────────

/** Pure function for the volatile context block — file list, summary, content model, loaded skills. */
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

  // ── Workspace guide ───────────────────────────────────
  // The same sections the Project Folder's AGENTS.md carries (about, content
  // model + Builder actions, conventions, preview, hands-off, Growth), from
  // the one renderer — an external agent and the built-in collaborator read
  // identical guidance. Voice and Instructions are in the stable prefix.
  sections.push(
    '# Workspace guide (AGENTS.md)\n' +
      renderWorkspaceGuide({
        crux,
        artifacts,
        persona: getPersona(),
        canBuild: can(Capability.Build),
      }),
  );

  // ── Skills this crux loads automatically (B6) ─────────
  // The template's skill (a Blog crux never has to ask) and astro-basics for
  // any Site Crux. Everything else arrives through load_skill.
  const loaded = renderLoadedSkills(skillsForCrux(crux, artifacts));
  if (loaded) sections.push(loaded);

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

// Token estimation and context fitting live in ./context (Phase A5).
