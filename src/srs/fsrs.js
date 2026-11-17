// FSRS-5 调度算法。
//
// 设计约束（与 charge 的纯函数风格一致）：
//   - 不读 Date.now()，时间全部由调用方传入
//   - 不读 Math.random()
//   - 不做个性化参数训练，使用社区默认权重
//
// 参考：open-spaced-repetition / FSRS-5 的公开公式。

export const RATING = Object.freeze({
  AGAIN: 1,
  HARD: 2,
  GOOD: 3,
  EASY: 4
});

// FSRS-5 默认权重，19 个。
export const DEFAULT_WEIGHTS = Object.freeze([
  0.40255, // w0  初始稳定度 AGAIN
  1.18385, // w1  初始稳定度 HARD
  3.173,   // w2  初始稳定度 GOOD
  15.69105, // w3  初始稳定度 EASY
  7.1949,  // w4  初始难度基数
  0.5345,  // w5  初始难度指数
  1.4604,  // w6  难度更新速率
  0.0046,  // w7  难度均值回归
  1.54575, // w8  稳定度增长指数
  0.1192,  // w9  稳定度衰减指数
  1.01925, // w10 稳定度增长因子
  1.9395,  // w11 遗忘稳定度基数
  0.11,    // w12 遗忘稳定度难度指数
  0.29605, // w13 遗忘稳定度 S 指数
  2.2698,  // w14 遗忘稳定度 R 指数
  0.2315,  // w15 HARD 惩罚
  2.9898,  // w16 EASY 奖励
  0.51655, // w17 短期稳定度速率
  0.6621   // w18 短期稳定度偏移
]);

const DECAY = -0.5;
// 令 R(S, S) = 0.9，即「稳定度 = 保持 90% 时可跨越的天数」
const FACTOR = 0.9 ** (1 / DECAY) - 1;

const MIN_STABILITY = 0.1;
const MAX_INTERVAL_DAYS = 36500;
const MIN_REVIEW_INTERVAL_DAYS = 1;
const AGAIN_DELAY_MS = 60 * 1000;
const RELEARN_DELAY_MS = 10 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function initStability(rating, weights = DEFAULT_WEIGHTS) {
  const index = clamp(Math.round(Number(rating) || 1), 1, 4) - 1;
  return Math.max(weights[index], MIN_STABILITY);
}

export function initDifficulty(rating, weights = DEFAULT_WEIGHTS) {
  const grade = clamp(Math.round(Number(rating) || 1), 1, 4);
  const raw = weights[4] - Math.exp(weights[5] * (grade - 1)) + 1;
  return clamp(raw, 1, 10);
}

/** 在 elapsedDays 天后的可回忆概率，0..1 */
export function retrievability(stability, elapsedDays) {
  const s = Math.max(Number(stability) || 0, MIN_STABILITY);
  const t = Math.max(0, Number(elapsedDays) || 0);
  return clamp((1 + FACTOR * t / s) ** DECAY, 0, 1);
}

export function nextDifficulty(difficulty, rating, weights = DEFAULT_WEIGHTS) {
  const grade = clamp(Math.round(Number(rating) || 1), 1, 4);
  const next = difficulty - weights[6] * (grade - 3);
  const reverted = weights[7] * initDifficulty(4, weights) + (1 - weights[7]) * next;
  return clamp(reverted, 1, 10);
}

export function nextRecallStability(
  { difficulty, stability, retrievability: r, rating },
  weights = DEFAULT_WEIGHTS
) {
  const grade = clamp(Math.round(Number(rating) || 1), 1, 4);
  const hardPenalty = grade === 2 ? weights[15] : 1;
  const easyBonus = grade === 4 ? weights[16] : 1;
  const growth = Math.exp(weights[8]) *
    (11 - difficulty) *
    Math.pow(Math.max(stability, MIN_STABILITY), -weights[9]) *
    (Math.exp(weights[10] * (1 - r)) - 1) *
    hardPenalty *
    easyBonus;
  return Math.max(MIN_STABILITY, stability * (1 + growth));
}

export function nextForgetStability(
  { difficulty, stability, retrievability: r },
  weights = DEFAULT_WEIGHTS
) {
  const value = weights[11] *
    Math.pow(difficulty, -weights[12]) *
    (Math.pow(Math.max(stability, MIN_STABILITY) + 1, weights[13]) - 1) *
    Math.exp(weights[14] * (1 - r));
  return Math.max(MIN_STABILITY, value);
}

export function nextShortTermStability(stability, rating, weights = DEFAULT_WEIGHTS) {
  const grade = clamp(Math.round(Number(rating) || 1), 1, 4);
  const value = stability * Math.exp(weights[17] * (grade - 3 + weights[18]));
  return Math.max(MIN_STABILITY, value);
}

/** desiredRetention → 间隔天数（可小数） */
export function intervalDaysFor(stability, desiredRetention = 0.9) {
  const s = Math.max(Number(stability) || 0, MIN_STABILITY);
  const retention = clamp(Number(desiredRetention) || 0.9, 0.7, 0.99);
  const days = (s / FACTOR) * (Math.pow(retention, 1 / DECAY) - 1);
  return clamp(days, 0, MAX_INTERVAL_DAYS);
}

export function elapsedDaysSince(timestamp, now) {
  const from = Number(timestamp) || 0;
  const to = Number(now) || 0;
  if (!from || to <= from) return 0;
  return (to - from) / DAY_MS;
}

/**
 * 新建一张卡。dueAt 立即到期（当天的新词队列）。
 */
export function newCard({ now, noteId, deckId, mode = 'recognize' }) {
  const at = Number(now) || 0;
  return {
    id: `${noteId}:${mode}`,
    noteId,
    deckId,
    mode,
    dueAt: at,
    state: 'new',
    stability: 0,
    difficulty: 0,
    reps: 0,
    lapses: 0,
    lastReviewedAt: null,
    suspended: false
  };
}

function dueAtForReview(now, days) {
  const at = Number(now) || 0;
  const safeDays = Math.max(MIN_REVIEW_INTERVAL_DAYS, Number(days) || MIN_REVIEW_INTERVAL_DAYS);
  return at + Math.round(safeDays * DAY_MS);
}

/**
 * 核心调度：给一张卡和一次评分，算出新卡状态与下个到期时间。
 * 纯函数，返回新对象，不修改入参。
 */
export function schedule({ card, rating, now, desiredRetention = 0.9, weights = DEFAULT_WEIGHTS }) {
  const at = Number(now) || 0;
  const grade = clamp(Math.round(Number(rating) || 1), 1, 4);
  const base = card || newCard({ now: at, noteId: '', deckId: '', mode: 'recognize' });

  const isNew = base.state === 'new' || !base.reps;
  const desired = clamp(Number(desiredRetention) || 0.9, 0.7, 0.99);

  let stability;
  let difficulty;
  let state;
  let dueAt;
  let lapses = Number(base.lapses) || 0;

  if (isNew) {
    difficulty = initDifficulty(grade, weights);
    stability = initStability(grade, weights);
    if (grade === RATING.AGAIN) {
      state = 'learning';
      dueAt = at + AGAIN_DELAY_MS;
    } else {
      state = 'review';
      dueAt = dueAtForReview(at, intervalDaysFor(stability, desired));
    }
  } else {
    const elapsed = elapsedDaysSince(base.lastReviewedAt ?? base.dueAt, at);
    // 「现在」早于上次复习时间（时钟回拨）时，按 0 天处理，永不产生负间隔。
    const elapsedSafe = Math.max(0, elapsed);
    const r = retrievability(base.stability, elapsedSafe);

    // 短期记忆（learning/relearning 且间隔不足一天）走短期稳定度公式
    const isShortTerm = (base.state === 'learning' || base.state === 'relearning') && elapsedSafe < 1;

    if (grade === RATING.AGAIN) {
      stability = nextForgetStability(
        { difficulty: base.difficulty, stability: base.stability, retrievability: r },
        weights
      );
      difficulty = nextDifficulty(base.difficulty, grade, weights);
      state = 'relearning';
      lapses += 1;
      dueAt = at + RELEARN_DELAY_MS;
    } else if (isShortTerm) {
      stability = nextShortTermStability(base.stability, grade, weights);
      difficulty = nextDifficulty(base.difficulty, grade, weights);
      state = 'review';
      dueAt = dueAtForReview(at, Math.max(1, intervalDaysFor(stability, desired)));
    } else {
      stability = nextRecallStability(
        { difficulty: base.difficulty, stability: base.stability, retrievability: r, rating: grade },
        weights
      );
      difficulty = nextDifficulty(base.difficulty, grade, weights);
      state = 'review';
      dueAt = dueAtForReview(at, intervalDaysFor(stability, desired));
    }
  }

  const next = {
    ...base,
    stability: Number(stability.toFixed(4)),
    difficulty: Number(difficulty.toFixed(4)),
    state,
    dueAt,
    reps: (Number(base.reps) || 0) + 1,
    lapses,
    lastReviewedAt: at
  };

  return { card: next, log: buildLog({ card: base, next, rating: grade, now: at }) };
}

function buildLog({ card, next, rating, now }) {
  return {
    id: `${next.id}:${now}`,
    cardId: next.id,
    noteId: next.noteId,
    mode: next.mode,
    rating,
    // 这张卡在被评分的这一刻是否是新卡，用于统计「今天学了多少新词」。
    wasNew: !card.reps,
    prevDueAt: card.dueAt ?? null,
    nextDueAt: next.dueAt,
    reviewedAt: now
  };
}

const PREVIEW_RATINGS = [RATING.AGAIN, RATING.HARD, RATING.GOOD, RATING.EASY];

function formatInterval(days) {
  if (!Number.isFinite(days) || days <= 0) return '<1 天';
  if (days < 1) return `${Math.max(1, Math.round(days * 24 * 60))} 分`;
  if (days < 30) return `${Math.round(days)} 天`;
  if (days < 365) return `${(days / 30).toFixed(1)} 个月`;
  return `${(days / 365).toFixed(1)} 年`;
}

/**
 * 四档评分各自的间隔预览，用于评分按钮上的提示。
 */
export function previewIntervals({ card, now, desiredRetention = 0.9, weights = DEFAULT_WEIGHTS }) {
  const result = {};
  for (const rating of PREVIEW_RATINGS) {
    const { card: next } = schedule({ card, rating, now, desiredRetention, weights });
    const days = (next.dueAt - Number(now)) / DAY_MS;
    result[rating] = { days, label: formatInterval(days) };
  }
  return result;
}

export { DAY_MS, formatInterval };
