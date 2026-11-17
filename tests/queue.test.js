import test from 'node:test';
import assert from 'node:assert/strict';
import { buildQueue, dailyLoad, reviewStreak, todayProgress, DAY_MS } from '../src/srs/queue.js';

const NOW = new Date('2026-05-01T09:00:00Z').getTime();

function card(id, overrides = {}) {
  return {
    id,
    noteId: `n-${id}`,
    deckId: 'd1',
    mode: 'recognize',
    dueAt: NOW - DAY_MS,
    state: 'review',
    stability: 10,
    difficulty: 5,
    reps: 3,
    lapses: 0,
    lastReviewedAt: NOW - DAY_MS * 5,
    suspended: false,
    ...overrides
  };
}

test('dailyLoad separates new cards from due cards', () => {
  const cards = [
    card('a'),
    card('b', { state: 'new', reps: 0 }),
    card('c', { dueAt: NOW + DAY_MS }),
    card('d', { dueAt: NOW - DAY_MS * 10 })
  ];
  const load = dailyLoad({ cards, now: NOW });
  assert.equal(load.new, 1);
  assert.equal(load.due, 2);
  assert.equal(load.overdue, 1);
  assert.equal(load.total, 3);
});

test('suspended cards never enter the queue', () => {
  const cards = [card('a', { suspended: true }), card('b')];
  const { queue } = buildQueue({ cards, now: NOW });
  assert.equal(queue.length, 1);
  assert.equal(queue[0].id, 'b');
});

test('queue order is learning, review, then new', () => {
  const cards = [
    card('r1', { state: 'review' }),
    card('l1', { state: 'learning' }),
    card('n1', { state: 'new', reps: 0 }),
    card('rl1', { state: 'relearning' })
  ];
  const { queue } = buildQueue({ cards, now: NOW });
  assert.deepEqual(queue.map((item) => item.id), ['l1', 'rl1', 'r1', 'n1']);
});

test('new cards are capped by newPerDay', () => {
  const cards = Array.from({ length: 50 }, (_, index) => (
    card(`n${index}`, { state: 'new', reps: 0 })
  ));
  const result = buildQueue({ cards, now: NOW, newPerDay: 20, reviewsPerDay: 200 });
  assert.equal(result.new, 20);
  assert.equal(result.queue.length, 20);
  assert.equal(result.newBacklog, 30);
});

test('review backlog is capped by reviewsPerDay and learning takes priority', () => {
  const learning = Array.from({ length: 5 }, (_, index) => (
    card(`l${index}`, { state: 'learning', dueAt: NOW - 1000 * index })
  ));
  const reviewCards = Array.from({ length: 300 }, (_, index) => (
    card(`r${index}`, { dueAt: NOW - DAY_MS - index })
  ));
  const result = buildQueue({
    cards: [...learning, ...reviewCards],
    now: NOW,
    newPerDay: 20,
    reviewsPerDay: 100
  });

  assert.equal(result.learning, 5);
  assert.equal(result.review, 95);
  assert.equal(result.backlog, 205);
  assert.equal(result.queue.length, 100);
});

test('deckIds filter restricts the queue', () => {
  const cards = [card('a', { deckId: 'd1' }), card('b', { deckId: 'd2' })];
  const result = buildQueue({ cards, now: NOW, deckIds: ['d2'] });
  assert.deepEqual(result.queue.map((item) => item.id), ['b']);

  const all = buildQueue({ cards, now: NOW, deckIds: [] });
  assert.equal(all.queue.length, 2);
});

test('cards due in the future stay out of the queue', () => {
  const cards = [card('future', { dueAt: NOW + 1000 })];
  const result = buildQueue({ cards, now: NOW });
  assert.equal(result.queue.length, 0);
});

test('a wildly early dueAt is clamped instead of flooding the queue with negative intervals', () => {
  const cards = [card('ancient', { dueAt: -62135596800000 })];
  const { queue } = buildQueue({ cards, now: NOW });
  assert.equal(queue.length, 1);
  assert.equal(queue[0].dueAt, NOW - DAY_MS);
});

test('empty input returns an empty queue', () => {
  const result = buildQueue({ cards: [], now: NOW });
  assert.deepEqual(result.queue, []);
  assert.equal(result.learning, 0);
  assert.equal(result.review, 0);
  assert.equal(result.new, 0);
});

test('todayProgress counts unique reviewed cards since day start', () => {
  const logs = [
    { cardId: 'a', reviewedAt: NOW, wasNew: false },
    { cardId: 'a', reviewedAt: NOW + 1000, wasNew: false },
    { cardId: 'b', reviewedAt: NOW + 2000, wasNew: true },
    { cardId: 'c', reviewedAt: NOW + 3000, wasNew: true },
    { cardId: 'a', reviewedAt: NOW - 5 * DAY_MS, wasNew: false }
  ];
  const progress = todayProgress({
    logs,
    dayStart: NOW - 60 * 60 * 1000,
    dayEnd: NOW + 6 * 60 * 60 * 1000
  });
  assert.equal(progress.reviewed, 3);
  assert.equal(progress.learned, 2);
});

test('reviewStreak counts consecutive days, allowing today to be empty', () => {
  const dayKeyOf = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };
  const today = new Date('2026-05-10T12:00:00');
  const pastLogs = [9, 8, 7].map((day) => ({
    reviewedAt: new Date(`2026-05-${String(day).padStart(2, '0')}T12:00:00`).getTime()
  }));

  // 今天(10)还没复习，从昨天(9)往前数：9,8,7
  assert.equal(reviewStreak({ logs: pastLogs, todayKey: dayKeyOf(today), dayKeyOf }), 3);

  const withToday = [...pastLogs, { reviewedAt: today.getTime() }];
  assert.equal(reviewStreak({ logs: withToday, todayKey: dayKeyOf(today), dayKeyOf }), 4);

  // 断档后从昨天只数一天
  const gapped = [{ reviewedAt: new Date('2026-05-09T12:00:00').getTime() }];
  assert.equal(reviewStreak({ logs: gapped, todayKey: dayKeyOf(today), dayKeyOf }), 1);

  assert.equal(reviewStreak({ logs: [], todayKey: dayKeyOf(today), dayKeyOf }), 0);
});
