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
test('soft-deleted lists, cards, checklists and items stay in history while active order, moves and restore use only live records', async () => {
  const { restoreRecords, captureRecords } = await import('./model');
  restoreRecords(null);
  const { publicId } = newBoard('Deletion');
  const board = readBoard(publicId);
  const list = board.lists[0].publicId;
  const a = newCard(list, 'A');
  const b = newCard(list, 'B');
  const c = newCard(list, 'C');
  dispatch('card.delete', { cardPublicId: b.publicId });
  assert.deepEqual(
    readBoard(publicId).lists[0].cards.map((card) => [card.title, card.index]),
    [
      ['A', 0],
      ['C', 1],
    ],
  );
  assert.throws(() => dispatch('card.byId', { cardPublicId: b.publicId }), /NOT_FOUND/);
  // Moving around a tombstone must land on the visible position, not the array slot.
  dispatch('card.update', { cardPublicId: c.publicId, index: 0 });
  const d = newCard(list, 'D');
  dispatch('card.update', { cardPublicId: d.publicId, index: 1 });
  assert.deepEqual(
    readBoard(publicId).lists[0].cards.map((card) => card.title),
    ['C', 'D', 'A'],
  );
  assert.throws(() => dispatch('card.update', { cardPublicId: a.publicId, index: 3 }), /Invalid card index/);
  const checklist = dispatch('checklist.create', { cardPublicId: a.publicId, name: 'Steps' }) as {
    publicId: string;
  };
  const one = dispatch('checklist.createItem', { checklistPublicId: checklist.publicId, title: 'one' }) as { publicId: string };
  dispatch('checklist.createItem', { checklistPublicId: checklist.publicId, title: 'two' });
  dispatch('checklist.deleteItem', { checklistItemPublicId: one.publicId });
  dispatch('checklist.update', { checklistPublicId: checklist.publicId, name: 'Renamed' });
  let detail = cardDetailSchema.parse(dispatch('card.byId', { cardPublicId: a.publicId }));
  assert.deepEqual(detail.checklists.map((l) => [l.name, l.items.map((i) => [i.title, i.index])]), [
    ['Renamed', [['two', 0]]],
  ]);
  assert.equal(detail.activities[0].type, 'card.updated.checklist.renamed');
  assert.equal(detail.activities[1].type, 'card.updated.checklist.item.deleted');
  assert.equal(detail.activities[1].fromTitle, 'one');
  dispatch('checklist.delete', { checklistPublicId: checklist.publicId });
  assert.throws(() => dispatch('checklist.createItem', { checklistPublicId: checklist.publicId, title: 'x' }), /NOT_FOUND/);
  dispatch('list.create', { boardPublicId: publicId, name: 'Third' });
  dispatch('list.delete', { listPublicId: board.lists[1].publicId });
  assert.deepEqual(
    readBoard(publicId).lists.map((l) => [l.name, l.index]),
    [
      ['Ideas', 0],
      ['Third', 1],
    ],
  );
  // History and tombstones travel with the record; restore validates only the active order.
  const records = captureRecords();
  const stored = records['record-' + JSON.stringify(['kan', 'board', publicId])] as {
    lists: { deletedAt: string | null; cards: { title: string; deletedAt: string | null }[] }[];
  };
  assert.equal(stored.lists.length, 3);
  assert.equal(stored.lists[1].deletedAt !== null, true);
  assert.equal(stored.lists[0].cards.find((card) => card.title === 'B')?.deletedAt !== null, true);
  restoreRecords(null);
  restoreRecords(records);
  assert.deepEqual(
    readBoard(publicId).lists[0].cards.map((card) => card.title),
    ['C', 'D', 'A'],
  );
  detail = cardDetailSchema.parse(dispatch('card.byId', { cardPublicId: a.publicId }));
  assert.equal(detail.checklists.length, 0);
  assert.equal(detail.activities[0].type, 'card.updated.checklist.deleted');
  dispatch('board.delete', { boardPublicId: publicId });
  assert.throws(() => readBoard(publicId), /NOT_FOUND/);
  assert.equal(
    (dispatch('board.all', { workspacePublicId }) as { publicId: string }[]).some((b) => b.publicId === publicId),
    false,
  );
});
test('label rename and delete update card views after a JSON restore breaks shared references', async () => {
  const { restoreRecords, captureRecords } = await import('./model');
  restoreRecords(null);
  const { publicId } = newBoard('Labels');
  const board = readBoard(publicId);
  const card = newCard(board.lists[0].publicId, 'Tagged');
  const label = dispatch('label.create', { boardPublicId: publicId, name: 'Art', colourCode: '#ff0000' }) as { publicId: string };
  const other = dispatch('label.create', { boardPublicId: publicId, name: 'Sound', colourCode: '#00ff00' }) as { publicId: string };
  dispatch('card.addOrRemoveLabel', { cardPublicId: card.publicId, labelPublicId: label.publicId });
  dispatch('card.addOrRemoveLabel', { cardPublicId: card.publicId, labelPublicId: other.publicId });
  const records = captureRecords();
  restoreRecords(null);
  restoreRecords(records);
  dispatch('label.update', { labelPublicId: label.publicId, name: 'Artwork', colourCode: '#0000ff' });
  dispatch('label.delete', { labelPublicId: other.publicId });
  const detail = cardDetailSchema.parse(dispatch('card.byId', { cardPublicId: card.publicId }));
  assert.deepEqual(detail.labels, [{ publicId: label.publicId, name: 'Artwork', colourCode: '#0000ff' }]);
  assert.deepEqual(detail.list.board.labels.map((l) => l.name), ['Artwork']);
  assert.throws(() => dispatch('label.byPublicId', { labelPublicId: other.publicId }), /NOT_FOUND/);
  assert.throws(
    () => dispatch('card.addOrRemoveLabel', { cardPublicId: card.publicId, labelPublicId: other.publicId }),
    /NOT_FOUND/,
  );
  const filtered = boardDetailSchema.parse(dispatch('board.byId', { boardPublicId: publicId, labels: [label.publicId] }));
  assert.equal(filtered.lists[0].cards.length, 1);
  assert.equal(filtered.lists[0].cards[0].labels[0].name, 'Artwork');
  // Filtering by the deleted label matches nothing rather than stale copies.
  const stale = boardDetailSchema.parse(dispatch('board.byId', { boardPublicId: publicId, labels: [other.publicId] }));
  assert.equal(stale.lists[0].cards.length, 0);
});
test('comment edits and deletes keep native activity, counts and pagination consistent', () => {
  const { publicId } = newBoard('Comments');
  const board = readBoard(publicId);
  const card = newCard(board.lists[0].publicId, 'Discussed');
  const first = dispatch('card.addComment', { cardPublicId: card.publicId, comment: '<p>first</p>' }) as { publicId: string };
  const second = dispatch('card.addComment', { cardPublicId: card.publicId, comment: '<p>second</p>' }) as { publicId: string };
  dispatch('card.updateComment', { cardPublicId: card.publicId, commentPublicId: first.publicId, comment: '<p>edited</p>' });
  let detail = cardDetailSchema.parse(dispatch('card.byId', { cardPublicId: card.publicId }));
  const added = detail.activities.filter((a) => a.type === 'card.updated.comment.added');
  assert.deepEqual(added.map((a) => [a.comment?.comment, !!a.comment?.updatedAt]), [
    ['<p>second</p>', false],
    ['<p>edited</p>', true],
  ]);
  assert.equal(detail.activities[0].type, 'card.updated.comment.updated');
  dispatch('card.deleteComment', { cardPublicId: card.publicId, commentPublicId: second.publicId });
  detail = cardDetailSchema.parse(dispatch('card.byId', { cardPublicId: card.publicId }));
  assert.deepEqual(detail.activities.filter((a) => a.comment).map((a) => a.comment?.publicId), [first.publicId]);
  assert.equal(readBoard(publicId).lists[0].cards[0].comments.length, 1);
  const page = dispatch('card.getActivities', { cardPublicId: card.publicId, limit: 100 }) as { activities: { comment: { publicId: string } | null }[] };
  assert.equal(page.activities.some((a) => a.comment?.publicId === second.publicId), false);
  assert.throws(
    () => dispatch('card.updateComment', { cardPublicId: card.publicId, commentPublicId: second.publicId, comment: 'x' }),
    /NOT_FOUND/,
  );
});
test('duplication copies the native subset with fresh identities and same-board scope', () => {
  const { publicId } = newBoard('Duplicate');
  const board = readBoard(publicId);
  const card = newCard(board.lists[0].publicId, 'Source');
  const label = dispatch('label.create', { boardPublicId: publicId, name: 'Keep', colourCode: '#123456' }) as { publicId: string };
  dispatch('card.addOrRemoveLabel', { cardPublicId: card.publicId, labelPublicId: label.publicId });
  dispatch('card.addOrRemoveMember', { cardPublicId: card.publicId, workspaceMemberPublicId: 'localmember1' });
  const checklist = dispatch('checklist.create', { cardPublicId: card.publicId, name: 'Todo' }) as { publicId: string };
  const item = dispatch('checklist.createItem', { checklistPublicId: checklist.publicId, title: 'done already' }) as { publicId: string };
  dispatch('checklist.updateItem', { checklistItemPublicId: item.publicId, completed: true });
  dispatch('card.addComment', { cardPublicId: card.publicId, comment: 'not copied' });
  const copy = dispatch('card.duplicate', {
    cardPublicId: card.publicId,
    listPublicId: board.lists[1].publicId,
    index: 0,
    title: 'Copy',
    copyLabels: true,
    copyMembers: false,
    copyChecklists: true,
  }) as { publicId: string };
  assert.notEqual(copy.publicId, card.publicId);
  const detail = cardDetailSchema.parse(dispatch('card.byId', { cardPublicId: copy.publicId }));
  assert.equal(detail.title, 'Copy');
  assert.equal(detail.list.publicId, board.lists[1].publicId);
  assert.deepEqual(detail.labels.map((l) => l.publicId), [label.publicId]);
  assert.equal(detail.members.length, 0);
  assert.equal(detail.checklists[0].items[0].completed, false);
  assert.notEqual(detail.checklists[0].publicId, checklist.publicId);
  assert.equal(detail.activities.some((a) => a.comment), false);
  assert.equal(detail.activities.at(-1)?.type, 'card.created');
  const original = cardDetailSchema.parse(dispatch('card.byId', { cardPublicId: card.publicId }));
  assert.equal(original.members.length, 1);
  assert.equal(original.checklists[0].items[0].completed, true);
  const outside = readBoard(newBoard('Elsewhere').publicId);
  assert.throws(
    () =>
      dispatch('card.duplicate', {
        cardPublicId: card.publicId,
        listPublicId: outside.lists[0].publicId,
        copyLabels: false,
        copyMembers: false,
        copyChecklists: false,
      }),
    /outside its board/,
  );
  dispatch('card.addOrRemoveMember', { cardPublicId: card.publicId, workspaceMemberPublicId: 'localmember1' });
  assert.equal(cardDetailSchema.parse(dispatch('card.byId', { cardPublicId: card.publicId })).members.length, 0);
  assert.throws(
    () => dispatch('card.addOrRemoveMember', { cardPublicId: card.publicId, workspaceMemberPublicId: 'nobody000000' }),
    /NOT_FOUND/,
  );
});
test('due date filters use the native ranges, OR selected keys and combine with list and label filters', () => {
  const { publicId } = newBoard('Due');
  const board = readBoard(publicId);
  const list = board.lists[0].publicId;
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const yesterday = new Date(today.getTime() - 86400000);
  const inTwoDays = new Date(today.getTime() + 2 * 86400000);
  const inTwentyDays = new Date(today.getTime() + 20 * 86400000);
  const late = newCard(list, 'Late');
  const now = newCard(list, 'Now');
  const soon = newCard(list, 'Soon');
  const later = newCard(list, 'Later');
  const never = newCard(list, 'Never');
  dispatch('card.update', { cardPublicId: late.publicId, dueDate: yesterday });
  dispatch('card.update', { cardPublicId: now.publicId, dueDate: today });
  dispatch('card.update', { cardPublicId: soon.publicId, dueDate: inTwoDays });
  dispatch('card.update', { cardPublicId: later.publicId, dueDate: inTwentyDays });
  const titles = (filters: string[], extra: Record<string, unknown> = {}) =>
    boardDetailSchema
      .parse(dispatch('board.byId', { boardPublicId: publicId, dueDateFilters: filters, ...extra }))
      .lists.flatMap((l) => l.cards.map((c) => c.title));
  assert.deepEqual(titles(['overdue']), ['Late']);
  assert.deepEqual(titles(['today']), ['Now']);
  assert.deepEqual(titles(['next-week']), ['Now', 'Soon']);
  assert.deepEqual(titles(['next-month']), ['Later']);
  assert.deepEqual(titles(['no-due-date']), ['Never']);
  assert.deepEqual(titles(['overdue', 'no-due-date']), ['Late', 'Never']);
  assert.deepEqual(titles([]), ['Late', 'Now', 'Soon', 'Later', 'Never']);
  assert.deepEqual(titles(['overdue'], { lists: [board.lists[1].publicId] }), []);
  assert.throws(() => dispatch('board.byId', { boardPublicId: publicId, dueDateFilters: ['someday'] }));
});
test('records saved before soft deletion restore with active defaults and a source board copies its snapshot', async () => {
  const { restoreRecords } = await import('./model');
  restoreRecords(null);
  const { publicId } = newBoard('Legacy');
  const board = readBoard(publicId);
  const card = newCard(board.lists[0].publicId, 'Old');
  const checklist = dispatch('checklist.create', { cardPublicId: card.publicId, name: 'Old list' }) as { publicId: string };
  dispatch('checklist.createItem', { checklistPublicId: checklist.publicId, title: 'old item' });
  dispatch('card.addComment', { cardPublicId: card.publicId, comment: 'old comment' });
  // Earlier records only carried deletedAt on boards and comment bodies.
  const legacy = JSON.parse(captureModel(), function (this: { comment?: unknown }, key, value) {
    return key === 'deletedAt' && typeof this.comment !== 'string' ? undefined : value;
  });
  restoreModel(JSON.stringify(legacy));
  const detail = cardDetailSchema.parse(dispatch('card.byId', { cardPublicId: card.publicId }));
  assert.equal(detail.checklists[0].items[0].title, 'old item');
  assert.equal(detail.activities.filter((a) => a.comment).length, 1);
  assert.equal(readBoard(publicId).lists[0].cards[0].comments.length, 1);
  const clone = dispatch('board.create', {
    workspacePublicId,
    name: 'Cloned',
    lists: [],
    labels: [],
    sourceBoardPublicId: publicId,
  }) as { publicId: string };
  const cloned = readBoard(clone.publicId);
  assert.deepEqual(cloned.lists.map((l) => l.name), ['Ideas', 'Making']);
  assert.equal(cloned.lists[0].cards[0].title, 'Old');
  assert.notEqual(cloned.lists[0].cards[0].publicId, card.publicId);
  assert.equal(cloned.lists[0].cards[0].checklists[0].items[0].title, 'old item');
  assert.equal(cloned.lists[0].cards[0].comments.length, 0);
});
