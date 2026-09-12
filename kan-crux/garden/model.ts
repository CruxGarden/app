import { z } from 'zod';
import { stripHtml } from '../packages/shared/src/utils/sanitize';
import { nanoid } from 'nanoid';
import { boardDetailSchema, boardListItemSchema } from '../packages/api/src/schemas/board';
import { cardDetailSchema, activityItemSchema } from '../packages/api/src/schemas/card';
import { allPermissions } from '../packages/shared/src/permissions';
import { localUser } from './auth';
const id = z.string().length(12);
const name = z.string().min(1).max(100);
const title = z.string().min(1).max(2000);
const publicId = () => nanoid(12);
const workspace = {
  publicId: 'localspace01',
  name: 'Local workspace',
  slug: 'local',
  description: null,
  plan: 'free',
  weekStartDay: 1,
  cardPrefix: 'KAN',
  members: [
    { publicId: 'localmember1', email: localUser.email, status: 'active', user: localUser },
  ],
};
type Board = z.infer<typeof boardDetailSchema> & {
  type: 'regular' | 'template';
  deletedAt: Date | null;
};
type List = Board['lists'][number];
const attachmentSchema = z.object({
  publicId: id,
  name: z.string().min(1).max(1000),
  type: z.string().max(200),
  size: z.number().int().min(0).max(64000000),
  lastModified: z.number().finite(),
});
type Attachment = z.infer<typeof attachmentSchema>;
type Card = Omit<List['cards'][number], 'attachments'> & {
  attachments: Attachment[];
  activities: z.infer<typeof activityItemSchema>[];
};
export type Original = { bytes: Uint8Array; type: string };
const originals = new Map<string, Original>();
const urls = new Map<string, string>();
let pendingAttachments = 0;
const listeners = new Set<() => void>();
export const onModelChange = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const changed = () => listeners.forEach((listener) => listener());
export const attachmentBusy = () => pendingAttachments > 0;
function attachmentView(value: Attachment) {
  const original = requireValue(originals.get(value.publicId));
  let url = urls.get(value.publicId);
  if (!url) {
    url = URL.createObjectURL(new Blob([original.bytes.slice().buffer], { type: original.type }));
    urls.set(value.publicId, url);
  }
  return {
    publicId: value.publicId,
    contentType: value.type,
    s3Key: value.publicId,
    originalFilename: value.name,
    size: value.size,
    url,
  };
}
export async function uploadAttachment(cardPublicId: string, file: File) {
  id.parse(cardPublicId);
  getCard(cardPublicId);
  if (file.size > 64000000) throw new Error('Attachments are limited to 64 MB each');
  pendingAttachments++;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { card } = getCard(cardPublicId);
    const metadata = attachmentSchema.parse({
      publicId: publicId(),
      name: file.name,
      type: file.type || 'application/octet-stream',
      size: bytes.byteLength,
      lastModified: file.lastModified,
    });
    originals.set(metadata.publicId, { bytes, type: metadata.type });
    card.attachments.push(metadata);
    activity(card, 'card.updated.attachment.added', {
      attachment: {
        publicId: metadata.publicId,
        filename: metadata.name,
        originalFilename: metadata.name,
      },
    });
    changed();
    return metadata;
  } finally {
    pendingAttachments--;
  }
}

const boards: Board[] = [];
let cardNumber = 0;
const requireValue = <T>(value: T | undefined): T => {
  if (!value) throw new Error('NOT_FOUND');
  return value;
};
const getBoard = (value: string) =>
  requireValue(boards.find((board) => board.publicId === value && !board.deletedAt));
const getList = (value: string) => {
  for (const board of boards.filter((b) => !b.deletedAt)) {
    const list = board.lists.find((l) => l.publicId === value);
    if (list) return { board, list };
  }
  throw new Error('NOT_FOUND');
};
const getCard = (value: string) => {
  for (const board of boards.filter((b) => !b.deletedAt))
    for (const list of board.lists) {
      const card = list.cards.find((c) => c.publicId === value);
      if (card) return { board, list, card: card as Card };
    }
  throw new Error('NOT_FOUND');
};
const getChecklist = (value: string) => {
  for (const board of boards.filter((b) => !b.deletedAt))
    for (const list of board.lists)
      for (const card of list.cards) {
        const checklist = card.checklists.find((c) => c.publicId === value);
        if (checklist) return { card: card as Card, checklist };
      }
  throw new Error('NOT_FOUND');
};
const getChecklistItem = (value: string) => {
  for (const board of boards.filter((b) => !b.deletedAt))
    for (const list of board.lists)
      for (const card of list.cards)
        for (const checklist of card.checklists) {
          const item = checklist.items.find((i) => i.publicId === value);
          if (item) return { card: card as Card, checklist, item };
        }
  throw new Error('NOT_FOUND');
};
const reindex = (items: { index: number }[]) =>
  items.forEach((item, index) => {
    item.index = index;
  });
function activity(
  card: Card,
  type: string,
  fields: Partial<z.infer<typeof activityItemSchema>> = {},
) {
  card.activities.unshift(
    activityItemSchema.parse({
      publicId: publicId(),
      type,
      createdAt: new Date(Math.max(Date.now(), (card.activities[0]?.createdAt.getTime() ?? 0) + 1)),
      fromIndex: null,
      toIndex: null,
      fromTitle: null,
      toTitle: null,
      fromDescription: null,
      toDescription: null,
      fromDueDate: null,
      toDueDate: null,
      fromList: null,
      toList: null,
      label: null,
      member: null,
      user: localUser,
      comment: null,
      attachment: null,
      ...fields,
    }),
  );
}
function run(path: string, input: unknown): unknown {
  switch (path) {
    case 'workspace.all':
      return [{ workspace, role: 'admin' }];
    case 'permission.getMyPermissions': {
      const args = z.object({ workspacePublicId: id }).parse(input);
      if (args.workspacePublicId !== workspace.publicId) throw new Error('NOT_FOUND');
      return {
        role: 'admin',
        permissions: allPermissions.filter(
          (p) =>
            ['board', 'list', 'card', 'comment'].includes(p.split(':')[0]) ||
            p === 'workspace:view' ||
            p === 'member:view',
        ),
      };
    }
    case 'user.getUser':
      return localUser;
    case 'board.all': {
      const args = z
        .object({
          workspacePublicId: id,
          type: z.enum(['regular', 'template']).optional(),
          archived: z.boolean().optional(),
        })
        .parse(input);
      if (args.workspacePublicId !== workspace.publicId) throw new Error('NOT_FOUND');
      return z
        .array(boardListItemSchema)
        .parse(
          boards.filter(
            (b) =>
              !b.deletedAt &&
              b.type === (args.type ?? 'regular') &&
              b.isArchived === (args.archived ?? false),
          ),
        );
    }
    case 'board.create': {
      const args = z
        .object({
          name,
          workspacePublicId: id,
          lists: z.array(name).default([]),
          labels: z.array(name).default([]),
          type: z.enum(['regular', 'template']).default('regular'),
          sourceBoardPublicId: id.optional(),
        })
        .strict()
        .parse(input);
      if (args.workspacePublicId !== workspace.publicId) throw new Error('NOT_FOUND');
      if (args.sourceBoardPublicId) throw new Error('Copying custom boards is not yet supported');
      const board: Board = {
        publicId: publicId(),
        name: args.name,
        slug: publicId(),
        visibility: 'private',
        isArchived: false,
        favorite: false,
        type: args.type,
        deletedAt: null,
        workspace,
        labels: args.labels.map((name) => ({ publicId: publicId(), name, colourCode: '#10b981' })),
        lists: args.lists.map((name, index) => ({ publicId: publicId(), name, index, cards: [] })),
        allLists: [],
      };
      boards.push(board);
      return { publicId: board.publicId, name: board.name };
    }
    case 'board.byId': {
      const args = z
        .object({
          boardPublicId: id,
          members: z.array(id).optional(),
          labels: z.array(id).optional(),
          lists: z.array(id).optional(),
          dueDateFilters: z.array(z.string()).optional(),
          type: z.enum(['regular', 'template']).optional(),
        })
        .parse(input);
      if (args.dueDateFilters?.length) throw new Error('Due date filtering is not yet supported');
      const board = getBoard(args.boardPublicId);
      return boardDetailSchema.parse({
        ...board,
        allLists: board.lists,
        lists: board.lists
          .filter((list) => !args.lists?.length || args.lists.includes(list.publicId))
          .map((list) => ({
            ...list,
            cards: list.cards.filter(
              (card) =>
                (!args.labels?.length ||
                  card.labels.some((label) => args.labels!.includes(label.publicId))) &&
                (!args.members?.length ||
                  card.members.some((member) => args.members!.includes(member.publicId))),
            ),
          })),
      });
    }
    case 'board.update': {
      const args = z
        .object({
          boardPublicId: id,
          name: name.optional(),
          isArchived: z.boolean().optional(),
          favorite: z.boolean().optional(),
        })
        .strict()
        .parse(input);
      const board = getBoard(args.boardPublicId);
      Object.assign(
        board,
        Object.fromEntries(Object.entries(args).filter(([key]) => key !== 'boardPublicId')),
      );
      return { publicId: board.publicId, name: board.name };
    }
    case 'list.create': {
      const args = z.object({ boardPublicId: id, name }).strict().parse(input);
      const board = getBoard(args.boardPublicId);
      const list = { publicId: publicId(), name: args.name, index: board.lists.length, cards: [] };
      board.lists.push(list);
      return { publicId: list.publicId, name: list.name };
    }
    case 'list.update': {
      const args = z
        .object({
          listPublicId: id,
          name: name.optional(),
          index: z.number().int().min(0).optional(),
        })
        .strict()
        .parse(input);
      const { board, list } = getList(args.listPublicId);
      if (args.index !== undefined) {
        if (args.index >= board.lists.length) throw new Error('Invalid list index');
        board.lists.splice(list.index, 1);
        board.lists.splice(args.index, 0, list);
        reindex(board.lists);
      }
      if (args.name !== undefined) list.name = args.name;
      return { publicId: list.publicId, name: list.name };
    }
    case 'card.create': {
      const args = z
        .object({
          title,
          description: z.string().max(10000),
          listPublicId: id,
          labelPublicIds: z.array(id),
          memberPublicIds: z.array(id),
          position: z.enum(['start', 'end']),
          dueDate: z.date().nullable().optional(),
        })
        .strict()
        .parse(input);
      const { board, list } = getList(args.listPublicId);
      const labels = args.labelPublicIds.map((value) =>
        requireValue(board.labels.find((l) => l.publicId === value)),
      );
      const members = args.memberPublicIds.map((value) =>
        requireValue(workspace.members.find((m) => m.publicId === value)),
      );
      const card: Card = {
        publicId: publicId(),
        title: args.title,
        description: args.description,
        index: 0,
        cardNumber: ++cardNumber,
        dueDate: args.dueDate ?? null,
        labels,
        members,
        attachments: [],
        checklists: [],
        comments: [],
        activities: [],
      };
      list.cards.splice(args.position === 'start' ? 0 : list.cards.length, 0, card);
      reindex(list.cards);
      activity(card, 'card.created');
      return { publicId: card.publicId };
    }
    case 'card.byId': {
      const args = z.object({ cardPublicId: id }).parse(input);
      const { board, list, card } = getCard(args.cardPublicId);
      return cardDetailSchema.parse({
        ...card,
        createdBy: localUser.id,
        attachments: card.attachments.map(attachmentView),
        list: { ...list, board: { ...board, workspace } },
        activities: card.activities,
      });
    }
    case 'card.getActivities': {
      const args = z
        .object({
          cardPublicId: id,
          limit: z.number().int().min(1).max(100).default(10),
          cursor: z.string().datetime().optional(),
        })
        .parse(input);
      const { card } = getCard(args.cardPublicId);
      const items = card.activities.filter(
        (a) => !args.cursor || a.createdAt.toISOString() < args.cursor,
      );
      const slice = items.slice(0, args.limit);
      return {
        activities: slice,
        hasMore: items.length > slice.length,
        nextCursor: items.length > slice.length ? slice.at(-1)!.createdAt.toISOString() : null,
      };
    }
    case 'card.update': {
      const args = z
        .object({
          cardPublicId: id,
          title: title.optional(),
          description: z.string().max(10000).optional(),
          index: z.number().int().min(0).optional(),
          listPublicId: id.optional(),
          dueDate: z.date().nullable().optional(),
        })
        .strict()
        .parse(input);
      const { board, list, card } = getCard(args.cardPublicId);
      const destination = args.listPublicId ? getList(args.listPublicId) : { board, list };
      if (destination.board !== board) throw new Error('Cannot move a card outside its board');
      const nextIndex =
        args.index ?? (destination.list === list ? card.index : destination.list.cards.length);
      if (nextIndex > destination.list.cards.length - (destination.list === list ? 1 : 0))
        throw new Error('Invalid card index');
      if (args.title !== undefined && args.title !== card.title)
        activity(card, 'card.updated.title', { fromTitle: card.title, toTitle: args.title });
      if (args.description !== undefined && args.description !== card.description)
        activity(card, 'card.updated.description', {
          fromDescription: card.description,
          toDescription: args.description,
        });
      if (args.dueDate !== undefined && args.dueDate?.getTime() !== card.dueDate?.getTime())
        activity(
          card,
          args.dueDate
            ? card.dueDate
              ? 'card.updated.dueDate.updated'
              : 'card.updated.dueDate.added'
            : 'card.updated.dueDate.removed',
          { fromDueDate: card.dueDate, toDueDate: args.dueDate },
        );
      if (args.index !== undefined || destination.list !== list) {
        const fromIndex = card.index;
        list.cards.splice(card.index, 1);
        destination.list.cards.splice(nextIndex, 0, card);
        reindex(list.cards);
        reindex(destination.list.cards);
        activity(card, 'card.updated.list', {
          fromIndex,
          toIndex: card.index,
          fromList: { publicId: list.publicId, name: list.name, index: list.index },
          toList: {
            publicId: destination.list.publicId,
            name: destination.list.name,
            index: destination.list.index,
          },
        });
      }
      if (args.title !== undefined) card.title = args.title;
      if (args.description !== undefined) card.description = args.description;
      if (args.dueDate !== undefined) card.dueDate = args.dueDate;
      return {
        publicId: card.publicId,
        title: card.title,
        description: card.description,
        dueDate: card.dueDate,
      };
    }
    case 'label.create': {
      const args = z
        .object({ boardPublicId: id, name, colourCode: z.string().regex(/^#[0-9a-f]{6}$/i) })
        .strict()
        .parse(input);
      const board = getBoard(args.boardPublicId);
      const label = { publicId: publicId(), name: args.name, colourCode: args.colourCode };
      board.labels.push(label);
      return label;
    }
    case 'label.byPublicId': {
      const args = z.object({ labelPublicId: id }).parse(input);
      return requireValue(
        boards
          .filter((b) => !b.deletedAt)
          .flatMap((b) => b.labels)
          .find((l) => l.publicId === args.labelPublicId),
      );
    }
    case 'card.addOrRemoveLabel': {
      const args = z.object({ cardPublicId: id, labelPublicId: id }).strict().parse(input);
      const { board, card } = getCard(args.cardPublicId);
      const label = requireValue(board.labels.find((l) => l.publicId === args.labelPublicId));
      const index = card.labels.findIndex((l) => l.publicId === label.publicId);
      const newLabel = index < 0;
      if (newLabel) card.labels.push(label);
      else card.labels.splice(index, 1);
      activity(card, `card.updated.label.${newLabel ? 'added' : 'removed'}`, { label });
      return { newLabel };
    }
    case 'checklist.create': {
      const args = z
        .object({ cardPublicId: id, name: z.string().min(1).max(255) })
        .strict()
        .parse(input);
      const { card } = getCard(args.cardPublicId);
      const checklist = {
        publicId: publicId(),
        name: args.name,
        index: card.checklists.length,
        items: [],
      };
      card.checklists.push(checklist);
      activity(card, 'card.updated.checklist.added', { toTitle: checklist.name });
      return checklist;
    }
    case 'checklist.createItem': {
      const args = z
        .object({ checklistPublicId: id, title: z.string().min(1).max(500).transform(stripHtml) })
        .strict()
        .parse(input);
      const { card, checklist } = getChecklist(args.checklistPublicId);
      const item = {
        publicId: publicId(),
        title: args.title,
        completed: false,
        index: checklist.items.length,
      };
      checklist.items.push(item);
      activity(card, 'card.updated.checklist.item.added', { toTitle: item.title });
      return item;
    }
    case 'checklist.updateItem': {
      const args = z
        .object({
          checklistItemPublicId: id,
          title: z.string().min(1).max(500).transform(stripHtml).optional(),
          completed: z.boolean().optional(),
          index: z.number().int().min(0).optional(),
        })
        .strict()
        .parse(input);
      const { card, checklist, item } = getChecklistItem(args.checklistItemPublicId);
      if (args.index !== undefined && args.index >= checklist.items.length)
        throw new Error('Invalid item index');
      if (args.title !== undefined && args.title !== item.title) {
        activity(card, 'card.updated.checklist.item.updated', {
          fromTitle: item.title,
          toTitle: args.title,
        });
        item.title = args.title;
      }
      if (args.completed !== undefined && args.completed !== item.completed) {
        activity(
          card,
          args.completed
            ? 'card.updated.checklist.item.completed'
            : 'card.updated.checklist.item.uncompleted',
          { toTitle: item.title },
        );
        item.completed = args.completed;
      }
      if (args.index !== undefined) {
        checklist.items.splice(item.index, 1);
        checklist.items.splice(args.index, 0, item);
        reindex(checklist.items);
      }
      return item;
    }
    case 'card.addComment': {
      const args = z
        .object({ cardPublicId: id, comment: z.string().min(1).max(10000) })
        .strict()
        .parse(input);
      const { card } = getCard(args.cardPublicId);
      const comment = {
        publicId: publicId(),
        comment: args.comment,
        createdBy: localUser.id,
        updatedAt: null,
        deletedAt: null,
      };
      card.comments.push({ publicId: comment.publicId });
      activity(card, 'card.updated.comment.added', { comment });
      return comment;
    }
    case 'attachment.delete': {
      const args = z.object({ attachmentPublicId: id }).strict().parse(input);
      for (const board of boards.filter((b) => !b.deletedAt))
        for (const list of board.lists)
          for (const value of list.cards) {
            const card = value as Card;
            const index = card.attachments.findIndex((a) => a.publicId === args.attachmentPublicId);
            if (index < 0) continue;
            const removed = card.attachments[index];
            card.attachments.splice(index, 1);
            originals.delete(removed.publicId);
            const url = urls.get(removed.publicId);
            if (url) URL.revokeObjectURL(url);
            urls.delete(removed.publicId);
            activity(card, 'card.updated.attachment.deleted', {
              attachment: {
                publicId: removed.publicId,
                filename: removed.name,
                originalFilename: removed.name,
              },
            });
            return { publicId: removed.publicId };
          }
      throw new Error('NOT_FOUND');
    }
    default:
      throw new Error(`Local Kan operation is not yet supported: ${path}`);
  }
}
// Query results must never share mutable objects with React Query's optimistic cache.
const queryPaths = new Set([
  'workspace.all',
  'permission.getMyPermissions',
  'user.getUser',
  'board.all',
  'board.byId',
  'card.byId',
  'card.getActivities',
  'label.byPublicId',
]);
const failedWrites = new Map<string, string>();
export function assertSavedOperations() {
  if (failedWrites.size)
    throw new Error(
      'Correct the failed edit or reload the saved project: ' + [...failedWrites.values()][0],
    );
}
export function recordNativeWrite(path: string, input: unknown, error?: unknown) {
  const key =
    path +
    ':' +
    JSON.stringify(
      input && typeof input === 'object'
        ? Object.entries(input).filter(([key]) => key.endsWith('PublicId'))
        : [],
    );
  if (error) {
    failedWrites.set(key, error instanceof Error ? error.message : String(error));
    changed();
  } else if (failedWrites.delete(key)) changed();
}
export function dispatch(path: string, input: unknown) {
  const result = structuredClone(run(path, input));
  if (!queryPaths.has(path)) changed();
  return result;
}

const storedCardSchema = boardDetailSchema.shape.lists.element.shape.cards.element.extend({
  activities: z.array(activityItemSchema),
  attachments: z.array(attachmentSchema),
});
const storedBoardSchema = boardDetailSchema.extend({
  type: z.enum(['regular', 'template']),
  deletedAt: z.date().nullable(),
  lists: z.array(
    boardDetailSchema.shape.lists.element.extend({ cards: z.array(storedCardSchema) }),
  ),
});
const stateSchema = z
  .object({
    version: z.literal(1),
    cardNumber: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    boards: z.array(storedBoardSchema).max(1000),
  })
  .strict();
const dateFields = new Set([
  'dueDate',
  'createdAt',
  'updatedAt',
  'deletedAt',
  'fromDueDate',
  'toDueDate',
]);
/** Portable JSON; dates are explicit ISO strings on disk, native Date objects after validation. */
export function captureModel(): string {
  return JSON.stringify(stateSchema.parse({ version: 1, cardNumber, boards }));
}
function parseModel(serialized: string) {
  if (serialized.length > 32 * 1024 * 1024)
    throw new Error('Kan records exceed the local document limit');
  const next = stateSchema.parse(
    JSON.parse(serialized, (key, value) =>
      dateFields.has(key) && typeof value === 'string' ? new Date(value) : value,
    ),
  );
  const identities = new Set<string>();
  let maxCardNumber = 0;
  const register = (value: string) => {
    id.parse(value);
    if (identities.has(value)) throw new Error('Duplicate Kan identity');
    identities.add(value);
  };
  const ordered = (items: { index: number }[]) => {
    items.forEach((item, index) => {
      if (item.index !== index) throw new Error('Invalid saved order');
    });
  };
  for (const board of next.boards) {
    register(board.publicId);
    if (board.workspace.publicId !== workspace.publicId)
      throw new Error('Unexpected local workspace');
    const labels = new Set(
      board.labels.map((label) => {
        register(label.publicId);
        return label.publicId;
      }),
    );
    ordered(board.lists);
    for (const list of board.lists) {
      register(list.publicId);
      ordered(list.cards);
      for (const card of list.cards) {
        register(card.publicId);
        maxCardNumber = Math.max(maxCardNumber, card.cardNumber ?? 0);
        if (card.labels.some((label) => !labels.has(label.publicId)))
          throw new Error('Unknown card label');
        card.attachments.forEach((attachment) => register(attachment.publicId));
        ordered(card.checklists);
        for (const checklist of card.checklists) {
          register(checklist.publicId);
          ordered(checklist.items);
          checklist.items.forEach((item) => register(item.publicId));
        }
        card.activities.forEach((event) => register(event.publicId));
      }
    }
  }
  if (next.cardNumber < maxCardNumber) throw new Error('Invalid saved card counter');
  return next;
}
export function restoreModel(serialized: string): void {
  const next = parseModel(serialized);
  boards.splice(0, boards.length, ...next.boards);
  cardNumber = next.cardNumber;
}
export function captureRecords() {
  const state = JSON.parse(captureModel());
  const result: Record<string, unknown> = { state: { version: 1, cardNumber: state.cardNumber } };
  for (const board of state.boards)
    result['record-' + JSON.stringify(['kan', 'board', board.publicId])] = board;
  for (const board of boards)
    for (const list of board.lists)
      for (const value of list.cards)
        for (const attachment of (value as Card).attachments) {
          const key = JSON.stringify(['attachments', attachment.publicId]);
          result['file-' + key] = requireValue(originals.get(attachment.publicId));
          result['info-' + key] = { name: attachment.name, lastModified: attachment.lastModified };
        }
  return result;
}
export function restoreRecords(records: Record<string, unknown> | null) {
  const metadata = z
    .object({ version: z.literal(1), cardNumber: z.number().int().nonnegative() })
    .parse(records?.state ?? { version: 1, cardNumber: 0 });
  const next = parseModel(
    JSON.stringify({
      ...metadata,
      boards: Object.entries(records ?? {})
        .filter(([key]) => key.startsWith('record-'))
        .map(([, value]) => value),
    }),
  );
  const loaded = new Map<string, Original>();
  for (const board of next.boards)
    for (const list of board.lists)
      for (const card of list.cards)
        for (const attachment of card.attachments) {
          const source = records?.[
            'file-' + JSON.stringify(['attachments', attachment.publicId])
          ] as Original | undefined;
          if (
            !source ||
            !(source.bytes instanceof Uint8Array) ||
            source.bytes.byteLength !== attachment.size ||
            source.type !== attachment.type
          )
            throw new Error('Attachment originals are incomplete');
          loaded.set(attachment.publicId, source);
        }
  for (const url of urls.values()) URL.revokeObjectURL(url);
  urls.clear();
  originals.clear();
  for (const [key, value] of loaded) originals.set(key, value);
  boards.splice(0, boards.length, ...next.boards);
  cardNumber = next.cardNumber;
  failedWrites.clear();
}
