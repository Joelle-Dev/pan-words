import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';

const {
  ALL_STORES,
  clearStores,
  deleteNote,
  getAll,
  getAllByIndex,
  getPageByIndex,
  getRecord,
  putMany,
  putRecord,
  writeNote,
  writeReview
} = await import('../src/lib/db.js');

const deck = {
  id: 'd1',
  name: '默认',
  kind: 'reading',
  newPerDay: 20,
  reviewsPerDay: 200,
  desiredRetention: 0.9,
  examDate: null,
  createdAt: 1000
};

function note(id, overrides = {}) {
  return {
    id,
    deckId: 'd1',
    word: id,
    lemma: id,
    phonetic: '',
    meaning: '',
    pos: '',
    sentence: '',
    sentenceBlank: '',
    source: '',
    tags: [],
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides
  };
}

function card(id, noteId, overrides = {}) {
  return {
    id,
    noteId,
    deckId: 'd1',
    mode: 'recognize',
    dueAt: 1000,
    state: 'new',
    stability: 0,
    difficulty: 0,
    reps: 0,
    lapses: 0,
    lastReviewedAt: null,
    suspended: false,
    ...overrides
  };
}

test('stores are created with the expected indexes', async () => {
  const db = await (await import('../src/lib/db.js')).openDB();
  for (const name of ALL_STORES) {
    assert.ok(db.objectStoreNames.contains(name), `${name} store should exist`);
  }

  const tx = db.transaction(['cards', 'notes'], 'readonly');
  const cardIndexes = [...tx.objectStore('cards').indexNames];
  assert.ok(cardIndexes.includes('dueAt'));
  assert.ok(cardIndexes.includes('noteId'));
  assert.ok(cardIndexes.includes('deckId_dueAt'));

  const noteIndexes = [...tx.objectStore('notes').indexNames];
  assert.ok(noteIndexes.includes('lemma'));
  assert.ok(noteIndexes.includes('deckId'));
});

test('writeNote stores a note together with its cards', async () => {
  await clearStores();
  await putRecord('decks', deck);

  await writeNote({
    note: note('skepticism'),
    cards: [
      card('skepticism:recognize', 'skepticism'),
      card('skepticism:spell', 'skepticism', { mode: 'spell' })
    ]
  });

  const notes = await getAll('notes');
  assert.equal(notes.length, 1);
  assert.equal(notes[0].word, 'skepticism');

  const cards = await getAllByIndex('cards', 'noteId', IDBKeyRange.only('skepticism'));
  assert.equal(cards.length, 2);
});

test('deleteNote cascades to its cards', async () => {
  await clearStores();
  await writeNote({
    note: note('run'),
    cards: [card('run:recognize', 'run'), card('run:cloze', 'run', { mode: 'cloze' })]
  });
  await writeNote({ note: note('keep'), cards: [card('keep:recognize', 'keep')] });

  await deleteNote('run');

  assert.equal((await getAll('notes')).length, 1);
  const cards = await getAll('cards');
  assert.equal(cards.length, 1);
  assert.equal(cards[0].noteId, 'keep');
});

test('cards can be paged by dueAt', async () => {
  await clearStores();
  await putMany('cards', [
    card('a', 'na', { dueAt: 300 }),
    card('b', 'nb', { dueAt: 100 }),
    card('c', 'nc', { dueAt: 200 }),
    card('d', 'nd', { dueAt: 400 })
  ]);

  const firstTwo = await getPageByIndex('cards', 'dueAt', null, { limit: 2 });
  assert.deepEqual(firstTwo.map((item) => item.id), ['b', 'c']);

  const range = IDBKeyRange.lowerBound(200);
  const fromTwo = await getPageByIndex('cards', 'dueAt', range, { limit: 10 });
  assert.deepEqual(fromTwo.map((item) => item.id), ['c', 'a', 'd']);
});

test('writeReview writes card, log and settings in one transaction', async () => {
  await clearStores();
  const stored = card('w1', 'nw', { dueAt: 5000, state: 'review', reps: 3 });
  await putMany('cards', [stored]);

  const next = { ...stored, dueAt: 9000, reps: 4, stability: 12.5 };
  const log = {
    id: 'w1:6000',
    cardId: 'w1',
    noteId: 'nw',
    mode: 'recognize',
    rating: 3,
    wasNew: false,
    prevDueAt: 5000,
    nextDueAt: 9000,
    reviewedAt: 6000
  };

  await writeReview({
    card: next,
    log,
    settings: [{ key: 'lastReviewedAt', value: 6000 }]
  });

  const cards = await getAll('cards');
  assert.equal(cards[0].dueAt, 9000);
  const logs = await getAll('reviewLog');
  assert.equal(logs.length, 1);
  assert.equal(logs[0].rating, 3);
  assert.equal(await getRecord('settings', 'lastReviewedAt').then((row) => row.value), 6000);
});

test('getSetting falls back when the key is missing', async () => {
  await clearStores();
  const { getSetting, setSetting } = await import('../src/lib/db.js');
  assert.equal(await getSetting('missing', 'fallback'), 'fallback');
  await setSetting('newPerDay', 25);
  assert.equal(await getSetting('newPerDay', 20), 25);
});
