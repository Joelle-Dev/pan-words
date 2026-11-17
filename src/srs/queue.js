// 每日队列组装。
//
// 两个必须有的保护：
//   1. 积压上限：某天没复习，第二天不要一次塞进三千张卡
//   2. 时钟回拨：dueAt 出现过早的值时，按 now - 1 天处理

const DAY_MS = 24 * 60 * 60 * 1000;

const STATE_ORDER = { learning: 0, relearning: 1, review: 2, new: 3 };

function dueOf(card) {
  return Number(card?.dueAt) || 0;
}

function isSuspended(card) {
  return Boolean(card?.suspended);
}

function clampBackwardsClock(card, now) {
  const earliest = now - DAY_MS;
  if (dueOf(card) >= earliest) return card;
  return { ...card, dueAt: earliest };
}

/**
 * 统计今天的工作量。
 * due: 到期（含学习中）卡片数量
 * new: 尚未学过的新卡数量（未做配额截断）
 */
export function dailyLoad({ cards = [], now = 0 } = {}) {
  let due = 0;
  let fresh = 0;
  let overdue = 0;
  const at = Number(now) || 0;

  for (const card of cards) {
    if (isSuspended(card)) continue;
    if (card.state === 'new' || !card.reps) {
      fresh += 1;
      continue;
    }
    if (dueOf(card) <= at) {
      due += 1;
      if (at - dueOf(card) > DAY_MS) overdue += 1;
    }
  }

  return { due, new: fresh, overdue, total: due + fresh };
}

/**
 * 组装今天的队列。
 *
 * servedNew 是今天还剩多少新词配额（调用方从「今日已学新卡数」算出来）。
 * 返回的卡片已经按「学习 → 复习 → 新词」排序并做了配额截断。
 */
export function buildQueue({
  cards = [],
  now = 0,
  newPerDay = 20,
  reviewsPerDay = 200,
  deckIds = null
} = {}) {
  const at = Number(now) || 0;
  const allowedDecks = Array.isArray(deckIds) && deckIds.length
    ? new Set(deckIds)
    : null;

  const learning = [];
  const review = [];
  const fresh = [];

  for (const raw of cards) {
    if (isSuspended(raw)) continue;
    if (allowedDecks && !allowedDecks.has(raw.deckId)) continue;

    const card = clampBackwardsClock(raw, at);

    if (card.state === 'new' || !card.reps) {
      fresh.push(card);
      continue;
    }
    if (dueOf(card) > at) continue;

    if (card.state === 'learning' || card.state === 'relearning') learning.push(card);
    else review.push(card);
  }

  learning.sort((a, b) => dueOf(a) - dueOf(b));
  review.sort((a, b) => dueOf(a) - dueOf(b));
  // 新词按加入顺序：id 里带 noteId，稳定排序即可
  fresh.sort((a, b) => dueOf(a) - dueOf(b));

  const learningSlice = learning.slice(0, Math.max(0, reviewsPerDay));
  const reviewQuota = Math.max(0, reviewsPerDay - learningSlice.length);
  const reviewSlice = review.slice(0, reviewQuota);
  const freshSlice = fresh.slice(0, Math.max(0, newPerDay));

  const queue = [...learningSlice, ...reviewSlice, ...freshSlice];

  return {
    queue,
    learning: learningSlice.length,
    review: reviewSlice.length,
    new: freshSlice.length,
    backlog: Math.max(0, review.length - reviewSlice.length),
    newBacklog: Math.max(0, fresh.length - freshSlice.length)
  };
}

/**
 * 跨天统计：今天已经复习了多少张、学了多少张新卡。
 * 用在 TodayView 上算「剩余的今日配额」。
 */
export function todayProgress({ logs = [], dayStart = 0, dayEnd = 0 } = {}) {
  const start = Number(dayStart) || 0;
  const end = Number(dayEnd) || start + DAY_MS;
  const reviewedIds = new Set();
  const learnedIds = new Set();

  for (const log of logs) {
    const at = Number(log?.reviewedAt) || 0;
    if (at < start || at >= end) continue;
    reviewedIds.add(log.cardId);
    if (log.wasNew) learnedIds.add(log.cardId);
  }

  return { reviewed: reviewedIds.size, learned: learnedIds.size };
}

/** 连续复习天数（从今天或昨天往前数，允许今天还没开始） */
export function reviewStreak({ logs = [], todayKey, dayKeyOf }) {
  const keys = new Set();
  for (const log of logs) {
    const at = Number(log?.reviewedAt) || 0;
    if (!at) continue;
    keys.add(dayKeyOf(new Date(at)));
  }
  if (!keys.size) return 0;

  const keyToDate = (key) => new Date(`${key}T12:00:00`);
  const step = (key, delta) => {
    const date = keyToDate(key);
    date.setDate(date.getDate() + delta);
    return dayKeyOf(date);
  };

  let cursor = todayKey;
  if (!keys.has(cursor)) cursor = step(cursor, -1);
  let streak = 0;
  while (keys.has(cursor)) {
    streak += 1;
    cursor = step(cursor, -1);
  }
  return streak;
}

export { DAY_MS, STATE_ORDER };
