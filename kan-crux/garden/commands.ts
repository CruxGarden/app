import { z } from 'zod';
import { dispatch, revisionToken } from './model';
import { boardListItemSchema, boardDetailSchema } from '../packages/api/src/schemas/board';
import { cardDetailSchema } from '../packages/api/src/schemas/card';
import { commandSchema } from './commands-schema';
export { commandSchema } from './commands-schema';
export function executeCommand(value: unknown) {
  const args = commandSchema.parse(value);
  if ('expectedState' in args && args.expectedState !== revisionToken())
    throw new Error('Kan changed since inspection. Inspect again before editing.');
  if (args.op === 'read-card') {
    const card = cardDetailSchema.parse(dispatch('card.byId', { cardPublicId: args.cardPublicId }));
    return {
      stateToken: revisionToken(),
      card: {
        ...card,
        activities: card.activities.slice(0, 20),
        checklists: card.checklists
          .slice(0, 30)
          .map((c) => ({ ...c, items: c.items.slice(0, 200) })),
      },
      limits: { activities: 20, checklists: 30, itemsPerChecklist: 200 },
    };
  }
  if (args.op === 'inspect') {
    const boards = z
      .array(boardListItemSchema)
      .parse(dispatch('board.all', { workspacePublicId: 'localspace01' }));
    const selected = args.boardPublicId
      ? boards.find((b) => b.publicId === args.boardPublicId)
      : boards[0];
    if (args.boardPublicId && !selected) throw new Error('Choose an active board in this Crux.');
    const board = selected
      ? boardDetailSchema.parse(dispatch('board.byId', { boardPublicId: selected.publicId }))
      : null;
    let remaining = 200;
    return {
      stateToken: revisionToken(),
      boards: boards.slice(0, 50).map(({ publicId, name }) => ({ publicId, name })),
      board: board
        ? {
            publicId: board.publicId,
            name: board.name,
            labels: board.labels,
            lists: board.lists.slice(0, 100).map((list) => {
              const cards = list.cards
                .slice(0, remaining)
                .map((card) => ({ publicId: card.publicId, title: card.title, index: card.index }));
              remaining -= cards.length;
              return {
                publicId: list.publicId,
                name: list.name,
                index: list.index,
                cardCount: list.cards.length,
                cards,
              };
            }),
          }
        : null,
      limits: { boards: 50, lists: 100, cards: 200 },
    };
  }
  if (args.op === 'create-card') {
    const description = args.description
      ? '<p>' +
        args.description
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/\n/g, '<br>') +
        '</p>'
      : '';
    return dispatch('card.create', {
      listPublicId: args.listPublicId,
      title: args.title,
      description,
      labelPublicIds: [],
      memberPublicIds: [],
      position: 'end',
    });
  }
  if (args.op === 'update-card')
    return dispatch('card.update', { cardPublicId: args.cardPublicId, title: args.title });
  if ('expectedState' in args) {
    const { expectedState: _expected, op, ...input } = args;
    if (op === 'create-board')
      return dispatch('board.create', {
        ...input,
        workspacePublicId: 'localspace01',
        type: 'regular',
        labels: [],
      });
    if (op === 'card-details') {
      const { description, dueDate, ...rest } = input as Extract<
        typeof args,
        { op: 'card-details' }
      >;
      return dispatch('card.update', {
        ...rest,
        ...(description !== undefined ? { description: plainDescription(description) } : {}),
        ...(dueDate !== undefined ? { dueDate: dueDate === null ? null : new Date(dueDate) } : {}),
      });
    }
    if (op === 'update-label') {
      const previous = dispatch('label.byPublicId', { labelPublicId: args.labelPublicId }) as {
        name: string;
        colourCode: string;
      };
      return dispatch('label.update', {
        labelPublicId: args.labelPublicId,
        name: args.name ?? previous.name,
        colourCode: args.colourCode ?? previous.colourCode,
      });
    }
    if (op === 'duplicate-card')
      return dispatch('card.duplicate', {
        ...input,
        copyLabels: true,
        copyMembers: true,
        copyChecklists: true,
      });
    if (op === 'set-label') {
      const { cardPublicId, labelPublicId, assigned } = args;
      const card = cardDetailSchema.parse(dispatch('card.byId', { cardPublicId }));
      if (card.labels.some((label) => label.publicId === labelPublicId) !== assigned)
        dispatch('card.addOrRemoveLabel', { cardPublicId, labelPublicId });
      return { cardPublicId, labelPublicId, assigned };
    }
    if (op === 'delete-list') {
      const { listPublicId, deleteCards } = args;
      const boards = z
        .array(boardListItemSchema)
        .parse(dispatch('board.all', { workspacePublicId: 'localspace01' }));
      const list = boards
        .flatMap(
          (b) =>
            boardDetailSchema.parse(dispatch('board.byId', { boardPublicId: b.publicId })).lists,
        )
        .find((l) => l.publicId === listPublicId);
      if (!list) throw new Error('Choose an active list.');
      if (list.cards.length && !deleteCards)
        throw new Error('This list has cards. Move them first or explicitly set deleteCards.');
      return dispatch('list.delete', { listPublicId });
    }
    const routes = {
      'update-board': 'board.update',
      'create-list': 'list.create',
      'update-list': 'list.update',
      'delete-card': 'card.delete',
      'create-label': 'label.create',
      'create-checklist': 'checklist.create',
      'update-checklist': 'checklist.update',
      'delete-checklist': 'checklist.delete',
      'create-item': 'checklist.createItem',
      'update-item': 'checklist.updateItem',
      'delete-item': 'checklist.deleteItem',
    };
    return dispatch(routes[op], input);
  }
  // Moving preserves native board ownership and index validation in the shared mutation.
  const card = cardDetailSchema.parse(dispatch('card.byId', { cardPublicId: args.cardPublicId }));
  dispatch('card.update', {
    cardPublicId: card.publicId,
    listPublicId: args.listPublicId,
    index: args.index,
  });
  return { publicId: card.publicId, listPublicId: args.listPublicId, index: args.index };
}

function plainDescription(text: string) {
  return text
    ? '<p>' +
        text
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/\n/g, '<br>') +
        '</p>'
    : '';
}
