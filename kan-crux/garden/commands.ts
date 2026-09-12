import { z } from 'zod';
import { dispatch } from './model';
import { boardListItemSchema, boardDetailSchema } from '../packages/api/src/schemas/board';
import { cardDetailSchema } from '../packages/api/src/schemas/card';
const id = z.string().length(12);
const title = z.string().trim().min(1).max(2000);
export const commandSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('inspect'), boardPublicId: id.optional() }).strict(),
  z
    .object({
      op: z.literal('create-card'),
      listPublicId: id,
      title,
      description: z.string().max(10000).optional(),
    })
    .strict(),
  z.object({ op: z.literal('update-card'), cardPublicId: id, title }).strict(),
  z
    .object({
      op: z.literal('move-card'),
      cardPublicId: id,
      listPublicId: id,
      index: z.number().int().min(0).max(10000),
    })
    .strict(),
]);
export function executeCommand(value: unknown) {
  const args = commandSchema.parse(value);
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
      boards: boards.slice(0, 50).map(({ publicId, name }) => ({ publicId, name })),
      board: board
        ? {
            publicId: board.publicId,
            name: board.name,
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
  // Moving preserves native board ownership and index validation in the shared mutation.
  const card = cardDetailSchema.parse(dispatch('card.byId', { cardPublicId: args.cardPublicId }));
  dispatch('card.update', {
    cardPublicId: card.publicId,
    listPublicId: args.listPublicId,
    index: args.index,
  });
  return { publicId: card.publicId, listPublicId: args.listPublicId, index: args.index };
}
