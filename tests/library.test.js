import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';

const { clearStores } = await import('../src/lib/db.js');
const { addWord, ensureDefaultDeck, submitRating } = await import('../src/lib/repo.js');
const { useLibrary } = await import('../src/composables/useLibrary.js');
const { RATING } = await import('../src/srs/constants.js');
const { buildQueue } = await import('../src/srs/queue.js');

test('library composable loads words and builds a queue that shrinks after rating', async () => {
  await clearStores();
  await ensureDefaultDeck();
  await addWord({ word: 'alpha', meaning: '甲' });
  await addWord({ word: 'beta', meaning: '乙' });

  const library = useLibrary();
  await library.reload();

  assert.equal(library.ready.value, true);
  assert.equal(library.notes.value.length, 2);
  assert.equal(library.activeDeck.value.id, 'default');

  const { queue } = library.buildTodayQueue();
  // 每个词三张卡，新词配额 20，所以应该全进队列
  assert.equal(queue.length, 6);
  assert.ok(queue.every((card) => card.state === 'new'));

  // 学完第一张，今天的「新词余额」应减一
  const first = queue[0];
  await submitRating({ card: first, rating: RATING.GOOD, now: Date.now() });
  await library.reload();

  assert.equal(library.todayStats.value.learned >= 1, true);
  assert.ok(library.quota.value.remainingNew <= 19);

  const next = library.buildTodayQueue();
  assert.equal(next.queue.length, 5);
});

test('buildQueue respects the deck new-per-day budget', async () => {
  const now = Date.now();
  const cards = Array.from({ length: 12 }, (_, index) => ({
    id: `c${index}`,
    noteId: `n${index}`,
    deckId: 'd1',
    mode: 'recognize',
    dueAt: now,
    state: 'new',
    stability: 0,
    difficulty: 0,
    reps: 0,
    lapses: 0,
    lastReviewedAt: null,
    suspended: false
  }));

  const result = buildQueue({ cards, now, newPerDay: 5, reviewsPerDay: 100 });
  assert.equal(result.new, 5);
  assert.equal(result.newBacklog, 7);
  assert.equal(result.queue.length, 5);
});
