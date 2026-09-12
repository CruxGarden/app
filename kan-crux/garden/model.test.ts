import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dispatch, captureModel, restoreModel } from './model';
import { boardDetailSchema } from '../packages/api/src/schemas/board';
import { cardDetailSchema } from '../packages/api/src/schemas/card';
const workspacePublicId = 'localspace01';
function newBoard(name: string) {
  return dispatch('board.create', {
    workspacePublicId,
    name,
    lists: ['Ideas', 'Making'],
    labels: [],
    type: 'regular',
  }) as { publicId: string };
}
function readBoard(boardPublicId: string) {
  return boardDetailSchema.parse(dispatch('board.byId', { boardPublicId }));
}
function newCard(listPublicId: string, title: string) {
  return dispatch('card.create', {
    title,
    description: '',
    listPublicId,
    labelPublicIds: [],
    memberPublicIds: [],
    position: 'end',
  }) as { publicId: string };
}
test('real native card shape, stable ordering and activity after a move', () => {
  const { publicId } = newBoard('Movement');
  const board = readBoard(publicId);
  const first = newCard(board.lists[0].publicId, 'First');
  const second = newCard(board.lists[0].publicId, 'Second');
  dispatch('card.update', {
    cardPublicId: first.publicId,
    listPublicId: board.lists[1].publicId,
    index: 0,
  });
  const after = readBoard(publicId);
  assert.deepEqual(
    after.lists.map((l) => l.cards.map((c) => [c.publicId, c.index])),
    [[[second.publicId, 0]], [[first.publicId, 0]]],
  );
  const detail = cardDetailSchema.parse(dispatch('card.byId', { cardPublicId: first.publicId }));
  assert.equal(detail.list.publicId, board.lists[1].publicId);
  assert.equal(detail.activities[0].type, 'card.updated.list');
  assert.equal(detail.activities[0].fromList?.publicId, board.lists[0].publicId);
});
test('optimistic query cache edits cannot corrupt the canonical board', () => {
  const { publicId } = newBoard('Isolation');
  const board = readBoard(publicId);
  newCard(board.lists[0].publicId, 'Keep me');
  const cached = readBoard(publicId);
  cached.lists[0].cards.splice(0, 1);
  cached.lists[1].name = 'Transient';
  const after = readBoard(publicId);
  assert.equal(after.lists[0].cards[0].title, 'Keep me');
  assert.equal(after.lists[1].name, 'Making');
});
test('invalid movement leaves content and activity unchanged', () => {
  const { publicId } = newBoard('Validation');
  const board = readBoard(publicId);
  const card = newCard(board.lists[0].publicId, 'Original');
  const before = dispatch('card.byId', { cardPublicId: card.publicId });
  assert.throws(
    () =>
      dispatch('card.update', {
        cardPublicId: card.publicId,
        title: 'Should not change',
        index: 99,
      }),
    /Invalid card index/,
  );
  const outside = readBoard(newBoard('Outside').publicId);
  assert.throws(
    () =>
      dispatch('card.update', {
        cardPublicId: card.publicId,
        listPublicId: outside.lists[0].publicId,
      }),
    /outside its board/,
  );
  assert.deepEqual(dispatch('card.byId', { cardPublicId: card.publicId }), before);
});
test('unsupported hosted operations fail explicitly', () => {
  assert.throws(() => dispatch('invitation.create', {}), /not yet supported/);
  assert.throws(
    () => dispatch('board.create', { workspacePublicId: 'otherspace01', name: 'Wrong owner' }),
    /NOT_FOUND/,
  );
});
test('card detail retains native labels, due dates, checklists and local comments', () => {
  const { publicId } = newBoard('Detailed work');
  const board = readBoard(publicId);
  const card = newCard(board.lists[0].publicId, 'Launch');
  const label = dispatch('label.create', {
    boardPublicId: publicId,
    name: 'Release',
    colourCode: '#0d9488',
  }) as { publicId: string };
  dispatch('card.addOrRemoveLabel', { cardPublicId: card.publicId, labelPublicId: label.publicId });
  const dueDate = new Date('2026-09-15T12:00:00Z');
  dispatch('card.update', { cardPublicId: card.publicId, dueDate });
  const checklist = dispatch('checklist.create', {
    cardPublicId: card.publicId,
    name: 'Checks',
  }) as { publicId: string };
  const item = dispatch('checklist.createItem', {
    checklistPublicId: checklist.publicId,
    title: '<b>Listen</b>',
  }) as { publicId: string };
  dispatch('checklist.updateItem', { checklistItemPublicId: item.publicId, completed: true });
  dispatch('card.addComment', { cardPublicId: card.publicId, comment: '<p>Sounds good</p>' });
  const detail = cardDetailSchema.parse(dispatch('card.byId', { cardPublicId: card.publicId }));
  assert.equal(detail.labels[0].publicId, label.publicId);
  assert.equal(detail.dueDate?.getTime(), dueDate.getTime());
  assert.equal(detail.checklists[0].items[0].title, 'Listen');
  assert.equal(detail.checklists[0].items[0].completed, true);
  assert.equal(detail.activities[0].comment?.comment, '<p>Sounds good</p>');
});

test('portable JSON restores native dates, identities, completed work and activity after clearing memory', () => {
  const { publicId } = newBoard('Portable');
  const board = readBoard(publicId);
  const card = newCard(board.lists[0].publicId, 'Carry this');
  dispatch('card.update', {
    cardPublicId: card.publicId,
    dueDate: new Date('2026-10-01T00:00:00Z'),
  });
  const before = dispatch('card.byId', { cardPublicId: card.publicId });
  const serialized = captureModel();
  restoreModel(JSON.stringify({ version: 1, cardNumber: 0, boards: [] }));
  assert.throws(() => dispatch('card.byId', { cardPublicId: card.publicId }), /NOT_FOUND/);
  restoreModel(serialized);
  assert.deepEqual(dispatch('card.byId', { cardPublicId: card.publicId }), before);
  assert.equal(captureModel(), serialized);
});
test('corrupt restore cannot replace the open draft', () => {
  const before = captureModel();
  const invalid = JSON.parse(before);
  invalid.boards[0].lists[0].index = 99;
  assert.throws(() => restoreModel(JSON.stringify(invalid)), /Invalid saved order/);
  assert.equal(captureModel(), before);
  const duplicate = JSON.parse(before);
  duplicate.boards[0].lists[1].publicId = duplicate.boards[0].lists[0].publicId;
  assert.throws(() => restoreModel(JSON.stringify(duplicate)), /Duplicate Kan identity/);
  assert.equal(captureModel(), before);
});

test('rapid local edits remain reachable across native timestamp-cursor activity pages', () => {
  const { publicId } = newBoard('Activity pages');
  const board = readBoard(publicId);
  const card = newCard(board.lists[0].publicId, 'Start');
  for (let index = 0; index < 35; index++)
    dispatch('card.update', { cardPublicId: card.publicId, title: `Edit ${index}` });
  const seen: string[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 10; page++) {
    const result = dispatch('card.getActivities', {
      cardPublicId: card.publicId,
      limit: 10,
      cursor,
    }) as { activities: { publicId: string }[]; hasMore: boolean; nextCursor: string | null };
    seen.push(...result.activities.map((event) => event.publicId));
    if (!result.hasMore) break;
    cursor = result.nextCursor!;
  }
  assert.equal(seen.length, 36);
  assert.equal(new Set(seen).size, 36);
});

test('original attachment bytes survive record restoration and text edits reuse the original object', async () => {
  const { uploadAttachment, captureRecords, restoreRecords } = await import('./model');
  restoreRecords(null);
  const { publicId } = newBoard('Media');
  const board = readBoard(publicId);
  const card = newCard(board.lists[0].publicId, 'Image');
  const bytes = new Uint8Array([0, 1, 2, 255]);
  const metadata = await uploadAttachment(
    card.publicId,
    new File([bytes], 'original.bin', { type: 'application/octet-stream', lastModified: 123 }),
  );
  const before = captureRecords();
  const key = 'file-' + JSON.stringify(['attachments', metadata.publicId]);
  dispatch('card.update', { cardPublicId: card.publicId, title: 'New title' });
  assert.equal(captureRecords()[key], before[key]);
  const records = captureRecords();
  restoreRecords(null);
  restoreRecords(records);
  const detail = cardDetailSchema.parse(dispatch('card.byId', { cardPublicId: card.publicId }));
  assert.equal(detail.attachments[0].originalFilename, 'original.bin');
  assert.equal(detail.attachments[0].size, 4);
  assert.deepEqual(
    new Uint8Array(await (await fetch(detail.attachments[0].url!)).arrayBuffer()),
    bytes,
  );
  const bad = { ...records };
  delete bad[key];
  assert.throws(() => restoreRecords(bad), /originals are incomplete/);
  assert.equal(readBoard(publicId).lists[0].cards[0].title, 'New title');
});
test('bounded commands use native mutations and reject unknown fields or foreign lists', async () => {
  const { executeCommand } = await import('./commands');
  const { restoreRecords } = await import('./model');
  restoreRecords(null);
  const { publicId } = newBoard('Agent');
  const board = readBoard(publicId);
  const card = executeCommand({
    op: 'create-card',
    listPublicId: board.lists[0].publicId,
    title: 'Agent card',
    description: '<plain text>',
  }) as { publicId: string };
  executeCommand({
    op: 'move-card',
    cardPublicId: card.publicId,
    listPublicId: board.lists[1].publicId,
    index: 0,
  });
  executeCommand({ op: 'update-card', cardPublicId: card.publicId, title: 'Ready' });
  assert.equal(readBoard(publicId).lists[1].cards[0].title, 'Ready');
  assert.throws(() =>
    executeCommand({
      op: 'update-card',
      cardPublicId: card.publicId,
      title: 'Bad',
      path: '../outside',
    }),
  );
  const outside = readBoard(newBoard('Outside agent').publicId);
  assert.throws(
    () =>
      executeCommand({
        op: 'move-card',
        cardPublicId: card.publicId,
        listPublicId: outside.lists[0].publicId,
        index: 0,
      }),
    /outside its board/,
  );
});
test('failed native edits block confirmation until corrected, while rejected agent commands do not create drafts', async () => {
  const { recordNativeWrite, assertSavedOperations, restoreRecords } = await import('./model');
  const { executeCommand } = await import('./commands');
  restoreRecords(null);
  const { publicId } = newBoard('Failed edit');
  const board = readBoard(publicId);
  const card = newCard(board.lists[0].publicId, 'Original');
  recordNativeWrite(
    'card.update',
    { cardPublicId: card.publicId, title: '' },
    new Error('Title required'),
  );
  assert.throws(() => assertSavedOperations(), /Title required/);
  dispatch('card.update', { cardPublicId: card.publicId, title: 'Fixed' });
  recordNativeWrite('card.update', { cardPublicId: card.publicId, title: 'Fixed' });
  assert.doesNotThrow(() => assertSavedOperations());
  assert.throws(() =>
    executeCommand({
      op: 'move-card',
      cardPublicId: card.publicId,
      listPublicId: board.lists[0].publicId,
      index: 999,
    }),
  );
  assert.doesNotThrow(() => assertSavedOperations());
});
