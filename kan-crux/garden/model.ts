import { z } from 'zod';
import { stripHtml } from '../packages/shared/src/utils/sanitize';
import {
  convertDueDateFiltersToRanges,
  type DueDateFilterKey,
} from '../packages/shared/src/utils/dueDateFilters';
import { nanoid } from 'nanoid';
import { boardDetailSchema, boardListItemSchema } from '../packages/api/src/schemas/board';
import { cardDetailSchema, activityItemSchema } from '../packages/api/src/schemas/card';
import { labelSchema } from '../packages/api/src/schemas/common';
import { allPermissions } from '../packages/shared/src/permissions';
import { localUser } from './auth';
const id = z.string().length(12);
const name = z.string().min(1).max(100);
const title = z.string().min(1).max(2000);
const labelName = z.string().min(1).max(36);
const colourCode = z.string().regex(/^#[0-9a-f]{6}$/i);
const dueDateFilterKey = z.enum([
  'overdue',
  'today',
  'tomorrow',
  'next-week',
  'next-month',
  'no-due-date',
]);
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
type Deletable = { deletedAt: Date | null };
type Label = z.infer<typeof labelSchema> & Deletable;
type Member = (typeof workspace)['members'][number];
type ChecklistItem = { publicId: string; title: string; completed: boolean; index: number } & Deletable;
type Checklist = { publicId: string; name: string; index: number; items: ChecklistItem[] } & Deletable;
const attachmentSchema = z.object({
  publicId: id,
  name: z.string().min(1).max(1000),
  type: z.string().max(200),
  size: z.number().int().min(0).max(64000000),
  lastModified: z.number().finite(),
  deletedAt: z.date().nullable().default(null),
});
type Attachment = z.infer<typeof attachmentSchema>;
type Activity = z.infer<typeof activityItemSchema>;
type Comment = { publicId: string } & Deletable;
type Card = {
  publicId: string;
  title: string;
  description: string | null;
  index: number;
  cardNumber: number | null;
  dueDate: Date | null;
  labels: z.infer<typeof labelSchema>[];
  members: Member[];
  attachments: Attachment[];
  checklists: Checklist[];
  comments: Comment[];
  activities: Activity[];
} & Deletable;
type List = { publicId: string; name: string; index: number; cards: Card[] } & Deletable;
type Board = {
  publicId: string;
  name: string;
  slug: string;
  visibility: string;
  isArchived: boolean;
  favorite: boolean;
  type: 'regular' | 'template';
  workspace: typeof workspace;
  labels: Label[];
  lists: List[];
} & Deletable;
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
/** Soft-deleted records stay in their arrays as history; only active records are visible or indexed. */
const active = <T extends Deletable>(items: T[]) => items.filter((item) => !item.deletedAt);
const reindex = (items: (Deletable & { index: number })[]) =>
  active(items).forEach((item, index) => {
    item.index = index;
  });
/** Move an active record to an active position, ignoring tombstones stored alongside it. */
function move<T extends Deletable & { index: number }>(items: T[], item: T, toIndex: number) {
  items.splice(items.indexOf(item), 1);
  const others = active(items);
  if (toIndex > others.length) throw new Error('Invalid index');
  items.splice(toIndex < others.length ? items.indexOf(others[toIndex]) : items.length, 0, item);
  reindex(items);
}
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
const activeBoards = () => active(boards);
const getBoard = (value: string) =>
  requireValue(activeBoards().find((board) => board.publicId === value));
const getList = (value: string) => {
  for (const board of activeBoards()) {
    const list = active(board.lists).find((l) => l.publicId === value);
    if (list) return { board, list };
  }
  throw new Error('NOT_FOUND');
};
const getCard = (value: string) => {
  for (const board of activeBoards())
    for (const list of active(board.lists)) {
      const card = active(list.cards).find((c) => c.publicId === value);
      if (card) return { board, list, card };
    }
  throw new Error('NOT_FOUND');
};
const getLabel = (value: string) => {
  for (const board of activeBoards()) {
    const label = active(board.labels).find((l) => l.publicId === value);
    if (label) return { board, label };
  }
  throw new Error('NOT_FOUND');
};
const getChecklist = (value: string) => {
  for (const board of activeBoards())
    for (const list of active(board.lists))
      for (const card of active(list.cards)) {
        const checklist = active(card.checklists).find((c) => c.publicId === value);
        if (checklist) return { card, checklist };
      }
  throw new Error('NOT_FOUND');
};
const getChecklistItem = (value: string) => {
  for (const board of activeBoards())
    for (const list of active(board.lists))
      for (const card of active(list.cards))
        for (const checklist of active(card.checklists)) {
          const item = active(checklist.items).find((i) => i.publicId === value);
          if (item) return { card, checklist, item };
        }
  throw new Error('NOT_FOUND');
};
const getAttachment = (value: string) => {
  for (const board of activeBoards())
    for (const list of active(board.lists))
      for (const card of active(list.cards)) {
        const attachment = active(card.attachments).find((a) => a.publicId === value);
        if (attachment) return { card, attachment };
      }
  throw new Error('NOT_FOUND');
};
const commentActivity = (card: Card, value: string) =>
  requireValue(
    card.activities.find(
      (a) => a.type === 'card.updated.comment.added' && a.comment?.publicId === value,
    ),
  );
function activity(card: Card, type: string, fields: Partial<Activity> = {}) {
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
const memberActivity = (member: Member) => ({ publicId: member.publicId, user: member.user });
/** Card labels are stored copies; the board label is the source of truth after rename or delete. */
const cardLabels = (board: Board, card: Card) =>
  card.labels.flatMap((ref) => {
    const label = board.labels.find((l) => l.publicId === ref.publicId);
    return label && !label.deletedAt
      ? [{ publicId: label.publicId, name: label.name, colourCode: label.colourCode }]
      : [];
  });
const checklistViews = (card: Card) =>
  active(card.checklists).map((checklist) => ({
    publicId: checklist.publicId,
    name: checklist.name,
    index: checklist.index,
    items: active(checklist.items).map(({ publicId, title, completed, index }) => ({
      publicId,
      title,
      completed,
      index,
    })),
  }));
const cardView = (board: Board, card: Card) => ({
  publicId: card.publicId,
  title: card.title,
  description: card.description,
  index: card.index,
  cardNumber: card.cardNumber,
  dueDate: card.dueDate,
  labels: cardLabels(board, card),
  members: card.members,
  attachments: active(card.attachments).map(({ publicId }) => ({ publicId })),
  checklists: checklistViews(card),
  comments: active(card.comments).map(({ publicId }) => ({ publicId })),
});
const activeActivities = (card: Card) => card.activities.filter((a) => !a.comment?.deletedAt);
const listSummary = (list: List) => ({ publicId: list.publicId, name: list.name, index: list.index });
const labelView = ({ publicId, name, colourCode }: Label) => ({ publicId, name, colourCode });
function archiveCards(cards: Card[], deletedAt: Date) {
  for (const card of active(cards)) {
    card.deletedAt = deletedAt;
    activity(card, 'card.archived');
  }
}
function copyCard(
  board: Board,
  source: Card,
  options: { title?: string; copyLabels: boolean; copyMembers: boolean; copyChecklists: boolean },
): Card {
  const card: Card = {
    publicId: publicId(),
    title: options.title ?? source.title,
    description: source.description,
    index: 0,
    cardNumber: ++cardNumber,
    dueDate: source.dueDate,
    labels: options.copyLabels ? cardLabels(board, source) : [],
    members: options.copyMembers ? [...source.members] : [],
    attachments: [],
    checklists: options.copyChecklists
      ? active(source.checklists).map((checklist, index) => ({
          publicId: publicId(),
          name: checklist.name,
          index,
          deletedAt: null,
          items: active(checklist.items).map((item, itemIndex) => ({
            publicId: publicId(),
            title: item.title,
            completed: false,
            index: itemIndex,
            deletedAt: null,
          })),
        }))
      : [],
    comments: [],
    activities: [],
    deletedAt: null,
  };
  activity(card, 'card.created');
  for (const label of card.labels) activity(card, 'card.updated.label.added', { label });
  for (const member of card.members)
    activity(card, 'card.updated.member.added', { member: memberActivity(member) });
  for (const checklist of card.checklists)
    activity(card, 'card.updated.checklist.added', { toTitle: checklist.name });
  return card;
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
      return z.array(boardListItemSchema).parse(
        activeBoards()
          .filter(
            (b) => b.type === (args.type ?? 'regular') && b.isArchived === (args.archived ?? false),
          )
          .map((board) => ({
            publicId: board.publicId,
            name: board.name,
            favorite: board.favorite,
            lists: active(board.lists).map(listSummary),
            labels: active(board.labels).map(labelView),
          })),
      );
    }
    case 'board.create': {
      const args = z
        .object({
          name,
          workspacePublicId: id,
          lists: z.array(name).default([]),
          labels: z.array(labelName).default([]),
          type: z.enum(['regular', 'template']).default('regular'),
          sourceBoardPublicId: id.optional(),
        })
        .strict()
        .parse(input);
      if (args.workspacePublicId !== workspace.publicId) throw new Error('NOT_FOUND');
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
        labels: args.labels.map((name) => ({
          publicId: publicId(),
          name,
          colourCode: '#10b981',
          deletedAt: null,
        })),
        lists: args.lists.map((name, index) => ({
          publicId: publicId(),
          name,
          index,
          cards: [],
          deletedAt: null,
        })),
      };
      if (args.sourceBoardPublicId) {
        // Native snapshot copy: labels, lists, cards and checklists; not attachments or comments.
        const source = getBoard(args.sourceBoardPublicId);
        const labelIds = new Map<string, string>();
        board.labels = active(source.labels).map((label) => {
          const copy = { ...label, publicId: publicId() };
          labelIds.set(label.publicId, copy.publicId);
          return copy;
        });
        board.lists = active(source.lists).map((list, index) => ({
          publicId: publicId(),
          name: list.name,
          index,
          deletedAt: null,
          cards: active(list.cards).map((card, cardIndex) => {
            const copy = copyCard(source, card, {
              copyLabels: true,
              copyMembers: false,
              copyChecklists: true,
            });
            copy.index = cardIndex;
            copy.labels = copy.labels.map((label) => ({
              ...label,
              publicId: labelIds.get(label.publicId)!,
            }));
            copy.activities = copy.activities.map((event) =>
              event.label
                ? { ...event, label: { ...event.label, publicId: labelIds.get(event.label.publicId)! } }
                : event,
            );
            return copy;
          }),
        }));
      }
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
          dueDateFilters: z.array(dueDateFilterKey).optional(),
          type: z.enum(['regular', 'template']).optional(),
        })
        .parse(input);
      const board = getBoard(args.boardPublicId);
      const ranges = convertDueDateFiltersToRanges((args.dueDateFilters ?? []) as DueDateFilterKey[]);
      const dueDateMatches = (dueDate: Date | null) =>
        !ranges.length ||
        ranges.some((range) =>
          range.hasNoDueDate
            ? dueDate === null
            : dueDate !== null &&
              (!range.startDate || dueDate >= range.startDate) &&
              (!range.endDate || dueDate < range.endDate),
        );
      return boardDetailSchema.parse({
        publicId: board.publicId,
        name: board.name,
        slug: board.slug,
        visibility: board.visibility,
        isArchived: board.isArchived,
        favorite: board.favorite,
        workspace,
        labels: active(board.labels).map(labelView),
        allLists: active(board.lists).map(listSummary),
        lists: active(board.lists)
          .filter((list) => !args.lists?.length || args.lists.includes(list.publicId))
          .map((list) => ({
            ...listSummary(list),
            cards: active(list.cards)
              .map((card) => cardView(board, card))
              .filter(
                (card) =>
                  (!args.labels?.length ||
                    card.labels.some((label) => args.labels!.includes(label.publicId))) &&
                  (!args.members?.length ||
                    card.members.some((member) => args.members!.includes(member.publicId))) &&
                  dueDateMatches(card.dueDate),
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
    case 'board.delete': {
      const args = z.object({ boardPublicId: id }).strict().parse(input);
      const board = getBoard(args.boardPublicId);
      const deletedAt = new Date();
      board.deletedAt = deletedAt;
      for (const list of active(board.lists)) {
        list.deletedAt = deletedAt;
        archiveCards(list.cards, deletedAt);
      }
      return { success: true };
    }
    case 'list.create': {
      const args = z.object({ boardPublicId: id, name }).strict().parse(input);
      const board = getBoard(args.boardPublicId);
      const list: List = {
        publicId: publicId(),
        name: args.name,
        index: active(board.lists).length,
        cards: [],
        deletedAt: null,
      };
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
        if (args.index >= active(board.lists).length) throw new Error('Invalid list index');
        move(board.lists, list, args.index);
      }
      if (args.name !== undefined) list.name = args.name;
      return { publicId: list.publicId, name: list.name };
    }
    case 'list.delete': {
      const args = z.object({ listPublicId: id }).strict().parse(input);
      const { board, list } = getList(args.listPublicId);
      const deletedAt = new Date();
      list.deletedAt = deletedAt;
      archiveCards(list.cards, deletedAt);
      reindex(board.lists);
      return { success: true };
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
        labelView(requireValue(active(board.labels).find((l) => l.publicId === value))),
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
        deletedAt: null,
      };
      list.cards.push(card);
      move(list.cards, card, args.position === 'start' ? 0 : active(list.cards).length - 1);
      activity(card, 'card.created');
      return { publicId: card.publicId };
    }
    case 'card.byId': {
      const args = z.object({ cardPublicId: id }).parse(input);
      const { board, list, card } = getCard(args.cardPublicId);
      return cardDetailSchema.parse({
        ...cardView(board, card),
        createdBy: localUser.id,
        attachments: active(card.attachments).map(attachmentView),
        list: {
          publicId: list.publicId,
          name: list.name,
          board: {
            publicId: board.publicId,
            name: board.name,
            labels: active(board.labels).map(labelView),
            lists: active(board.lists).map(({ publicId, name }) => ({ publicId, name })),
            workspace,
          },
        },
        activities: activeActivities(card),
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
      const items = activeActivities(card).filter(
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
        args.index ?? (destination.list === list ? card.index : active(destination.list.cards).length);
      if (
        nextIndex >
        active(destination.list.cards).length - (destination.list === list ? 1 : 0)
      )
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
        list.cards.splice(list.cards.indexOf(card), 1);
        reindex(list.cards);
        destination.list.cards.push(card);
        move(destination.list.cards, card, nextIndex);
        activity(card, 'card.updated.list', {
          fromIndex,
          toIndex: card.index,
          fromList: listSummary(list),
          toList: listSummary(destination.list),
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
    case 'card.delete': {
      const args = z.object({ cardPublicId: id }).strict().parse(input);
      const { list, card } = getCard(args.cardPublicId);
      archiveCards([card], new Date());
      reindex(list.cards);
      return { success: true };
    }
    case 'card.duplicate': {
      const args = z
        .object({
          cardPublicId: id,
          listPublicId: id,
          index: z.number().int().min(0).optional(),
          title: title.optional(),
          copyLabels: z.boolean(),
          copyMembers: z.boolean(),
          copyChecklists: z.boolean(),
        })
        .strict()
        .parse(input);
      const { board, card } = getCard(args.cardPublicId);
      const destination = getList(args.listPublicId);
      if (destination.board !== board) throw new Error('Cannot duplicate a card outside its board');
      const target = args.index ?? active(destination.list.cards).length;
      if (target > active(destination.list.cards).length) throw new Error('Invalid card index');
      const copy = copyCard(board, card, args);
      destination.list.cards.push(copy);
      move(destination.list.cards, copy, target);
      return { publicId: copy.publicId };
    }
    case 'label.create': {
      const args = z
        .object({ boardPublicId: id, name: labelName, colourCode })
        .strict()
        .parse(input);
      const board = getBoard(args.boardPublicId);
      const label: Label = {
        publicId: publicId(),
        name: args.name,
        colourCode: args.colourCode,
        deletedAt: null,
      };
      board.labels.push(label);
      return labelView(label);
    }
    case 'label.byPublicId': {
      const args = z.object({ labelPublicId: id }).parse(input);
      return labelView(getLabel(args.labelPublicId).label);
    }
    case 'label.update': {
      const args = z
        .object({ labelPublicId: id, name: labelName, colourCode })
        .strict()
        .parse(input);
      const { board, label } = getLabel(args.labelPublicId);
      label.name = args.name;
      label.colourCode = args.colourCode;
      // Keep stored card copies aligned with the board label they reference.
      for (const list of board.lists)
        for (const card of list.cards)
          for (const ref of card.labels)
            if (ref.publicId === label.publicId) Object.assign(ref, labelView(label));
      return labelView(label);
    }
    case 'label.delete': {
      const args = z.object({ labelPublicId: id }).strict().parse(input);
      getLabel(args.labelPublicId).label.deletedAt = new Date();
      return { success: true };
    }
    case 'card.addOrRemoveLabel': {
      const args = z.object({ cardPublicId: id, labelPublicId: id }).strict().parse(input);
      const { board, card } = getCard(args.cardPublicId);
      const label = requireValue(active(board.labels).find((l) => l.publicId === args.labelPublicId));
      const index = card.labels.findIndex((l) => l.publicId === label.publicId);
      const newLabel = index < 0;
      if (newLabel) card.labels.push(labelView(label));
      else card.labels.splice(index, 1);
      activity(card, `card.updated.label.${newLabel ? 'added' : 'removed'}`, {
        label: labelView(label),
      });
      return { newLabel };
    }
    case 'card.addOrRemoveMember': {
      const args = z
        .object({ cardPublicId: id, workspaceMemberPublicId: id })
        .strict()
        .parse(input);
      const { card } = getCard(args.cardPublicId);
      const member = requireValue(
        workspace.members.find((m) => m.publicId === args.workspaceMemberPublicId),
      );
      const index = card.members.findIndex((m) => m.publicId === member.publicId);
      const newMember = index < 0;
      if (newMember) card.members.push(member);
      else card.members.splice(index, 1);
      activity(card, `card.updated.member.${newMember ? 'added' : 'removed'}`, {
        member: memberActivity(member),
      });
      return { newMember };
    }
    case 'checklist.create': {
      const args = z
        .object({ cardPublicId: id, name: z.string().min(1).max(255) })
        .strict()
        .parse(input);
      const { card } = getCard(args.cardPublicId);
      const checklist: Checklist = {
        publicId: publicId(),
        name: args.name,
        index: active(card.checklists).length,
        items: [],
        deletedAt: null,
      };
      card.checklists.push(checklist);
      activity(card, 'card.updated.checklist.added', { toTitle: checklist.name });
      return { publicId: checklist.publicId, name: checklist.name };
    }
    case 'checklist.update': {
      const args = z
        .object({ checklistPublicId: id, name: z.string().min(1).max(255) })
        .strict()
        .parse(input);
      const { card, checklist } = getChecklist(args.checklistPublicId);
      if (args.name !== checklist.name) {
        activity(card, 'card.updated.checklist.renamed', {
          fromTitle: checklist.name,
          toTitle: args.name,
        });
        checklist.name = args.name;
      }
      return { publicId: checklist.publicId, name: checklist.name };
    }
    case 'checklist.delete': {
      const args = z.object({ checklistPublicId: id }).strict().parse(input);
      const { card, checklist } = getChecklist(args.checklistPublicId);
      checklist.deletedAt = new Date();
      reindex(card.checklists);
      activity(card, 'card.updated.checklist.deleted', { fromTitle: checklist.name });
      return { success: true };
    }
    case 'checklist.createItem': {
      const args = z
        .object({ checklistPublicId: id, title: z.string().min(1).max(500).transform(stripHtml) })
        .strict()
        .parse(input);
      const { card, checklist } = getChecklist(args.checklistPublicId);
      const item: ChecklistItem = {
        publicId: publicId(),
        title: args.title,
        completed: false,
        index: active(checklist.items).length,
        deletedAt: null,
      };
      checklist.items.push(item);
      activity(card, 'card.updated.checklist.item.added', { toTitle: item.title });
      return { publicId: item.publicId, title: item.title, completed: item.completed, index: item.index };
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
      if (args.index !== undefined && args.index >= active(checklist.items).length)
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
      if (args.index !== undefined) move(checklist.items, item, args.index);
      return { publicId: item.publicId, title: item.title, completed: item.completed, index: item.index };
    }
    case 'checklist.deleteItem': {
      const args = z.object({ checklistItemPublicId: id }).strict().parse(input);
      const { card, checklist, item } = getChecklistItem(args.checklistItemPublicId);
      item.deletedAt = new Date();
      reindex(checklist.items);
      activity(card, 'card.updated.checklist.item.deleted', { fromTitle: item.title });
      return { success: true };
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
      card.comments.push({ publicId: comment.publicId, deletedAt: null });
      activity(card, 'card.updated.comment.added', { comment });
      return { publicId: comment.publicId, comment: comment.comment };
    }
    case 'card.updateComment': {
      const args = z
        .object({ cardPublicId: id, commentPublicId: id, comment: z.string().min(1).max(10000) })
        .strict()
        .parse(input);
      const { card } = getCard(args.cardPublicId);
      requireValue(active(card.comments).find((c) => c.publicId === args.commentPublicId));
      // The native comment body lives on its "added" activity; edit it in place so history stays one record.
      const stored = commentActivity(card, args.commentPublicId).comment!;
      stored.comment = args.comment;
      stored.updatedAt = new Date();
      activity(card, 'card.updated.comment.updated');
      return { publicId: stored.publicId, comment: stored.comment };
    }
    case 'card.deleteComment': {
      const args = z.object({ cardPublicId: id, commentPublicId: id }).strict().parse(input);
      const { card } = getCard(args.cardPublicId);
      const entry = requireValue(
        active(card.comments).find((c) => c.publicId === args.commentPublicId),
      );
      const deletedAt = new Date();
      entry.deletedAt = deletedAt;
      commentActivity(card, args.commentPublicId).comment!.deletedAt = deletedAt;
      activity(card, 'card.updated.comment.deleted');
      return { publicId: entry.publicId };
    }
    case 'attachment.delete': {
      const args = z.object({ attachmentPublicId: id }).strict().parse(input);
      const { card, attachment } = getAttachment(args.attachmentPublicId);
      // Soft delete keeps the original bytes with the project history; only the live URL is released.
      attachment.deletedAt = new Date();
      const url = urls.get(attachment.publicId);
      if (url) URL.revokeObjectURL(url);
      urls.delete(attachment.publicId);
      activity(card, 'card.updated.attachment.removed', {
        attachment: {
          publicId: attachment.publicId,
          filename: attachment.name,
          originalFilename: attachment.name,
        },
      });
      return { success: true };
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

const deletedAt = z.date().nullable().default(null);
const storedChecklistSchema = z.object({
  publicId: z.string(),
  name: z.string(),
  index: z.number(),
  deletedAt,
  items: z.array(
    z.object({
      publicId: z.string(),
      title: z.string(),
      completed: z.boolean(),
      index: z.number(),
      deletedAt,
    }),
  ),
});
const storedCardSchema = boardDetailSchema.shape.lists.element.shape.cards.element.extend({
  deletedAt,
  activities: z.array(activityItemSchema),
  attachments: z.array(attachmentSchema),
  checklists: z.array(storedChecklistSchema),
  comments: z.array(z.object({ publicId: z.string(), deletedAt })),
});
const storedBoardSchema = boardDetailSchema
  .omit({ allLists: true })
  .extend({
    type: z.enum(['regular', 'template']),
    deletedAt,
    labels: z.array(labelSchema.extend({ deletedAt })),
    lists: z.array(
      boardDetailSchema.shape.lists.element.extend({ deletedAt, cards: z.array(storedCardSchema) }),
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
  // Only active records carry a meaningful position; tombstones keep their last index as history.
  const ordered = <T extends Deletable & { index: number }>(items: T[]) => {
    active(items).forEach((item, index) => {
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
        card.comments.forEach((comment) => register(comment.publicId));
        card.activities.forEach((event) => register(event.publicId));
      }
    }
  }
  if (next.cardNumber < maxCardNumber) throw new Error('Invalid saved card counter');
  return next as unknown as { version: 1; cardNumber: number; boards: Board[] };
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
      for (const card of list.cards)
        for (const attachment of card.attachments) {
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
