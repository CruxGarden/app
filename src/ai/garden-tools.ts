import type { ToolDefinition } from './tools';
import { getServices } from '@/services';
import {
  createCruxspace,
  getCruxspace,
  listCruxspaces,
  updateCruxspace,
} from '@/services/cruxspaces';
import { toolManifest } from '@/services/crux-tools/registry';
import { DEFAULT_PANE_LABELS } from '@/lib/pane-labels';
import type { PaneType } from '@/stores/uiStore';
import { pathOf } from '@/lib/artifact-path';

/**
 * The Keeper's tools (GARDENS-ALL-THE-WAY-OUT, step zero; MAKING-IT-POSSIBLE
 * step 6): the garden-level conversation can see the garden, plant a crux
 * with a brief, gather cruxes into a Cruxspace, run a turn in a member and
 * wait for it, and install a tool. The same operations the person has in the
 * hub, the picker, the Collaboration and Explore — as tools.
 */
const SHOW_WHAT = ['home', 'crux', 'pane', 'file', 'settings', 'explore'] as const;
const PANES = Object.keys(DEFAULT_PANE_LABELS) as PaneType[];

export const GARDEN_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'list_cruxes',
    description:
      'The cruxes in this garden: id, title, kind, template, when last updated, and the Cruxspaces each belongs to. USE WHEN: deciding from what the garden already holds, or before run_turn / plant_crux.',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
  {
    name: 'list_cruxspaces',
    description: 'The Cruxspaces in this garden: id, name, brief, member crux ids.',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
  {
    name: 'create_cruxspace',
    description:
      'Gather cruxes into a Cruxspace with a shared brief (an undertaking: a launch, a class, a project). Returns its id. USE WHEN: the person asks for a project that needs several cruxes.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        brief: {
          type: 'string',
          description: 'What the undertaking is for; every member reads it.',
        },
        cruxIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Existing member crux ids (optional).',
        },
      },
      required: ['name', 'brief'],
      additionalProperties: false,
    },
  },
  {
    name: 'plant_crux',
    description:
      'Create a crux in this garden from a template, with a brief written into it (BRIEF.md and its instructions), optionally into a Cruxspace. Returns the crux id. Templates: "blank", or a tool id such as "notes-app", "kan-app", "astro-homepage" — list_tools is not needed; unknown ids fail with the reason. USE WHEN: the person asks to make something new.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        template: { type: 'string', description: 'Default "blank".' },
        brief: { type: 'string', description: 'What this crux is for and what to make first.' },
        cruxspaceId: { type: 'string', description: 'A Cruxspace to add it to (optional).' },
      },
      required: ['title'],
      additionalProperties: false,
    },
  },
  {
    name: 'run_turn',
    description:
      "Send a message to a crux's own collaborator and wait for its turn to finish; returns its reply and what changed. The turn runs with that crux's files, tools and history, and is recorded there. USE WHEN: delegating the work inside a crux you planted or found. Takes as long as the work takes.",
    input_schema: {
      type: 'object',
      properties: {
        cruxId: { type: 'string' },
        message: { type: 'string' },
      },
      required: ['cruxId', 'message'],
      additionalProperties: false,
    },
  },
  {
    name: 'publish_crux',
    description:
      "Share a crux at its public address (the person's account must be connected). Returns the address, or why it could not publish. USE WHEN: the work in a crux is done and the person asked for it to be published.",
    input_schema: {
      type: 'object',
      properties: { cruxId: { type: 'string' } },
      required: ['cruxId'],
      additionalProperties: false,
    },
  },
  {
    name: 'install_tool',
    description:
      'Install a Crux Tool into this garden so cruxes can be planted from it: from a crux already in the garden (cruxId) or from a published tool by address (username + slug, as on Explore).',
    input_schema: {
      type: 'object',
      properties: {
        cruxId: { type: 'string' },
        username: { type: 'string' },
        slug: { type: 'string' },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'show',
    description:
      'Bring something into view so the person watches you work: the home garden, a crux (its workspace opens), a pane in the open crux (opened or closed), a file (opens in the Workshop), Settings, or Explore. The console closes so they can see. Name a crux by id or title.',
    input_schema: {
      type: 'object',
      properties: {
        what: {
          type: 'string',
          enum: ['home', 'crux', 'pane', 'file', 'settings', 'explore'],
        },
        cruxId: { type: 'string' },
        title: { type: 'string', description: 'A crux by title, when you have no id.' },
        pane: {
          type: 'string',
          enum: [
            'tasks',
            'history',
            'collaboration',
            'artifacts',
            'workshop',
            'details',
            'sync',
            'publish',
            'export',
            'store',
            'media',
          ],
        },
        visible: { type: 'boolean', description: 'For a pane: open (default) or close.' },
        path: { type: 'string', description: 'For a file: its path in the crux.' },
      },
      required: ['what'],
      additionalProperties: false,
    },
  },
  {
    name: 'read_crux',
    description:
      'What a crux holds: title, template, files, the entry file, whether it is shared, its brief, and the last replies in its Collaboration. Use it before run_turn to know what exists, or to explain a crux to the person.',
    input_schema: {
      type: 'object',
      properties: { cruxId: { type: 'string' }, title: { type: 'string' } },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'snapshot_crux',
    description:
      'Record a Growth snapshot of a crux with a label — a moment the person can come back to. Take one before a run_turn that changes a lot, and when something is done.',
    input_schema: {
      type: 'object',
      properties: {
        cruxId: { type: 'string' },
        title: { type: 'string' },
        label: { type: 'string', description: 'What this moment is.' },
      },
      required: ['label'],
      additionalProperties: false,
    },
  },
  {
    name: 'set_names',
    description:
      "Name the garden and its panes — the metaphor the person works inside (a title like 'Floyd County Police Department'; Collaboration as 'Interview room', Artifacts as 'Case files'). An empty string clears a name. Only when asked, or as part of building the garden they described.",
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        panes: {
          type: 'object',
          description: 'pane type → name; empty string clears.',
          additionalProperties: { type: 'string' },
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'list_moods',
    description: 'The bundled Moods the garden can wear: id, name, one line each.',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
  {
    name: 'wear_mood',
    description:
      'Wear a bundled Mood by id (from list_moods): the look, sound and persona of the whole garden change at once. Only when asked, or as part of the garden they described.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
];

export const GARDEN_TOOL_NAMES = new Set(GARDEN_TOOL_DEFINITIONS.map((t) => t.name));
export const isGardenTool = (name: string) => GARDEN_TOOL_NAMES.has(name);

const str = (v: unknown, max = 8000) =>
  typeof v === 'string' && v.trim() && v.length <= max ? v.trim() : null;

export function validateGardenTool(
  name: string,
  input: Record<string, unknown>,
): { valid: boolean; error?: string } {
  switch (name) {
    case 'list_cruxes':
    case 'list_cruxspaces':
      return { valid: true };
    case 'create_cruxspace':
      if (!str(input.name, 120)) return { valid: false, error: 'name is required (≤120 chars)' };
      if (!str(input.brief)) return { valid: false, error: 'brief is required (≤8000 chars)' };
      if (input.cruxIds !== undefined && !Array.isArray(input.cruxIds))
        return { valid: false, error: 'cruxIds must be an array of ids' };
      return { valid: true };
    case 'plant_crux':
      if (!str(input.title, 200)) return { valid: false, error: 'title is required (≤200 chars)' };
      if (input.template !== undefined && !str(input.template, 80))
        return { valid: false, error: 'template must be a template id' };
      if (input.brief !== undefined && typeof input.brief !== 'string')
        return { valid: false, error: 'brief must be a string' };
      return { valid: true };
    case 'run_turn':
      if (!str(input.cruxId, 80)) return { valid: false, error: 'cruxId is required' };
      if (!str(input.message, 20000)) return { valid: false, error: 'message is required' };
      return { valid: true };
    case 'publish_crux':
      if (!str(input.cruxId, 80)) return { valid: false, error: 'cruxId is required' };
      return { valid: true };
    case 'install_tool':
      if (!str(input.cruxId, 80) && !(str(input.username, 80) && str(input.slug, 200)))
        return { valid: false, error: 'give a cruxId, or a username and slug' };
      return { valid: true };
    case 'show': {
      const what = str(input.what, 20);
      if (!what || !SHOW_WHAT.includes(what as (typeof SHOW_WHAT)[number]))
        return { valid: false, error: `what must be one of ${SHOW_WHAT.join(', ')}` };
      if ((what === 'crux' || what === 'file') && !str(input.cruxId, 80) && !str(input.title, 200))
        return { valid: false, error: 'give a cruxId or a title' };
      if (what === 'pane' && !PANES.includes(input.pane as PaneType))
        return { valid: false, error: `pane must be one of ${PANES.join(', ')}` };
      if (what === 'file' && !str(input.path, 400))
        return { valid: false, error: 'path is required for a file' };
      return { valid: true };
    }
    case 'read_crux':
      if (!str(input.cruxId, 80) && !str(input.title, 200))
        return { valid: false, error: 'give a cruxId or a title' };
      return { valid: true };
    case 'snapshot_crux':
      if (!str(input.cruxId, 80) && !str(input.title, 200))
        return { valid: false, error: 'give a cruxId or a title' };
      if (!str(input.label, 200)) return { valid: false, error: 'label is required (≤200 chars)' };
      return { valid: true };
    case 'set_names': {
      if (input.title !== undefined && (typeof input.title !== 'string' || input.title.length > 80))
        return { valid: false, error: 'title must be a string (≤80 chars)' };
      if (input.panes !== undefined) {
        if (!input.panes || typeof input.panes !== 'object' || Array.isArray(input.panes))
          return { valid: false, error: 'panes must be an object of pane → name' };
        for (const [k, v] of Object.entries(input.panes as Record<string, unknown>)) {
          if (!PANES.includes(k as PaneType)) return { valid: false, error: `unknown pane ${k}` };
          if (typeof v !== 'string' || v.length > 40)
            return { valid: false, error: `name for ${k} must be a string (≤40 chars)` };
        }
      }
      if (input.title === undefined && input.panes === undefined)
        return { valid: false, error: 'give a title, panes, or both' };
      return { valid: true };
    }
    case 'list_moods':
      return { valid: true };
    case 'wear_mood':
      if (!str(input.id, 80)) return { valid: false, error: 'id is required' };
      return { valid: true };
    default:
      return { valid: false, error: `Unknown tool: ${name}` };
  }
}

const brief = (s: string) => (s.length > 2000 ? s.slice(0, 2000) + '…' : s);

export async function runGardenTool(name: string, input: Record<string, unknown>): Promise<string> {
  const v = validateGardenTool(name, input);
  if (!v.valid) return `Error: ${v.error}`;
  try {
    const result = await runGardenToolInner(name, input);
    // The Keeper's actions leave a trail in the console (journeys read it too).
    console.info('[garden-tool]', name, result.slice(0, 200).replace(/\n/g, ' '));
    return result;
  } finally {
    // The garden changed under the person: the Home lists follow.
    if (name === 'plant_crux' || name === 'create_cruxspace' || name === 'install_tool') {
      const { useGardenStore } = await import('@/stores/gardenStore');
      void useGardenStore.getState().refresh();
    }
  }
}

/** A crux by id, or by title (exact, then case-insensitive, then prefix). */
async function resolveCrux(input: Record<string, unknown>) {
  const services = getServices();
  const id = typeof input.cruxId === 'string' ? input.cruxId.trim() : '';
  if (id) {
    const crux = await services.crux.findById(id).catch(() => null);
    if (crux) return crux;
  }
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (title) {
    const all = (await services.crux.listAll()).filter((c) => c.kind !== 'snapshot');
    const lower = title.toLowerCase();
    const found =
      all.find((c) => c.title === title) ??
      all.find((c) => (c.title ?? '').toLowerCase() === lower) ??
      all.find((c) => (c.title ?? '').toLowerCase().startsWith(lower));
    if (found) return found;
  }
  throw new Error(`No crux ${id ? `with id ${id}` : `titled "${title}"`}. list_cruxes names them.`);
}

async function runGardenToolInner(name: string, input: Record<string, unknown>): Promise<string> {
  const services = getServices();
  switch (name) {
    case 'list_cruxes': {
      const [cruxes, spaces] = await Promise.all([services.crux.listAll(), listCruxspaces()]);
      const rows = cruxes
        .filter((c) => c.kind !== 'snapshot' && c.kind !== 'tool')
        .map((c) => ({
          id: c.id,
          title: c.title,
          kind: c.kind ?? null,
          template: (c.meta as Record<string, unknown> | undefined)?.template ?? null,
          updated: c.updated,
          cruxspaces: spaces.filter((s) => s.cruxIds.includes(c.id)).map((s) => s.name),
        }));
      return JSON.stringify({ count: rows.length, cruxes: rows }, null, 1);
    }
    case 'list_cruxspaces': {
      const spaces = await listCruxspaces();
      return JSON.stringify(
        spaces.map((s) => ({ id: s.id, name: s.name, brief: brief(s.brief), cruxIds: s.cruxIds })),
        null,
        1,
      );
    }
    case 'create_cruxspace': {
      const space = await createCruxspace({
        name: input.name as string,
        brief: input.brief as string,
        cruxIds: (input.cruxIds as string[] | undefined) ?? [],
      });
      return `Cruxspace "${space.name}" created.\nid: ${space.id}\nmembers: ${space.cruxIds.length}`;
    }
    case 'plant_crux': {
      const { createCruxStore } = await import('@/stores/cruxStore');
      const { applyTemplateToCrux } = await import('@/services/crux-create');
      const template = (input.template as string | undefined) ?? 'blank';
      const manifest = template === 'blank' ? null : toolManifest(template);
      if (template !== 'blank' && !manifest && !(await templateExists(template)))
        return `Error: no template "${template}" in this garden. Use "blank", a tool id (e.g. "notes-app"), or install_tool first.`;
      const store = createCruxStore();
      let crux = await store.getState().createCrux(input.title as string);
      if (template !== 'blank') {
        const kind = (manifest?.kind ?? 'webapp') as Parameters<typeof applyTemplateToCrux>[2];
        crux = (await applyTemplateToCrux(crux, template, kind)).crux;
      }
      const text = (input.brief as string | undefined)?.trim();
      if (text) {
        await services.artifact.create({
          resourceId: crux.id,
          resourceType: 'crux',
          content: `# ${crux.title}\n\n${text}\n`,
          mimeType: 'text/markdown',
          meta: { path: 'BRIEF.md' },
        });
        const meta = { ...(crux.meta ?? {}) } as Record<string, unknown>;
        const settings = { ...((meta.settings as Record<string, unknown>) ?? {}) };
        settings.systemPrompt = text;
        meta.settings = settings;
        await services.crux.update(crux.id, { meta });
      }
      const spaceId = input.cruxspaceId as string | undefined;
      if (spaceId) {
        const s = await getCruxspace(spaceId);
        await updateCruxspace(spaceId, {
          name: s.name,
          brief: s.brief,
          cruxIds: [...s.cruxIds, crux.id],
        });
      }
      return `Planted "${crux.title}".\nid: ${crux.id}\ntemplate: ${template}${text ? '\nbrief: BRIEF.md' : ''}${spaceId ? `\ncruxspace: ${spaceId}` : ''}`;
    }
    case 'run_turn': {
      const { openWorkspace } = await import('@/stores/workspaceRegistry');
      const { turnsFor } = await import('@/services/turns');
      const { isJobActive } = await import('@/services/turn-jobs');
      const { activateWorkspace } = await import('@/stores/workspaceRegistry');
      const { navigateTo } = await import('@/lib/navigate');
      const { useUIStore } = await import('@/stores/uiStore');
      // The person watches the work where it happens: the member's own
      // Collaboration, with its job card (Stop, the plan) and composer — they
      // can stop the turn and take over; the Keeper reports what happened.
      const w =
        (await activateWorkspace(input.cruxId as string)) ??
        (await openWorkspace(input.cruxId as string));
      useUIStore.getState().setConsoleOpen(false);
      navigateTo(`/c/${input.cruxId as string}`);
      const turns = turnsFor(w.data);
      const before = w.data.getState().messages.length;
      await turns.submitTurn(input.message as string);
      await turns.drain();
      const s = w.data.getState();
      const replies = s.messages.slice(before).filter((m) => m.role === 'assistant');
      const last = replies.at(-1);
      const files = s.artifacts.length;
      const status = isJobActive(s.turnJob)
        ? 'still running'
        : s.turnJob?.status === 'interrupted'
          ? 'stopped by the person — they may be taking it from here; ask before continuing'
          : (s.turnJob?.status ?? 'done');
      return [
        `Turn in "${s.crux?.title ?? input.cruxId}" ${status}.`,
        last ? `Reply: ${brief(last.content)}` : 'No reply text.',
        last?.toolCalls?.length
          ? `Tools used: ${last.toolCalls.map((t) => t.name).join(', ')}`
          : '',
        `Artifacts now: ${files}.`,
      ]
        .filter(Boolean)
        .join('\n');
    }
    case 'show': {
      const { navigateTo } = await import('@/lib/navigate');
      const { useUIStore } = await import('@/stores/uiStore');
      const ui = useUIStore.getState();
      const what = input.what as (typeof SHOW_WHAT)[number];
      // The console closes so the person sees what you bring into view.
      ui.setConsoleOpen(false);
      if (what === 'home') {
        navigateTo('/');
        return 'Showing the home garden.';
      }
      if (what === 'explore') {
        navigateTo('/explore');
        return 'Showing Explore.';
      }
      if (what === 'settings') {
        ui.setSettingsOpen(true);
        return 'Showing Settings.';
      }
      if (what === 'pane') {
        // Every open workspace has its own layout store (ADR 0018); the pane
        // change goes to the workspace the person is looking at.
        const { useWorkspaceRegistry, openWorkspace } = await import('@/stores/workspaceRegistry');
        const active = useWorkspaceRegistry.getState().mru[0];
        if (!active || !/\/c\//.test(location.pathname))
          return 'No crux is open. show a crux first.';
        const pane = input.pane as PaneType;
        const visible = input.visible !== false;
        (await openWorkspace(active)).ui.getState().setPaneVisible(pane, visible);
        return `${visible ? 'Opened' : 'Closed'} the ${DEFAULT_PANE_LABELS[pane]} pane.`;
      }
      const crux = await resolveCrux(input);
      const { activateWorkspace, openWorkspace } = await import('@/stores/workspaceRegistry');
      const w = (await activateWorkspace(crux.id)) ?? (await openWorkspace(crux.id));
      navigateTo(`/c/${crux.id}`);
      if (what === 'crux') return `Showing "${crux.title}" (${crux.id}).`;
      const path = (input.path as string).replace(/^\//, '');
      const file = w.data.getState().artifacts.find((a) => pathOf(a) === path);
      if (!file) return `No file "${path}" in "${crux.title}".`;
      w.ui.getState().setPaneVisible('workshop', true);
      w.ui.getState().openFile(file.id, path);
      return `Showing ${path} in "${crux.title}".`;
    }
    case 'read_crux': {
      const crux = await resolveCrux(input);
      const { openWorkspace } = await import('@/stores/workspaceRegistry');
      const w = await openWorkspace(crux.id);
      const st = w.data.getState();
      const meta = (crux.meta ?? {}) as Record<string, unknown>;
      const settings = (meta.settings ?? {}) as Record<string, unknown>;
      const files = st.artifacts.filter((a) => a.type === 'artifact').map((a) => pathOf(a));
      const briefFile = st.artifacts.find((a) => pathOf(a) === 'BRIEF.md');
      const briefText = briefFile
        ? await services.artifact
            .downloadBlob(briefFile.id)
            .then((b) => b.text())
            .catch(() => '')
        : '';
      const replies = st.messages.filter((m) => m.role === 'assistant').slice(-2);
      return [
        `"${crux.title}" (${crux.id})`,
        `kind: ${crux.kind ?? 'webapp'}; template: ${String(meta.template ?? 'blank')}`,
        `entry: ${String(settings.entryFile ?? 'index.html')}; shared: ${meta.publishedAt ? 'yes' : 'no'}`,
        `files (${files.length}): ${files.slice(0, 60).join(', ')}${files.length > 60 ? ', …' : ''}`,
        briefText ? `brief: ${brief(briefText)}` : '',
        replies.length
          ? `last replies:\n${replies.map((m) => `- ${brief(m.content).slice(0, 600)}`).join('\n')}`
          : 'no conversation yet',
      ]
        .filter(Boolean)
        .join('\n');
    }
    case 'snapshot_crux': {
      const crux = await resolveCrux(input);
      const { runGrowthTool } = await import('@/ai/growth-tools');
      const out = await runGrowthTool(
        'snapshot',
        { label: input.label },
        { cruxId: crux.id, requestedBy: 'The Keeper' },
      );
      return `"${crux.title}": ${out}`;
    }
    case 'set_names': {
      const { applyActiveMood, getThemeOverrides, setThemeOverrides } =
        await import('@/lib/moods/active');
      const changes: Record<string, string> = {};
      if (typeof input.title === 'string') changes.gardenTitle = input.title.trim();
      for (const [pane, name] of Object.entries((input.panes ?? {}) as Record<string, string>))
        changes[`paneLabel${pane[0]!.toUpperCase()}${pane.slice(1)}`] = name.trim();
      for (const section of ['Dark', 'Light'] as const) {
        const next = { ...getThemeOverrides(section) };
        for (const [k, v] of Object.entries(changes)) {
          if (v) next[k] = v;
          else delete next[k];
        }
        setThemeOverrides(section, next);
      }
      applyActiveMood();
      const said = Object.entries(changes).map(([k, v]) =>
        k === 'gardenTitle'
          ? `title ${v ? `"${v}"` : 'cleared'}`
          : `${k.replace(/^paneLabel/, '')} ${v ? `→ "${v}"` : 'back to its usual word'}`,
      );
      return `Named: ${said.join('; ')}.`;
    }
    case 'list_moods': {
      const { BUNDLED_MOODS } = await import('@/lib/moods/bundled-moods');
      return BUNDLED_MOODS.map((m) => `- ${m.id} — ${m.name}`).join('\n');
    }
    case 'wear_mood': {
      const { bundledMood } = await import('@/lib/moods/bundled-moods');
      const { applyMood } = await import('@/lib/moods/packages');
      const pkg = bundledMood(input.id as string);
      if (!pkg) return `No bundled Mood "${String(input.id)}". list_moods names them.`;
      await applyMood(pkg);
      return `Now wearing "${pkg.name}".`;
    }
    case 'publish_crux': {
      const { openWorkspace } = await import('@/stores/workspaceRegistry');
      const { publicCruxUrl } = await import('@/lib/public-url');
      const { useAppStore } = await import('@/stores/appStore');
      const w = await openWorkspace(input.cruxId as string);
      const ok = await w.data.getState().publishCrux();
      const s = w.data.getState();
      const username = useAppStore.getState().author?.username;
      if (!ok || !s.crux)
        return `Error: "${s.crux?.title ?? input.cruxId}" did not publish — ${(s.publishFailure as { message?: string } | null)?.message ?? 'connect your account in Settings first'}.`;
      return `Published "${s.crux.title}"${username ? ` at ${publicCruxUrl(username, s.crux.slug)}` : ''}.`;
    }
    case 'install_tool': {
      const installed = await import('@/services/crux-tools/installed');
      if (input.cruxId) {
        const t = await installed.installToolFromCrux(input.cruxId as string);
        return t
          ? `Installed "${t.id}" from crux ${t.cruxId}.`
          : 'Error: that crux is not a Crux Tool this app knows.';
      }
      const { publicApi } = await import('@/api');
      const { putBlob } = await import('@/services/blobs');
      const crux = await publicApi.getCruxBySlug(input.username as string, input.slug as string);
      const t = await installed.installToolFromPublished(crux as never, {
        apiArtifacts: publicApi.getArtifacts as never,
        apiDownload: publicApi.downloadArtifact as never,
        putBlob,
      });
      return `Installed "${t.id}" from @${input.username}/${input.slug}. Plant from it with plant_crux({ template: "${t.id}" }).`;
    }
    default:
      return `Error: Unknown tool: ${name}`;
  }
}

async function templateExists(id: string): Promise<boolean> {
  try {
    const { loadTemplate } = await import('@/templates');
    return !!(await loadTemplate(id));
  } catch {
    return false;
  }
}

/** Prompt guidance for the Keeper, beside the theme guidance. */
export const GARDEN_TOOL_GUIDANCE =
  '### The garden\n' +
  'You tend the whole garden, not one crux. To see what it holds, list_cruxes and list_cruxspaces. ' +
  'To make something new, plant_crux with a title, a template and a brief — the brief is what the crux is for and what to make first. ' +
  'For an undertaking that needs several cruxes, create_cruxspace, then plant each member into it. ' +
  'To have the work done, run_turn in a crux with a clear message; it waits and reports the reply. ' +
  'Say what you planted and where, by title, so the person can open it. ' +
  'When asked to build or make something, first load_skill("build-something") and follow it: ask, plan, plant, build, finish. ' +
  'You can operate the workspace in front of the person: show brings a crux, a pane, a file, the home garden, Settings or Explore into view (the console closes so they see it); read_crux tells you what a crux holds; snapshot_crux records a moment in its Growth; set_names and wear_mood shape the garden they described. ' +
  'When asked to explain Crux Garden or show how it works, load_skill("tour") and do it by using it, one step at a time.';
