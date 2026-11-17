export const DB_NAME = 'pan-db';
export const DB_VERSION = 1;

export const THEME_STORAGE_KEY = 'pan:theme';

export const RATING = Object.freeze({
  AGAIN: 1,
  HARD: 2,
  GOOD: 3,
  EASY: 4
});

export const RATING_LABELS = Object.freeze({
  1: '忘记',
  2: '模糊',
  3: '记得',
  4: '太简单'
});

export const CARD_MODES = Object.freeze(['recognize', 'spell', 'cloze', 'recall', 'listen']);

export const CARD_MODE_LABELS = Object.freeze({
  recognize: '认词',
  spell: '拼写',
  cloze: '挖空',
  recall: '回忆',
  listen: '听写'
});

export const CARD_STATES = Object.freeze(['new', 'learning', 'review', 'relearning']);

export const CARD_STATE_LABELS = Object.freeze({
  new: '新词',
  learning: '学习中',
  review: '复习中',
  relearning: '重学中'
});

export const DEFAULT_DECK = Object.freeze({
  kind: 'reading',
  newPerDay: 20,
  reviewsPerDay: 200,
  desiredRetention: 0.9,
  examDate: null
});

export const PACE = Object.freeze({
  warmupNewPerDay: 15,
  mainNewPerDay: 20,
  sprintNewPerDay: 10,
  finalRetention: 0.92
});
