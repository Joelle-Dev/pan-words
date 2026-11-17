import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_WEIGHTS,
  RATING,
  DAY_MS,
  initDifficulty,
  initStability,
  intervalDaysFor,
  newCard,
  previewIntervals,
  retrievability,
  schedule
} from '../src/srs/fsrs.js';

const NOW = new Date('2026-05-01T09:00:00Z').getTime();

function card(overrides = {}) {
  return { ...newCard({ now: NOW, noteId: 'n1', deckId: 'd1', mode: 'recognize' }), ...overrides };
}

test('new card enters learning on AGAIN and review otherwise', () => {
  const again = schedule({ card: card(), rating: RATING.AGAIN, now: NOW });
  assert.equal(again.card.state, 'learning');
  assert.ok(again.card.dueAt > NOW);
  assert.ok(again.card.dueAt - NOW < DAY_MS);

  for (const rating of [RATING.HARD, RATING.GOOD, RATING.EASY]) {
    const result = schedule({ card: card(), rating, now: NOW });
    assert.equal(result.card.state, 'review');
    assert.ok(result.card.dueAt >= NOW + DAY_MS * 0.99, `rating ${rating} should be at least a day`);
  }
});

test('initStability and initDifficulty follow rating order', () => {
  const s = [1, 2, 3, 4].map((rating) => initStability(rating));
  for (let i = 1; i < s.length; i += 1) assert.ok(s[i] > s[i - 1]);

  const d = [1, 2, 3, 4].map((rating) => initDifficulty(rating));
  for (let i = 1; i < d.length; i += 1) assert.ok(d[i] < d[i - 1]);
  for (const value of d) {
    assert.ok(value >= 1 && value <= 10);
  }
});

test('retrievability decays and equals ~0.9 at the stability horizon', () => {
  assert.equal(retrievability(10, 0), 1);
  assert.ok(Math.abs(retrievability(10, 10) - 0.9) < 0.001);
  assert.ok(retrievability(10, 30) < retrievability(10, 10));
});

test('consecutive GOOD reviews increase stability monotonically', () => {
  let current = newCard({ now: NOW, noteId: 'n2', deckId: 'd1', mode: 'spell' });
  let stability = 0;

  for (let i = 0; i < 5; i += 1) {
    const reviewNow = current.dueAt + 1000;
    const { card: next } = schedule({ card: current, rating: RATING.GOOD, now: reviewNow });
    assert.ok(next.stability >= stability, 'stability must not decrease on GOOD');
    stability = next.stability;
    current = next;
  }

  assert.ok(stability > 1);
});

test('AGAIN enters relearning, bumps lapses and rolls stability back', () => {
  const learned = schedule({ card: card(), rating: RATING.EASY, now: NOW }).card;
  const later = learned.dueAt + DAY_MS;
  const result = schedule({ card: learned, rating: RATING.AGAIN, now: later });

  assert.equal(result.card.state, 'relearning');
  assert.equal(result.card.lapses, 1);
  assert.ok(result.card.stability < learned.stability);
  assert.ok(result.card.dueAt - later < DAY_MS);
});

test('scheduling with a backwards clock never produces huge negative intervals', () => {
  const learned = schedule({ card: card(), rating: RATING.GOOD, now: NOW }).card;
  const earlier = NOW - DAY_MS * 30;
  const result = schedule({ card: learned, rating: RATING.GOOD, now: earlier });

  assert.ok(Number.isFinite(result.card.stability));
  assert.ok(result.card.dueAt > earlier);
  assert.ok(result.card.dueAt - earlier < DAY_MS * 365 * 200);
});

test('intervalDaysFor grows as desiredRetention drops', () => {
  const high = intervalDaysFor(30, 0.95);
  const mid = intervalDaysFor(30, 0.9);
  const low = intervalDaysFor(30, 0.8);
  assert.ok(high < mid);
  assert.ok(mid < low);
});

test('previewIntervals returns four increasing labels', () => {
  const preview = previewIntervals({ card: card(), now: NOW });
  for (const rating of [1, 2, 3, 4]) {
    assert.ok(preview[rating]);
    assert.equal(typeof preview[rating].label, 'string');
  }
  assert.ok(preview[2].days <= preview[3].days);
  assert.ok(preview[3].days <= preview[4].days);
});

test('simulated year of daily study stays finite and converges', () => {
  const byId = new Map();
  let learned = 0;
  const addCard = (id) => {
    byId.set(id, newCard({ now: NOW, noteId: id, deckId: 'd1', mode: 'recognize' }));
  };

  for (let day = 0; day < 365; day += 1) {
    const now = NOW + day * DAY_MS;
    if (learned < 20) {
      addCard(`n${learned}`);
      learned += 1;
    }

    for (const [id, current] of [...byId]) {
      if (current.dueAt > now) continue;
      const rating = day % 7 === 0 ? RATING.AGAIN : RATING.GOOD;
      const { card: next } = schedule({ card: current, rating, now });
      byId.set(id, next);
      assert.ok(Number.isFinite(next.stability) && next.stability > 0);
      assert.ok(Number.isFinite(next.dueAt));
    }
  }

  const cards = [...byId.values()];
  const avgStability = cards.reduce((sum, item) => sum + item.stability, 0) / cards.length;
  assert.ok(avgStability > 1, 'stability should grow over a year');
  assert.ok(cards.every((item) => item.reps > 0));
});

test('weights are the documented 19 values', () => {
  assert.equal(DEFAULT_WEIGHTS.length, 19);
  assert.ok(DEFAULT_WEIGHTS.every((value) => Number.isFinite(value)));
});
