import { NO_INPUT } from './app-tool-schema';
import { str as sharedStr, type ValidationResult } from './validation-result';
import { getPersona } from '@/services/persona';
import { getSqliteClient } from '@/services/sqlite/client';
import { useGardenContext, gardenPath, cruxPath } from '@/stores/gardenContext';
import type { ToolDefinition } from './tools';
import { getServices } from '@/services';
import {
  createCruxspace,
  getCruxspace,
  listCruxspaces,
  placeInGarden,
} from '@/services/cruxspaces';
import { toolManifest } from '@/services/crux-tools/registry';
import { DEFAULT_PANE_LABELS, PANE_TYPES } from '@/components/workspace/paneConfig';
import { DEFAULT_PANE_ORDER, GARDEN_PANE_ORDER, type PaneType } from '@/stores/uiStore';
import { pathOf } from '@/lib/artifact-path';

/**
 * The Keeper's tools (GARDENS-ALL-THE-WAY-OUT, step zero; MAKING-IT-POSSIBLE
 * step 6): the garden-level conversation can see the garden, plant a crux
 * with a brief, gather cruxes into a Cruxspace, run a turn in a member and
 * wait for it, and install a tool. The same operations the person has in the
 * hub, the picker, the Collaboration and Explore — as tools.
 */
const SHOW_WHAT = ['home', 'crux', 'pane', 'file', 'settings', 'explore'] as const;
const PANES = PANE_TYPES;

export const GARDEN_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'file_import',
    description:
      'Inspect a Crux’s deferred file import, or explicitly retry/dismiss an interrupted import using the same controls as the app. Inspect Workshop before retrying an unconfirmed import: the earlier attempt may already have created content. Never retry automatically. Opening Workshop delivers queued imports.',
    input_schema: {
      type: 'object',
      properties: {
        cruxId: { type: 'string' },
        action: { type: 'string', enum: ['inspect', 'retry', 'dismiss'] },
      },
      required: ['cruxId', 'action'],
      additionalProperties: false,
    },
  },
  {
    name: 'garden_collaboration',
    description:
      'Read or control a Garden’s private Collaboration using the same history and turn controls as its panel. Always pass the owner gardenId. Send starts a background turn; inspect reports its progress. Navigation never changes the owner. These conversations are private and are not published.',
    input_schema: {
      type: 'object',
      properties: {
        gardenId: { type: 'string' },
        action: {
          type: 'string',
          enum: ['inspect', 'new', 'send', 'stop', 'delete', 'model', 'retry-save'],
        },
        conversationId: { type: 'string' },
        message: { type: 'string' },
        model: { type: 'string' },
      },
      required: ['gardenId', 'action'],
      additionalProperties: false,
    },
  },
  {
    name: 'garden_navigation',
    description:
      'Inspect or change Navigator preferences using the same controls as the app. Garden view is portable author intent; inherit clears it. Personal choices/defaults belong to the current profile, never to the Garden. Actions: inspect, garden, choose, default, always, reset. Pass an explicit gardenId; always takes enabled and garden/choose/default take view.',
    input_schema: {
      type: 'object',
      properties: {
        gardenId: { type: 'string' },
        action: {
          type: 'string',
          enum: ['inspect', 'garden', 'choose', 'default', 'always', 'reset'],
        },
        view: { type: 'string', enum: ['tree', 'neighborhood', 'graph', 'inherit'] },
        enabled: { type: 'boolean' },
      },
      required: ['gardenId', 'action'],
      additionalProperties: false,
    },
  },
  {
    name: 'garden_graph',
    description:
      'Navigate the local Garden graph using the same controls as the app. Inspect returns the root or chosen Garden and its members. Create makes a child Garden. Parents returns the placement array for cruxId. Link plants an unplaced Crux; move requires expectedParents from inspection and moves it atomically. Unlink removes its placement without deleting content. Open changes the visible Garden. Pass gardenId explicitly for mutations.',
    input_schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['inspect', 'parents', 'create', 'link', 'move', 'unlink', 'open'],
        },
        gardenId: { type: 'string' },
        title: { type: 'string' },
        cruxId: { type: 'string' },
        expectedParents: { type: 'array', items: { type: 'string' } },
      },
      required: ['action'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_cruxes',
    description:
      'The cruxes in this garden: id, title, kind, template, when last updated, and the Garden each grows in. USE WHEN: deciding from what the garden already holds, or before run_turn / plant_crux.',
    input_schema: NO_INPUT,
  },
  {
    name: 'list_cruxspaces',
    description:
      'Gardens that hold Cruxes to work on (collections, formerly Cruxspaces): id, name, brief, member crux ids.',
    input_schema: NO_INPUT,
  },
  {
    name: 'create_cruxspace',
    description:
      'Grow a new Garden inside the active one with a shared brief, moving the chosen cruxes into it (an undertaking: a launch, a class, a project). With templateId, starts an undertaking there. Returns its id. USE WHEN: the person asks for a project that needs several cruxes.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        brief: {
          type: 'string',
          description: 'What the undertaking is for; every member reads it.',
        },
        templateId: {
          type: 'string',
          description:
            'Optional undertaking id from list_templates; imports its starter and worked example.',
        },
        exampleMode: {
          type: 'string',
          enum: ['beside', 'start'],
          description: 'Example beside the starter (default), or use the example as the start.',
        },
        cruxIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Existing member crux ids (optional).',
        },
      },
      required: ['name'],
      additionalProperties: false,
    },
  },
  {
    name: 'plant_crux',
    description:
      'Create a crux in this garden from a template, with a brief written into it (BRIEF.md and its instructions), optionally into a Garden. Returns the crux id. Templates: "blank", or a tool id such as "notes-app", "kan-app", "astro-homepage" — list_tools is not needed; unknown ids fail with the reason. USE WHEN: the person asks to make something new.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        gardenId: {
          type: 'string',
          description: 'Destination Garden identity. Omit for the local root.',
        },
        template: { type: 'string', description: 'Default "blank".' },
        brief: { type: 'string', description: 'What this crux is for and what to make first.' },
        cruxspaceId: {
          type: 'string',
          description: 'A Garden (from list_cruxspaces) to grow it in instead (optional).',
        },
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
      'Bring something into view so the person watches you work: the home garden, a crux (its workspace opens), a pane in the workspace in front (opened or closed; Tending, Mood, Settings and the Garden panes open anywhere), a file (opens in the Workshop), Settings, or Explore. The console closes so they can see. Name a crux by id or title.',
    input_schema: {
      type: 'object',
      properties: {
        what: {
          type: 'string',
          enum: ['home', 'crux', 'pane', 'file', 'settings', 'explore'],
        },
        cruxId: { type: 'string' },
        title: { type: 'string', description: 'A crux by title, when you have no id.' },
        pane: { type: 'string', enum: PANES },
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
      "Name the current Garden and its panes — the metaphor the person works inside (a title like 'Floyd County Police Department' renames the Garden; Collaboration as 'Interview room', Artifacts as 'Case files'). An empty pane name restores the usual word. Only when asked, or as part of building the garden they described.",
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
    description:
      'The built-in and saved Moods available in the active Garden: id, name, one line each.',
    input_schema: NO_INPUT,
  },
  {
    name: 'wear_mood',
    description:
      'Wear an available Mood by id (from list_moods) in the active Garden: it becomes that Garden’s own Mood, and child Gardens that follow it change too. Look, sound and persona change at once. Only when asked, or as part of the garden they described.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'look',
    description:
      "What the person is looking at right now: the page, the open crux, which panes are open, the file in the Workshop, a snapshot view, a running turn, approvals waiting, and the garden's names. Call it before show so you change only what needs changing.",
    input_schema: NO_INPUT,
  },
  {
    name: 'list_templates',
    description:
      'The templates plant_crux accepts: id, name, one line, and whether it needs the desktop app. Installed Crux Tools appear here too.',
    input_schema: NO_INPUT,
  },
  {
    name: 'choose_collaborator',
    description:
      "Choose which collaborator works in a crux: a model id (from the garden's providers) or 'claude-code' for the Agent Provider. The crux's Collaboration uses it from the next turn.",
    input_schema: {
      type: 'object',
      properties: {
        cruxId: { type: 'string' },
        title: { type: 'string' },
        model: { type: 'string' },
      },
      required: ['model'],
      additionalProperties: false,
    },
  },
  {
    name: 'answer_approval',
    description:
      "Answer an approval a crux's collaborator is waiting on (a tool the Agent Provider may not run on its own, a publish). look lists them with ids. Approve only what the person would; when unsure, ask them.",
    input_schema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The approval id from look; the oldest waiting if omitted.',
        },
        approved: { type: 'boolean' },
      },
      required: ['approved'],
      additionalProperties: false,
    },
  },
  {
    name: 'search_garden',
    description:
      'Search every crux in the garden for a string (or regex): file paths and matching lines, cited by crux. The garden is your context — read what it holds before deciding.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        regex: { type: 'boolean' },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'read_garden_file',
    description: 'Read one text file from any crux in the garden (by crux id or title, and path).',
    input_schema: {
      type: 'object',
      properties: {
        cruxId: { type: 'string' },
        title: { type: 'string' },
        path: { type: 'string' },
      },
      required: ['path'],
      additionalProperties: false,
    },
  },
  {
    name: 'export_crux',
    description:
      "Export a crux as a .crux archive — files, conversation and every snapshot — to the person's downloads. The complete history, in one file.",
    input_schema: {
      type: 'object',
      properties: {
        cruxId: { type: 'string' },
        title: { type: 'string' },
        runtime: {
          type: 'string',
          enum: ['reference', 'included'],
          description:
            'Desktop private backups always include tool files. In Web Mode, reference unchanged tool files or include them; omit to use the saved Web export preference.',
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'export_cruxspace',
    description:
      'Export a Garden as a .cruxspace package — every Crux in it with its history, the brief, and the Garden’s own Collaboration.',
    input_schema: {
      type: 'object',
      properties: {
        cruxspaceId: { type: 'string' },
        runtime: { type: 'string', enum: ['reference', 'included'] },
      },
      required: ['cruxspaceId'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_gardens',
    description:
      'The gardens with people that the person owns or belongs to, and invitations waiting on them — read from the API. A garden is a shared crux (the Garden template) whose Store holds its members.',
    input_schema: NO_INPUT,
  },
  {
    name: 'find_people',
    description:
      'The directory: people on the API by @username or name, for inviting into a garden.',
    input_schema: {
      type: 'object',
      properties: { q: { type: 'string' } },
      required: ['q'],
      additionalProperties: false,
    },
  },
  {
    name: 'invite_person',
    description:
      'Invite someone from the directory into a shared garden (a Garden crux the person owns or edits). They appear as invited until they accept on their Home.',
    input_schema: {
      type: 'object',
      properties: {
        gardenCruxId: { type: 'string' },
        username: { type: 'string' },
        role: { type: 'string', enum: ['member', 'editor'] },
      },
      required: ['gardenCruxId', 'username'],
      additionalProperties: false,
    },
  },
  {
    name: 'add_to_garden',
    description:
      "Put one of the person's shared cruxes on a garden's shelf so its members see it (the crux must be shared first).",
    input_schema: {
      type: 'object',
      properties: {
        gardenCruxId: { type: 'string' },
        cruxId: { type: 'string' },
        title: { type: 'string' },
      },
      required: ['gardenCruxId'],
      additionalProperties: false,
    },
  },
];

const GARDEN_TOOL_NAMES = new Set(GARDEN_TOOL_DEFINITIONS.map((t) => t.name));
export const isGardenTool = (name: string) => GARDEN_TOOL_NAMES.has(name);

const str = (v: unknown, max = 8000) => sharedStr(v, max);

export function validateGardenTool(name: string, input: Record<string, unknown>): ValidationResult {
  if (
    (name === 'export_crux' || name === 'export_cruxspace') &&
    input.runtime !== undefined &&
    !['reference', 'included'].includes(String(input.runtime))
  )
    return { valid: false, error: 'runtime must be reference or included' };
  switch (name) {
    case 'garden_collaboration':
      if (
        !str(input.gardenId, 80) ||
        !['inspect', 'new', 'send', 'stop', 'delete', 'model', 'retry-save'].includes(
          String(input.action),
        )
      )
        return { valid: false, error: 'gardenId and a Collaboration action are required' };
      if (input.action === 'send' && !str(input.message, 100000))
        return { valid: false, error: 'message is required' };
      if (input.action === 'delete' && !str(input.conversationId, 160))
        return { valid: false, error: 'conversationId is required' };
      if (input.action === 'model' && !str(input.model, 160))
        return { valid: false, error: 'model is required' };
      return { valid: true };
    case 'file_import':
      if (!str(input.cruxId, 80) || !['inspect', 'retry', 'dismiss'].includes(String(input.action)))
        return { valid: false, error: 'cruxId and an import action are required' };
      return { valid: true };
    case 'garden_navigation':
      if (
        !str(input.gardenId, 80) ||
        !['inspect', 'garden', 'choose', 'default', 'always', 'reset'].includes(
          String(input.action),
        )
      )
        return { valid: false, error: 'gardenId and a navigation action are required' };
      if (input.action === 'always' && typeof input.enabled !== 'boolean')
        return { valid: false, error: 'enabled is required' };
      if (
        ['garden', 'choose', 'default'].includes(String(input.action)) &&
        ![
          'tree',
          'neighborhood',
          'graph',
          ...(input.action === 'garden' ? ['inherit'] : []),
        ].includes(String(input.view))
      )
        return { valid: false, error: 'Choose a supported navigation view' };
      return { valid: true };
    case 'garden_graph':
      if (
        !['inspect', 'parents', 'create', 'link', 'move', 'unlink', 'open'].includes(
          String(input.action),
        )
      )
        return { valid: false, error: 'Choose a Garden action' };
      if (!['inspect', 'parents'].includes(String(input.action)) && !str(input.gardenId, 80))
        return { valid: false, error: 'gardenId is required' };
      if (input.action === 'create' && !str(input.title, 200))
        return { valid: false, error: 'title is required' };
      if (
        ['parents', 'link', 'move', 'unlink'].includes(String(input.action)) &&
        !str(input.cruxId, 80)
      )
        return { valid: false, error: 'cruxId is required' };
      if (
        input.action === 'move' &&
        (!Array.isArray(input.expectedParents) || input.expectedParents.some((id) => !str(id, 80)))
      )
        return { valid: false, error: 'Inspect parents and pass their ids as expectedParents' };
      return { valid: true };
    case 'list_cruxes':
    case 'list_cruxspaces':
      return { valid: true };
    case 'create_cruxspace':
      if (!str(input.name, 120)) return { valid: false, error: 'name is required (≤120 chars)' };
      if (input.templateId !== undefined) {
        if (!str(input.templateId, 80))
          return { valid: false, error: 'templateId must be an undertaking id' };
        if (input.cruxIds !== undefined || input.brief !== undefined)
          return { valid: false, error: 'A template supplies its own brief and members.' };
        if (
          input.exampleMode !== undefined &&
          !['beside', 'start'].includes(String(input.exampleMode))
        )
          return { valid: false, error: 'exampleMode must be beside or start' };
      } else if (!str(input.brief))
        return { valid: false, error: 'brief is required (≤8000 chars)' };
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
    case 'look':
    case 'list_templates':
      return { valid: true };
    case 'choose_collaborator':
      if (!str(input.cruxId, 80) && !str(input.title, 200))
        return { valid: false, error: 'give a cruxId or a title' };
      if (!str(input.model, 80)) return { valid: false, error: 'model is required' };
      return { valid: true };
    case 'answer_approval':
      if (typeof input.approved !== 'boolean')
        return { valid: false, error: 'approved must be true or false' };
      return { valid: true };
    case 'search_garden':
      if (!str(input.query, 400)) return { valid: false, error: 'query is required (≤400 chars)' };
      return { valid: true };
    case 'read_garden_file':
      if (!str(input.cruxId, 80) && !str(input.title, 200))
        return { valid: false, error: 'give a cruxId or a title' };
      if (!str(input.path, 400)) return { valid: false, error: 'path is required' };
      return { valid: true };
    case 'export_crux':
      if (!str(input.cruxId, 80) && !str(input.title, 200))
        return { valid: false, error: 'give a cruxId or a title' };
      return { valid: true };
    case 'export_cruxspace':
      if (!str(input.cruxspaceId, 80)) return { valid: false, error: 'cruxspaceId is required' };
      return { valid: true };
    case 'list_gardens':
      return { valid: true };
    case 'find_people':
      if (!str(input.q, 60)) return { valid: false, error: 'q is required' };
      return { valid: true };
    case 'invite_person':
      if (!str(input.gardenCruxId, 80)) return { valid: false, error: 'gardenCruxId is required' };
      if (!str(input.username, 60)) return { valid: false, error: 'username is required' };
      if (input.role !== undefined && input.role !== 'member' && input.role !== 'editor')
        return { valid: false, error: 'role is member or editor' };
      return { valid: true };
    case 'add_to_garden':
      if (!str(input.gardenCruxId, 80)) return { valid: false, error: 'gardenCruxId is required' };
      if (!str(input.cruxId, 80) && !str(input.title, 200))
        return { valid: false, error: 'give a cruxId or a title' };
      return { valid: true };
    default:
      return { valid: false, error: `Unknown tool: ${name}` };
  }
}

const brief = (s: string) => (s.length > 2000 ? s.slice(0, 2000) + '…' : s);

export async function runGardenTool(
  name: string,
  input: Record<string, unknown>,
  requestedBy = 'The Keeper',
): Promise<string> {
  const v = validateGardenTool(name, input);
  if (!v.valid) return `Error: ${v.error}`;
  try {
    const result = await runGardenToolInner(name, input, requestedBy);
    // The Keeper's actions leave a trail in the console (journeys read it too).
    console.info('[garden-tool]', name, result.slice(0, 200).replace(/\n/g, ' '));
    return result;
  } finally {
    // The garden changed under the person: the Home lists follow.
    if (
      name === 'garden_graph' ||
      name === 'plant_crux' ||
      name === 'create_cruxspace' ||
      name === 'install_tool'
    ) {
      const { useGardenStore } = await import('@/stores/gardenStore');
      void useGardenStore.getState().refresh();
    }
  }
}

/** A crux's workspace, loaded — its files and conversation in the store. */
async function loadedWorkspace(id: string) {
  const { openWorkspace } = await import('@/stores/workspaceRegistry');
  const w = await openWorkspace(id);
  await w.loaded;
  return w;
}

/** Hand a file to the person the way the Export pane does. */
function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
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
    const exact =
      all.find((c) => c.title === title) ??
      all.find((c) => (c.title ?? '').toLowerCase() === lower);
    if (exact) return exact;
    // A prefix is a convenience only while it names one Crux; several is a
    // question for the person, never a silent pick of whichever comes first.
    const prefixed = all.filter((c) => (c.title ?? '').toLowerCase().startsWith(lower));
    if (prefixed.length === 1) return prefixed[0]!;
    if (prefixed.length > 1) {
      const names = prefixed.map((c) => `"${c.title}"`).join(', ');
      throw new Error(
        `"${title}" matches several cruxes: ${names}. Give the exact title or the id.`,
      );
    }
  }
  throw new Error(`No crux ${id ? `with id ${id}` : `titled "${title}"`}. list_cruxes names them.`);
}

async function runGardenToolInner(
  name: string,
  input: Record<string, unknown>,
  requestedBy: string,
): Promise<string> {
  const services = getServices();
  switch (name) {
    case 'garden_collaboration': {
      const { keeperFor } = await import('@/stores/keeperStore');
      const store = keeperFor(input.gardenId as string);
      await store.getState().load();
      if (!store.getState().loaded) throw new Error(store.getState().error);
      const action = input.action as string;
      if (
        input.conversationId &&
        !store.getState().conversations.some((c) => c.id === input.conversationId)
      )
        throw new Error('That conversation does not belong to this Garden.');
      if (action === 'send') {
        if (store.getState().streaming)
          throw new Error('This Garden’s collaborator is already working.');
        if (input.conversationId) store.getState().setActive(input.conversationId as string);
        void store.getState().send(input.message as string);
      } else if (action === 'new') store.getState().newConversation();
      else if (action === 'stop') store.getState().stop();
      else if (action === 'delete') {
        if (store.getState().turnId === input.conversationId)
          throw new Error('Stop this conversation before deleting it.');
        store.getState().deleteConversation(input.conversationId as string);
      } else if (action === 'model') {
        if (store.getState().streaming)
          throw new Error('Wait for this turn before changing its model.');
        const { resolveModel, getModelInfo } = await import('@/ai/providers');
        const model = resolveModel(input.model as string);
        if (!getModelInfo(model)) throw new Error('Choose an available model.');
        store.getState().setModel(model);
      }
      if (['new', 'delete', 'model', 'retry-save'].includes(action)) await store.getState().flush();
      const state = store.getState();
      return JSON.stringify({
        gardenId: input.gardenId,
        activeId: state.activeId,
        model: state.model,
        streaming: state.streaming,
        turnId: state.turnId,
        streamContent: state.streamContent,
        error: state.error,
        saveError: state.saveError,
        conversations: input.conversationId
          ? state.conversations.filter((c) => c.id === input.conversationId)
          : state.conversations,
      });
    }
    case 'file_import': {
      const { readDeferredImport, retryDeferredImport, dismissDeferredImport } =
        await import('@/services/deferred-import');
      const ownerId = input.cruxId as string;
      await services.crux.findById(ownerId);
      if (input.action === 'retry') await retryDeferredImport(ownerId);
      if (input.action === 'dismiss') await dismissDeferredImport(ownerId);
      return JSON.stringify(readDeferredImport(ownerId));
    }
    case 'garden_navigation': {
      const { useAppStore } = await import('@/stores/appStore');
      const authorId = useAppStore.getState().author?.id;
      if (!authorId) throw new Error('Choose a profile before changing navigation.');
      const gardenId = input.gardenId as string;
      const owner = await services.crux.findById(gardenId);
      if (owner.kind !== 'garden' || owner.deleted) throw new Error('This Garden is unavailable.');
      const { readNavigationPreferences, saveGardenNavigation, saveUserNavigation } =
        await import('@/services/navigation-preferences');
      const view = input.view as 'tree' | 'neighborhood' | 'graph';
      if (input.action === 'garden')
        await saveGardenNavigation(gardenId, input.view === 'inherit' ? null : view);
      if (input.action === 'choose') await saveUserNavigation(authorId, { gardenId, view });
      if (input.action === 'default') await saveUserNavigation(authorId, { defaultView: view });
      if (input.action === 'always')
        await saveUserNavigation(authorId, { always: input.enabled as boolean });
      if (input.action === 'reset') await saveUserNavigation(authorId, { gardenId, view: null });
      return JSON.stringify(await readNavigationPreferences(authorId, gardenId));
    }
    case 'garden_graph': {
      const db = getSqliteClient();
      if (!db.enterLocalGarden || !db.gardenMembership)
        throw new Error('This connection does not support Garden navigation');
      if (input.action === 'parents')
        return JSON.stringify(await db.gardenMembership.parents(input.cruxId as string));
      const expectedParents = Array.isArray(input.expectedParents)
        ? ([...input.expectedParents] as string[])
        : [];
      const memberId = input.cruxId as string;
      const gardenId =
        typeof input.gardenId === 'string' ? input.gardenId : (await db.enterLocalGarden()).id;
      const garden = await services.crux.findById(gardenId);
      if (garden.kind !== 'garden' || garden.deleted) throw new Error('This Garden is unavailable');
      if (input.action === 'create')
        return JSON.stringify(
          await services.crux.create({ title: input.title as string, kind: 'garden', gardenId }),
        );
      if (input.action === 'move')
        return JSON.stringify(
          await db.gardenMembership.move({ gardenId, memberId, expectedParents }),
        );
      if (input.action === 'link')
        return JSON.stringify(
          await db.gardenMembership.add({ gardenId, memberId: input.cruxId as string }),
        );
      if (input.action === 'unlink')
        return JSON.stringify(await db.gardenMembership.remove(gardenId, input.cruxId as string));
      if (input.action === 'open') {
        const { navigateTo } = await import('@/lib/navigate');
        navigateTo(gardenPath(gardenId));
        return `Opened ${garden.title || 'Garden'}`;
      }
      const { gardenMembers } = await import('@/services/garden-navigation');
      return JSON.stringify({
        garden: { id: garden.id, title: garden.title },
        parents: await db.gardenMembership.parents(gardenId),
        members: (await gardenMembers(gardenId)).map(({ id, title, kind }) => ({
          id,
          title,
          kind,
        })),
      });
    }
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
          garden: spaces.find((s) => s.cruxIds.includes(c.id))?.name ?? null,
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
      if (input.templateId) {
        const { startCruxspaceTemplate } = await import('@/services/cruxspace-templates');
        const result = await startCruxspaceTemplate({
          templateId: input.templateId as string,
          name: input.name as string,
          exampleMode: input.exampleMode as 'beside' | 'start' | undefined,
        });
        return `Garden "${result.space.name}" grown.\nid: ${result.space.id}\nmembers: ${result.space.cruxIds.join(', ')}${result.exampleSpaceId ? `\nworked example Garden: ${result.exampleSpaceId}` : ''}`;
      }
      const space = await createCruxspace({
        name: input.name as string,
        brief: input.brief as string,
        cruxIds: (input.cruxIds as string[] | undefined) ?? [],
      });
      return `Garden "${space.name}" grown.\nid: ${space.id}\nmembers: ${space.cruxIds.length}`;
    }
    case 'plant_crux': {
      const creationPersona = getPersona();
      const requestedGarden =
        typeof input.gardenId === 'string' ? input.gardenId : useGardenContext.getState().root?.id;
      const { createCruxStore } = await import('@/stores/cruxStore');
      const { applyTemplateToCrux } = await import('@/services/crux-create');
      const template = (input.template as string | undefined) ?? 'blank';
      const manifest = template === 'blank' ? null : toolManifest(template);
      if (template !== 'blank' && !manifest && !(await templateExists(template)))
        return `Error: no template "${template}" in this garden. Use "blank", a tool id (e.g. "notes-app"), or install_tool first.`;
      const store = createCruxStore();
      let crux = await store
        .getState()
        .createCrux(input.title as string, requestedGarden, creationPersona);
      if (template !== 'blank') {
        const { templateCatalog } = await import('@/components/garden/NewCruxModal');
        const kind =
          manifest?.kind ?? templateCatalog().find((t) => t.id === template)?.kind ?? 'webapp';
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
      if (spaceId) await placeInGarden((await getCruxspace(spaceId)).id, crux.id);
      return `Planted "${crux.title}".\nid: ${crux.id}\ntemplate: ${template}${text ? '\nbrief: BRIEF.md' : ''}${spaceId ? `\ngarden: ${spaceId}` : ''}`;
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
        navigateTo('/home');
        return 'Showing the home garden.';
      }
      if (what === 'explore') {
        ui.setExploreOpen(true);
        return 'Showing Explore.';
      }
      if (what === 'settings') {
        ui.setSettingsOpen(true);
        return 'Showing Settings.';
      }
      if (what === 'pane') {
        // Every workspace has its own layout store (ADR 0018); the pane change
        // goes to the one the person is looking at — a Crux's or the Garden's.
        const { currentWorkspaceUI } = await import('@/stores/uiStore');
        const pane = input.pane as PaneType;
        const visible = input.visible !== false;
        const ui = currentWorkspaceUI().getState();
        const offered = ui.workspaceScope === 'garden' ? GARDEN_PANE_ORDER : DEFAULT_PANE_ORDER;
        if (!offered.includes(pane))
          return `The ${DEFAULT_PANE_LABELS[pane]} pane belongs to a Crux. show a crux first.`;
        ui.setPaneVisible(pane, visible);
        return `${visible ? 'Opened' : 'Closed'} the ${DEFAULT_PANE_LABELS[pane]} pane.`;
      }
      const crux = await resolveCrux(input);
      if (crux.kind === 'garden') {
        if (what !== 'crux') return 'Open a member Crux to show its files.';
        navigateTo(cruxPath(crux));
        return `Showing Garden "${crux.title}" (${crux.id}).`;
      }
      const { activateWorkspace } = await import('@/stores/workspaceRegistry');
      await activateWorkspace(crux.id);
      const w = await loadedWorkspace(crux.id);
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
      const w = await loadedWorkspace(crux.id);
      const st = w.data.getState();
      const meta = (crux.meta ?? {}) as Record<string, unknown>;
      const settings = (meta.settings ?? {}) as Record<string, unknown>;
      const files = st.artifacts.filter((a) => a.type === 'artifact').map((a) => pathOf(a));
      const briefFile = st.artifacts.find((a) => pathOf(a) === 'BRIEF.md');
      const briefText = briefFile
        ? await services.artifact
            .downloadBlob(briefFile)
            .then((b) => b.text())
            .catch(() => '')
        : '';
      const replies = st.messages.filter((m) => m.role === 'assistant').slice(-2);
      // The crux's backend: its functions, and — once shared — what the API's
      // clock says about the scheduled ones.
      const { functionFiles, listPublishedFunctions } = await import('@/services/crux-functions');
      let fns = functionFiles(st.artifacts);
      if (fns.length && meta.publishedAt)
        fns = await listPublishedFunctions(crux.id).catch(() => fns);
      const fnLine = fns.length
        ? `functions: ${fns
            .map(
              (f) =>
                `${f.name} (${f.kind === 'event' ? `on ${f.event}` : 'http'}${f.schedule ? `; ${f.schedule}` : ''}${f.nextRun ? `; next ${f.nextRun}` : ''}${f.lastStatus ? `; last ${f.lastStatus}` : ''})`,
            )
            .join(', ')}`
        : '';
      return [
        `"${crux.title}" (${crux.id})`,
        `kind: ${crux.kind ?? 'webapp'}; template: ${String(meta.template ?? 'blank')}`,
        `entry: ${String(settings.entryFile ?? 'index.html')}; shared: ${meta.publishedAt ? 'yes' : 'no'}`,
        `files (${files.length}): ${files.slice(0, 60).join(', ')}${files.length > 60 ? ', …' : ''}`,
        fnLine,
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
        { cruxId: crux.id, requestedBy },
      );
      return `"${crux.title}": ${out}`;
    }
    case 'set_names': {
      const { applyActiveMood, getThemeOverrides, setThemeOverrides } =
        await import('@/lib/moods/active');
      const changes: Record<string, string> = {};
      const said: string[] = [];
      const garden = useGardenContext.getState().garden;
      if (typeof input.title === 'string' && input.title.trim() && garden) {
        const { renameGarden } = await import('@/services/garden-navigation');
        await renameGarden(garden.id, input.title);
        said.push(`Garden "${input.title.trim()}"`);
      }
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
      for (const [k, v] of Object.entries(changes))
        said.push(`${k.replace(/^paneLabel/, '')} ${v ? `→ "${v}"` : 'back to its usual word'}`);
      return `Named: ${said.join('; ')}.`;
    }
    case 'list_moods': {
      const gardenId = useGardenContext.getState().garden?.id;
      const { BUNDLED_MOODS } = await import('@/lib/moods/bundled-moods');
      const { refreshInstalledMoods } = await import('@/lib/moods/packages');
      const saved = await refreshInstalledMoods(gardenId);
      const { readGardenMood } = await import('@/services/garden-mood');
      const current = await readGardenMood(gardenId).catch(() => null);
      const lines = [...BUNDLED_MOODS, ...saved].map((m) => `- ${m.id} — ${m.name}`);
      if (current)
        lines.unshift(
          `This Garden wears ${current.source.mode === 'own' ? current.name : 'the Default Mood'}` +
            (current.mode === 'inherit' && current.source.title
              ? `, from ${current.source.title}.`
              : '.'),
        );
      return lines.join('\n');
    }
    case 'wear_mood': {
      const owner = useGardenContext.getState().garden;
      const { bundledMood } = await import('@/lib/moods/bundled-moods');
      const { refreshInstalledMoods } = await import('@/lib/moods/packages');
      const { chooseMood } = await import('@/services/garden-mood');
      const pkg =
        bundledMood(input.id as string) ??
        (await refreshInstalledMoods(owner?.id)).find((mood) => mood.id === input.id);
      if (!pkg) return `No available Mood "${String(input.id)}". list_moods names them.`;
      if (useGardenContext.getState().garden !== owner)
        return 'The active Garden changed. Choose the Mood again.';
      await chooseMood(pkg);
      return `Now wearing "${pkg.name}".`;
    }
    case 'look': {
      const { useWorkspaceRegistry, getWorkspace } = await import('@/stores/workspaceRegistry');
      const { currentWorkspaceUI } = await import('@/stores/uiStore');
      const { customNames } = await import('@/lib/pane-labels');
      const path = location.pathname;
      const page =
        path === '/' || path === '/home'
          ? 'the home garden'
          : path.startsWith('/c/')
            ? 'a crux'
            : path.startsWith('/explore')
              ? 'Explore'
              : path;
      const lines = [`page: ${page}`];
      const names = customNames();
      if (names?.title) lines.push(`garden title: ${names.title}`);
      if (names && Object.keys(names.panes).length)
        lines.push(
          `pane names: ${Object.entries(names.panes)
            .map(([k, v]) => `${k} → "${v}"`)
            .join(', ')}`,
        );
      lines.push(
        `console: ${currentWorkspaceUI().getState().paneVisibility.console ? 'open' : 'closed'}`,
      );
      const active = useWorkspaceRegistry.getState().mru[0];
      const w = active ? getWorkspace(active) : null;
      if (w && page === 'a crux') {
        const st = w.data.getState();
        const ui = w.ui.getState();
        lines.push(`crux: "${st.crux?.title ?? active}" (${active})`);
        lines.push(
          `panes open: ${(Object.keys(ui.paneVisibility) as PaneType[])
            .filter((k) => ui.paneVisibility[k])
            .join(', ')}`,
        );
        const tab = ui.editor.tabs.find((t) => t.id === ui.editor.activeTabId);
        if (tab) lines.push(`file in the Workshop: ${tab.path}`);
        if (st.viewingSnapshotId)
          lines.push(`viewing snapshot ${st.viewingSnapshotId} (read-only)`);
        const { isJobActive } = await import('@/services/turn-jobs');
        if (isJobActive(st.turnJob)) lines.push('a turn is running in its Collaboration');
        lines.push(
          `collaborator: ${String(st.crux?.meta?.settings?.model ?? 'the default model')}`,
        );
      }
      const waiting: string[] = [];
      for (const e of useWorkspaceRegistry.getState().entries) {
        const ws = getWorkspace(e.id);
        for (const a of ws?.ui.getState().pendingAgentApprovals ?? [])
          waiting.push(
            `${a.id} — ${a.agent} in "${ws?.data.getState().crux?.title ?? e.id}" asks to ${a.action}${a.tool ? ` ${a.tool}` : ''}${a.detail ? `: ${a.detail.slice(0, 120)}` : ''}`,
          );
      }
      lines.push(
        waiting.length ? `approvals waiting:\n${waiting.join('\n')}` : 'no approvals waiting',
      );
      return lines.join('\n');
    }
    case 'list_templates': {
      const { templateCatalog } = await import('@/components/garden/NewCruxModal');
      const { cruxspaceTemplates } = await import('@/services/cruxspace-templates');
      return (
        templateCatalog()
          .map(
            (t) => `- ${t.id} — ${t.label}: ${t.description}${t.desktopOnly ? ' (desktop)' : ''}`,
          )
          .join('\n') +
        '\nUndertakings (create_cruxspace with templateId):\n' +
        cruxspaceTemplates.map((t) => `- ${t.id} — ${t.name}: ${t.description}`).join('\n')
      );
    }
    case 'choose_collaborator': {
      const crux = await resolveCrux(input);
      const { CLAUDE_CODE_MODEL, PROVIDERS } = await import('@/ai/providers');
      const model = (input.model as string).trim();
      const known =
        model === CLAUDE_CODE_MODEL ||
        Object.values(PROVIDERS).some((p) => p.models.some((m) => m.id === model));
      if (!known)
        return `Unknown model "${model}". Use 'claude-code' or one of: ${Object.values(PROVIDERS)
          .flatMap((p) => p.models.map((m) => m.id))
          .join(', ')}.`;
      const w = await loadedWorkspace(crux.id);
      w.data.getState().setModel(model);
      await w.data.getState().saveMeta();
      return `"${crux.title}" now works with ${model}.`;
    }
    case 'answer_approval': {
      const { useWorkspaceRegistry, getWorkspace } = await import('@/stores/workspaceRegistry');
      const wanted = typeof input.id === 'string' ? input.id : null;
      for (const e of useWorkspaceRegistry.getState().entries) {
        const ws = getWorkspace(e.id);
        if (!ws) continue;
        const list = ws.ui.getState().pendingAgentApprovals;
        const a = wanted ? list.find((x) => x.id === wanted) : list[0];
        if (!a) continue;
        ws.ui.getState().resolveAgentApproval(a.id, input.approved as boolean);
        return `${input.approved ? 'Approved' : 'Refused'} ${a.agent}'s ${a.action}${a.tool ? ` ${a.tool}` : ''} in "${ws.data.getState().crux?.title ?? e.id}".`;
      }
      return wanted ? `No approval ${wanted} is waiting.` : 'No approval is waiting.';
    }
    case 'search_garden': {
      const { toolSearchFiles } = await import('@/ai/tools');
      const cruxes = (await services.crux.listAll()).filter(
        (c) => c.kind !== 'snapshot' && c.kind !== 'tool',
      );
      const out: string[] = [];
      let budget = 12000;
      for (const c of cruxes) {
        const r = await toolSearchFiles(
          { query: input.query, regex: input.regex === true },
          c.id,
          services.artifact,
        );
        if (/^No matches/i.test(r) || r.startsWith('Error')) continue;
        const block = `## "${c.title}" (${c.id})\n${r}`;
        out.push(block.slice(0, budget));
        budget -= block.length;
        if (budget <= 0) {
          out.push('…more cruxes match; narrow the query.');
          break;
        }
      }
      return out.length
        ? out.join('\n\n')
        : `No matches for "${String(input.query)}" in the garden.`;
    }
    case 'read_garden_file': {
      const crux = await resolveCrux(input);
      const path = (input.path as string).replace(/^\//, '');
      const artifacts = await services.artifact.findByResource('crux', crux.id);
      const a = artifacts.find((x) => x.type === 'artifact' && pathOf(x) === path);
      if (!a) return `No file "${path}" in "${crux.title}".`;
      if (a.encoding === 'binary') return `"${path}" is binary (${a.mimeType ?? 'unknown type'}).`;
      const text = await (await services.artifact.downloadBlob(a)).text();
      return text.length > 20000 ? text.slice(0, 20000) + '\n…(truncated)' : text;
    }
    case 'export_crux': {
      const crux = await resolveCrux(input);
      const { exportCrux } = await import('@/services/crux-io');
      const { useAppStore } = await import('@/stores/appStore');
      const author = useAppStore.getState().author;
      const result = await exportCrux({
        cruxId: crux.id,
        runtime: input.runtime as 'reference' | 'included' | undefined,
        author: author ? { username: author.username, displayName: author.displayName } : null,
      });
      download(result.blob, result.filename);
      return `Exported "${crux.title}" as ${result.filename} to the person's downloads.`;
    }
    case 'export_cruxspace': {
      const { exportCruxspace } = await import('@/services/cruxspace-package');
      const result = await exportCruxspace({
        spaceId: input.cruxspaceId as string,
        runtime: input.runtime as 'reference' | 'included' | undefined,
      });
      download(result.blob, result.filename);
      return `Exported the Garden as ${result.filename} to the person's downloads (${result.manifest.members?.length ?? 0} members${result.failed.length ? `; could not include: ${result.failed.join(', ')}` : ''}).`;
    }
    case 'list_gardens': {
      const { can, Capability } = await import('@/lib/platform');
      if (!can(Capability.V2)) return 'Gardens with people are a v2 feature; not in this build.';
      const { myGardens } = await import('@/api/gardens');
      const list = await myGardens();
      if (!list.length)
        return 'No gardens yet. Plant one with the "garden" template, share it, and invite people.';
      return list
        .map(
          (g) =>
            `- "${g.title}" (${g.cruxId}) by @${g.authorUsername} — you are ${g.membership?.role ?? 'member'}${g.membership?.status === 'invited' ? ' (invited; not yet accepted)' : ''}`,
        )
        .join('\n');
    }
    case 'find_people': {
      const { searchAuthors } = await import('@/api/authors');
      const list = await searchAuthors(input.q as string);
      return list.length
        ? list
            .map(
              (a) =>
                `- @${a.username}${a.displayName && a.displayName !== a.username ? ` — ${a.displayName}` : ''} (${a.id})`,
            )
            .join('\n')
        : `Nobody matches "${String(input.q)}".`;
    }
    case 'invite_person': {
      const { searchAuthors } = await import('@/api/authors');
      const { inviteToGarden } = await import('@/api/gardens');
      const wanted = String(input.username).replace(/^@/, '').toLowerCase();
      const person = (await searchAuthors(wanted)).find((a) => a.username.toLowerCase() === wanted);
      if (!person) return `Nobody is called @${wanted}. find_people shows who there is.`;
      const m = await inviteToGarden(input.gardenCruxId as string, {
        authorId: person.id,
        username: person.username,
        displayName: person.displayName,
        role: (input.role as 'member' | 'editor') ?? 'member',
      });
      return `Invited @${m.username} as ${m.role}; ${m.status === 'active' ? 'they were already in' : 'they can accept on their Home'}.`;
    }
    case 'add_to_garden': {
      const crux = await resolveCrux(input);
      const meta = (crux.meta ?? {}) as Record<string, unknown>;
      if (!meta.publishedAt) return `"${crux.title}" is not shared yet; publish_crux first.`;
      const { publishBaseUrlFor } = await import('@/lib/public-url');
      const { shareIntoGarden } = await import('@/api/gardens');
      await shareIntoGarden(input.gardenCruxId as string, {
        cruxId: crux.id,
        title: crux.title ?? 'A crux',
        url: publishBaseUrlFor(crux.id),
      });
      return `"${crux.title}" is on the garden's shelf.`;
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
  'For an undertaking that needs several cruxes, create_cruxspace grows a Garden for it; then plant each member into that Garden. ' +
  'To have the work done, run_turn in a crux with a clear message; it waits and reports the reply. ' +
  'Say what you planted and where, by title, so the person can open it. ' +
  'When asked to build or make something, first load_skill("build-something") and follow it: ask, plan, plant, build, finish. ' +
  'You can operate the workspace in front of the person: look tells you what they see; show brings a crux, a pane, a file, the home garden, Settings or Explore into view (the console closes so they see it); read_crux tells you what a crux holds; snapshot_crux records a moment in its Growth; set_names and wear_mood shape the garden they described; choose_collaborator picks the model or the Agent Provider for a crux; answer_approval answers what a member is waiting on; export_crux and export_cruxspace hand the person the complete history as one file. ' +
  'The garden is your context: search_garden and read_garden_file before deciding, and cite the crux. list_templates names what plant_crux accepts. ' +
  'People: list_gardens shows the shared gardens the person belongs to; a new one is plant_crux with template "garden", then publish_crux; find_people searches the directory and invite_person invites (they accept on their Home); add_to_garden puts a shared crux on a garden\'s shelf. ' +
  'When asked to explain Crux Garden or show how it works, load_skill("tour") and do it by using it, one step at a time.';
