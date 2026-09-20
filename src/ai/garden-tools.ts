import type { ToolDefinition } from './tools';
import { getServices } from '@/services';
import {
  createCruxspace,
  getCruxspace,
  listCruxspaces,
  updateCruxspace,
} from '@/services/cruxspaces';
import { toolManifest } from '@/services/crux-tools/registry';

/**
 * The Keeper's tools (GARDENS-ALL-THE-WAY-OUT, step zero; MAKING-IT-POSSIBLE
 * step 6): the garden-level conversation can see the garden, plant a crux
 * with a brief, gather cruxes into a Cruxspace, run a turn in a member and
 * wait for it, and install a tool. The same operations the person has in the
 * hub, the picker, the Collaboration and Explore — as tools.
 */
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
    default:
      return { valid: false, error: `Unknown tool: ${name}` };
  }
}

const brief = (s: string) => (s.length > 2000 ? s.slice(0, 2000) + '…' : s);

export async function runGardenTool(name: string, input: Record<string, unknown>): Promise<string> {
  const v = validateGardenTool(name, input);
  if (!v.valid) return `Error: ${v.error}`;
  try {
    return await runGardenToolInner(name, input);
  } finally {
    // The garden changed under the person: the Home lists follow.
    if (name === 'plant_crux' || name === 'create_cruxspace' || name === 'install_tool') {
      const { useGardenStore } = await import('@/stores/gardenStore');
      void useGardenStore.getState().refresh();
    }
  }
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
  'When asked to build or make something, first load_skill("build-something") and follow it: ask, plan, plant, build, finish.';
