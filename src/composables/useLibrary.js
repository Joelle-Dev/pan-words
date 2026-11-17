// 词库与统计的共享状态。
// 用与 charge 一致的「模块级 ref + composable 暴露」写法，不引入 Pinia。

import { computed, ref } from 'vue';
import {
  DEFAULT_DECK_ID,
  cardsForNote,
  ensureDefaultDeck,
  listCards,
  listDecks,
  listNotes,
  listRecentLogs,
  getNote
} from '../lib/repo.js';
import { buildQueue, dailyLoad, reviewStreak, todayProgress } from '../srs/queue.js';
import { RATING } from '../srs/constants.js';

const ready = ref(false);
const loading = ref(false);
const decks = ref([]);
const notes = ref([]);
const cards = ref([]);
const logs = ref([]);
const activeDeckId = ref(DEFAULT_DECK_ID);
const dataVersion = ref(0);

let initPromise = null;

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function dayKeyOf(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export async function loadAll() {
  loading.value = true;
  try {
    const [deckRows, noteRows, cardRows, logRows] = await Promise.all([
      listDecks(),
      listNotes(),
      listCards(),
      listRecentLogs({ limit: 3000 })
    ]);
    decks.value = deckRows;
    notes.value = noteRows;
    cards.value = cardRows;
    logs.value = logRows;
    if (!deckRows.some((deck) => deck.id === activeDeckId.value)) {
      activeDeckId.value = deckRows[0]?.id || DEFAULT_DECK_ID;
    }
    ready.value = true;
    dataVersion.value += 1;
  } finally {
    loading.value = false;
  }
}

export function useLibrary() {
  if (!initPromise) {
    initPromise = (async () => {
      await ensureDefaultDeck();
      await loadAll();
    })().catch((err) => {
      initPromise = null;
      throw err;
    });
  }

  const activeDeck = computed(() => (
    decks.value.find((deck) => deck.id === activeDeckId.value) || decks.value[0] || null
  ));

  const deckNotes = computed(() => (
    activeDeckId.value
      ? notes.value.filter((note) => note.deckId === activeDeckId.value)
      : notes.value
  ));

  const noteById = computed(() => new Map(notes.value.map((note) => [note.id, note])));

  const todayStart = computed(() => startOfToday());

  const todayStats = computed(() => {
    const start = todayStart.value;
    const progress = todayProgress({
      logs: logs.value,
      dayStart: start,
      dayEnd: start + 24 * 60 * 60 * 1000
    });
    return progress;
  });

  const deckCards = computed(() => (
    activeDeckId.value
      ? cards.value.filter((card) => card.deckId === activeDeckId.value)
      : cards.value
  ));

  const load = computed(() => dailyLoad({ cards: deckCards.value, now: Date.now() }));

  const quota = computed(() => {
    const deck = activeDeck.value;
    const newPerDay = Number(deck?.newPerDay) || 20;
    const reviewsPerDay = Number(deck?.reviewsPerDay) || 200;
    const learnedToday = todayStats.value.learned;
    return {
      newPerDay,
      reviewsPerDay,
      remainingNew: Math.max(0, newPerDay - learnedToday)
    };
  });

  function buildTodayQueue(now = Date.now()) {
    const deck = activeDeck.value;
    return buildQueue({
      cards: cards.value,
      now,
      newPerDay: quota.value.remainingNew,
      reviewsPerDay: Number(deck?.reviewsPerDay) || 200,
      deckIds: activeDeckId.value ? [activeDeckId.value] : null
    });
  }

  const streak = computed(() => (
    reviewStreak({ logs: logs.value, todayKey: dayKeyOf(new Date()), dayKeyOf })
  ));

  const counts = computed(() => {
    const activeNotes = deckNotes.value;
    return {
      words: activeNotes.length,
      cards: deckCards.value.length,
      due: load.value.due,
      fresh: load.value.new,
      streak: streak.value
    };
  });

  return {
    ready,
    loading,
    decks,
    notes,
    cards,
    logs,
    activeDeckId,
    activeDeck,
    deckNotes,
    deckCards,
    noteById,
    todayStats,
    quota,
    load,
    counts,
    streak,
    dataVersion,
    buildTodayQueue,
    reload: loadAll,
    getNote
  };
}

export { cardsForNote, RATING };
