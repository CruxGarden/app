/**
 * Agent connection scopes (ADR 0086). Pure and import-free: Electron main
 * enforces them on every garden tool call, and the renderer imports the same
 * table for its labels, presets and discovery filtering.
 *
 * A scope is a plain permission a person switches on per outside agent. Every
 * tool an outside agent can reach through the whole-garden Agent Host maps to
 * exactly one scope (or is refused outright). Wrapper tools (`call_garden_tool`,
 * `call_crux_tool`) are unwrapped and the tool inside them is what is checked.
 * In-app human approvals (publish, delete) still apply on top of a granted scope.
 */

export type AgentScope = 'read' | 'edit' | 'run' | 'publish' | 'settings';

export const AGENT_SCOPES: readonly AgentScope[] = ['read', 'edit', 'run', 'publish', 'settings'];

export const SCOPE_LABELS: Record<AgentScope, { label: string; detail: string }> = {
  read: {
    label: 'Read your garden',
    detail: 'See your Cruxes, open them, and read and search their files.',
  },
  edit: {
    label: 'Create and edit',
    detail: 'Make new Cruxes, change files, mark Growth versions and export.',
  },
  run: {
    label: 'Run collaborators and commands',
    detail:
      'Start a collaborator’s turn, make images, and run programs or services in a Crux. Can use your allowance.',
  },
  publish: {
    label: 'Share and publish',
    detail:
      'Publish and unpublish, invite people, see your plan’s usage. You still approve each publish.',
  },
  settings: {
    label: 'Garden settings',
    detail:
      'Wear Moods, rename the Garden, choose collaborators, install tools, edit Garden Memory.',
  },
};

/** The default for a new connection: look and make, but nothing that runs, shares or reconfigures. */
export const RECOMMENDED_SCOPES: readonly AgentScope[] = ['read', 'edit'];

export function isAgentScope(value: unknown): value is AgentScope {
  return typeof value === 'string' && (AGENT_SCOPES as readonly string[]).includes(value);
}

/** Known scopes only, deduplicated, in canonical order. */
export function normalizeScopes(values: unknown): AgentScope[] {
  if (!Array.isArray(values)) return [];
  return AGENT_SCOPES.filter((s) => values.includes(s));
}

// ── Classification ─────────────────────────────────────────────────────────

export type ToolLevel = 'garden' | 'crux';

export type ScopeVerdict =
  | { kind: 'scope'; scope: AgentScope; tool: string }
  | { kind: 'refuse'; tool: string; reason: string };

const GARDEN_SCOPES: Record<string, AgentScope> = {
  // discovery and looking
  list_garden_tools: 'read',
  list_crux_tools: 'read',
  list_cruxes: 'read',
  list_cruxspaces: 'read',
  read_crux: 'read',
  look: 'read',
  show: 'read',
  list_templates: 'read',
  list_moods: 'read',
  search_garden: 'read',
  read_garden_file: 'read',
  get_theme: 'read',
  get_synth: 'read',
  list_cue_presets: 'read',
  list_gardens: 'read',
  find_people: 'read',
  // making
  plant_crux: 'edit',
  create_cruxspace: 'edit',
  snapshot_crux: 'edit',
  export_crux: 'edit',
  export_cruxspace: 'edit',
  // running
  run_turn: 'run',
  // sharing
  publish_crux: 'publish',
  invite_person: 'publish',
  add_to_garden: 'publish',
  // the garden itself
  wear_mood: 'settings',
  set_names: 'settings',
  choose_collaborator: 'settings',
  install_tool: 'settings',
  set_theme: 'settings',
  set_background: 'settings',
  set_synth: 'settings',
  set_cue: 'settings',
};

/** Garden tools whose scope depends on the action they are asked to take. */
const GARDEN_ACTIONS: Record<string, { readActions: string[]; otherwise: AgentScope }> = {
  garden_collaboration: { readActions: ['inspect'], otherwise: 'run' },
  garden_navigation: { readActions: ['inspect'], otherwise: 'settings' },
  garden_graph: { readActions: ['inspect', 'parents', 'open'], otherwise: 'edit' },
  file_import: { readActions: ['inspect'], otherwise: 'edit' },
};

const CRUX_READ = new Set([
  'read_file',
  'list_files',
  'search_files',
  'list_snapshots',
  'diff',
  'get_theme',
  'get_synth',
  'list_cue_presets',
  'list_cruxspace_assets',
  'probe_media',
  'media_tools',
  'workspace_status',
  'link_status',
  'link_logs',
  'compose_ps',
  'compose_logs',
  'list_gdevelop_capabilities',
  'read_gdevelop_content',
  'load_skill',
  'report_progress',
  'check_site',
  'show',
]);

const CRUX_RUN = new Set([
  'generate_image',
  'run_ffmpeg',
  'run_magick',
  'run_pandoc',
  'make_pdf',
  'render_video',
  'compose_up',
  'compose_down',
  'compose_exec',
  'workspace_start',
  'workspace_stop',
  'link_start',
  'link_stop',
  'test_function',
  'browser',
  'delegate',
]);

const CRUX_PUBLISH = new Set(['publish', 'unpublish', 'get_usage']);
const CRUX_SETTINGS = new Set(['remember', 'install_media_tool']);
/** Garden reach must never be smuggled in through a Crux tool name. */
const CRUX_REFUSED = new Set([
  'list_garden_tools',
  'call_garden_tool',
  'list_crux_tools',
  'call_crux_tool',
  'answer_approval',
]);

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/** The scope one Crux tool needs. Unknown Crux tools (Crux Tool app tools) change work: edit. */
export function cruxToolScope(name: string): ScopeVerdict {
  if (CRUX_REFUSED.has(name))
    return { kind: 'refuse', tool: name, reason: 'That is not a Crux tool.' };
  if (CRUX_READ.has(name) || name.startsWith('inspect_') || name.endsWith('_history'))
    return { kind: 'scope', scope: 'read', tool: name };
  if (CRUX_RUN.has(name)) return { kind: 'scope', scope: 'run', tool: name };
  if (CRUX_PUBLISH.has(name)) return { kind: 'scope', scope: 'publish', tool: name };
  if (CRUX_SETTINGS.has(name)) return { kind: 'scope', scope: 'settings', tool: name };
  return { kind: 'scope', scope: 'edit', tool: name };
}

/** Whether the garden table names this tool (tests check every garden tool is classified on purpose). */
export function isClassifiedGardenTool(name: string): boolean {
  return name in GARDEN_SCOPES || name in GARDEN_ACTIONS;
}

/**
 * The scope a call needs, after unwrapping `call_garden_tool` and
 * `call_crux_tool`. Unknown garden tools need Garden settings: a new garden
 * operation is never reachable by a narrower connection by accident.
 */
export function classifyAgentCall(
  name: string,
  input: Record<string, unknown> = {},
  level: ToolLevel = 'garden',
  depth = 0,
): ScopeVerdict {
  if (depth > 2)
    return { kind: 'refuse', tool: name, reason: 'Nested tool calls are not allowed.' };
  if (level === 'crux') return cruxToolScope(name);
  if (name === 'answer_approval')
    return {
      kind: 'refuse',
      tool: name,
      reason: 'Only the person can answer an approval, in the app.',
    };
  if (name === 'call_garden_tool') {
    if (typeof input.name !== 'string' || input.name === 'call_garden_tool')
      return { kind: 'refuse', tool: name, reason: 'Name a garden tool from list_garden_tools.' };
    return classifyAgentCall(
      input.name,
      isObject(input.input) ? input.input : {},
      'garden',
      depth + 1,
    );
  }
  if (name === 'call_crux_tool') {
    if (typeof input.name !== 'string')
      return { kind: 'refuse', tool: name, reason: 'Name a Crux tool from list_crux_tools.' };
    return cruxToolScope(input.name);
  }
  const byAction = GARDEN_ACTIONS[name];
  if (byAction) {
    const action = typeof input.action === 'string' ? input.action : '';
    return {
      kind: 'scope',
      scope: byAction.readActions.includes(action) ? 'read' : byAction.otherwise,
      tool: name,
    };
  }
  return { kind: 'scope', scope: GARDEN_SCOPES[name] ?? 'settings', tool: name };
}

export type ScopeCheck = { allowed: true; scope: AgentScope } | { allowed: false; message: string };

/** Check one call against a connection's scopes, with the plain message an agent gets back. */
export function checkAgentCall(
  scopes: readonly AgentScope[],
  connectionName: string,
  name: string,
  input: Record<string, unknown> = {},
): ScopeCheck {
  const verdict = classifyAgentCall(name, input);
  if (verdict.kind === 'refuse')
    return { allowed: false, message: `Error: Not allowed — ${verdict.reason}` };
  if (scopes.includes(verdict.scope)) return { allowed: true, scope: verdict.scope };
  return {
    allowed: false,
    message:
      `Error: Not allowed — the connection “${connectionName}” does not have the ` +
      `“${SCOPE_LABELS[verdict.scope].label}” permission, which ${verdict.tool} needs. ` +
      'The person can turn it on in Crux Garden → Settings → Agents. Do not retry until they say so.',
  };
}

/**
 * Whether a tool belongs in this connection's discovery lists. Wrappers and
 * action-dependent tools show whenever reading is allowed; the call itself is
 * still checked.
 */
export function toolVisible(
  scopes: readonly AgentScope[],
  name: string,
  level: ToolLevel = 'garden',
): boolean {
  if (scopes.length === 0) return false;
  if (level === 'garden') {
    if (name === 'list_garden_tools' || name === 'call_garden_tool') return true;
    if (name === 'call_crux_tool' || name === 'list_crux_tools') return scopes.includes('read');
    if (name in GARDEN_ACTIONS) return scopes.includes('read');
  }
  const verdict = level === 'crux' ? cruxToolScope(name) : classifyAgentCall(name, {}, 'garden');
  return verdict.kind === 'scope' && scopes.includes(verdict.scope);
}

/** Filter a discovery result (a JSON array of tool definitions) to what this connection may call. */
export function filterDiscoveryText(
  scopes: readonly AgentScope[],
  text: string,
  level: ToolLevel,
): string {
  try {
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed)) return text;
    return JSON.stringify(
      parsed.filter(
        (tool) =>
          isObject(tool) && typeof tool.name === 'string' && toolVisible(scopes, tool.name, level),
      ),
    );
  } catch {
    return text;
  }
}

/** One plain sentence for an agent's instructions: what this connection may do. */
export function describeScopes(scopes: readonly AgentScope[]): string {
  if (scopes.length === 0) return 'This connection has no permissions.';
  const allowed = scopes.map((s) => SCOPE_LABELS[s].label.toLowerCase()).join(', ');
  const missing = AGENT_SCOPES.filter((s) => !scopes.includes(s)).map((s) =>
    SCOPE_LABELS[s].label.toLowerCase(),
  );
  return `This connection may: ${allowed}.${missing.length ? ` It may not: ${missing.join(', ')}.` : ''}`;
}
