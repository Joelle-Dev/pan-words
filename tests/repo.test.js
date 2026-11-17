import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';

const { clearStores, getAll, getRecord } = await import('../src/lib/db.js');
const {
  addWord,
  cardsForNote,
  deleteWord,
  ensureDefaultDeck,
  getNote,
  importWords,
  listNotes,
  submitRating,
  updateWord
} = await import('../src/lib/repo.js');
const { RATING } = await import('../src/srs/constants.js');
const { maskSentence } = await import('../src/srs/tokenize.js');

async function reset() {
  await clearStores();
  await ensureDefaultDeck();
}

test('addWord creates one note and three cards', async () => {
  await reset();
  const result = await addWord({
    word: 'Skepticism,',
    meaning: '怀疑态度',
    sentence: 'The policy was met with widespread skepticism.'
  });

  assert.ok(result.note);
  assert.equal(result.note.word, 'skepticism');
  assert.equal(result.note.meaning, '怀疑态度');
  assert.equal(result.note.sentenceBlank, 'The policy was met with widespread ____.');

  const cards = await cardsForNote(result.note.id);
  assert.deepEqual(cards.map((card) => card.mode).sort(), ['cloze', 'recognize', 'spell']);
  assert.ok(cards.every((card) => card.state === 'new'));
});

test('addWord rejects duplicates by lemma', async () => {
  await reset();
  await addWord({ word: 'run', meaning: '跑' });
  const second = await addWord({ word: 'running', meaning: '跑步', knownWords: new Set(['run']) });
  assert.ok(second.duplicate);
  assert.equal(second.duplicate.word, 'run');
  assert.equal((await listNotes()).length, 1);
});

test('addWord rejects an empty word', async () => {
  await reset();
  await assert.rejects(() => addWord({ word: '   ' }), /先写一个单词/);
});

test('updateWord keeps the id and refreshes the cloze', async () => {
  await reset();
  const { note } = await addWord({ word: 'cat', meaning: '猫' });
  const next = await updateWord(note.id, {
    word: 'cat',
    sentence: 'The cat sat on the mat.'
  });
  assert.equal(next.id, note.id);
  assert.equal(next.sentenceBlank, 'The ____ sat on the mat.');
});

test('deleteWord removes the note and all of its cards', async () => {
  await reset();
  const { note } = await addWord({ word: 'dog', meaning: '狗' });
  await deleteWord(note.id);
  assert.equal(await getNote(note.id), undefined);
  assert.equal((await cardsForNote(note.id)).length, 0);
});

test('submitRating persists the card and the log', async () => {
  await reset();
  const { cards, note } = await addWord({ word: 'persist', meaning: '坚持' });
  const card = cards.find((item) => item.mode === 'recognize');
  const now = Date.now();

  const { card: next, log } = await submitRating({ card, rating: RATING.GOOD, now });
  assert.equal(next.reps, 1);
  assert.equal(next.state, 'review');
  assert.equal(log.wasNew, true);
  assert.equal(log.noteId, note.id);

  const stored = await getRecord('cards', card.id);
  assert.equal(stored.dueAt, next.dueAt);
  assert.equal(stored.reps, 1);

  const logs = await getAll('reviewLog');
  assert.equal(logs.length, 1);
});

test('importWords skips duplicates and reports them', async () => {
  await reset();
  await addWord({ word: 'go', meaning: '去' });

  const result = await importWords([
    { word: 'go', meaning: '去' },
    { word: 'went', meaning: '去（过去式）' },
    { word: 'skepticism', meaning: '怀疑' }
  ]);

  // went 归并到 go（不规则表），所以也只有 skepticism 是新的
  assert.equal(result.added, 1);
  assert.equal(result.duplicates.length, 2);
  assert.deepEqual(result.duplicates.map((item) => item.lemma).sort(), ['go', 'go']);

  const notes = await listNotes();
  assert.deepEqual(notes.map((note) => note.word).sort(), ['go', 'skepticism']);
});

test('importWords writes cards for every imported word', async () => {
  await reset();
  await importWords([
    { word: 'alpha', meaning: '甲' },
    { word: 'beta', meaning: '乙' }
  ]);
  const cards = await getAll('cards');
  assert.equal(cards.length, 6);
  assert.equal(new Set(cards.map((card) => card.noteId)).size, 2);
});

test('maskSentence is applied at add time so cloze cards are usable', async () => {
  await reset();
  const { note } = await addWord({
    word: 'skepticism',
    sentence: 'There was widespread skepticism about the plan.'
  });
  assert.equal(note.sentenceBlank, maskSentence(note.sentence, 'skepticism'));
  assert.ok(note.sentenceBlank.includes('____'));
});
