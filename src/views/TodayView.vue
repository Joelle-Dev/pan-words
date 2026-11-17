<template>
  <div class="page">
    <header class="page-head">
      <div>
        <h1 class="page-title">今天</h1>
        <p class="page-subtitle">{{ greeting }}</p>
      </div>
      <button class="icon-btn" type="button" aria-label="统计" @click="router.push('/stats')">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M4 19V5"></path>
          <path d="M4 19h16"></path>
          <path d="m8 14 4-4 3 3 5-6"></path>
        </svg>
      </button>
    </header>

    <section class="today-hero">
      <div class="today-hero-top">
        <span class="today-eyebrow">今日待复习</span>
        <span class="state-dot" :class="`is-${heroState}`">{{ heroStateLabel }}</span>
      </div>

      <div class="today-count">
        <strong>{{ load.due }}</strong>
        <span>张 · 另有 {{ remainingNew }} 个新词</span>
      </div>

      <div class="today-meta">
        <span>已复习 <b>{{ todayStats.reviewed }}</b> 张</span>
        <span>今天新学 <b>{{ todayStats.learned }}</b> 个</span>
        <span v-if="streak">连续 <b>{{ streak }}</b> 天</span>
        <span v-if="load.overdue">逾期 <b>{{ load.overdue }}</b> 张</span>
      </div>

      <button
        class="primary-btn"
        type="button"
        :disabled="!hasQueue || loading"
        @click="startReview"
      >
        {{ hasQueue ? '开始复习' : '今天已经清空啦' }}
      </button>
    </section>

    <div v-if="examCountdown" class="exam-strip">
      <span>距考试还有 <b>{{ examCountdown.days }}</b> 天</span>
      <span>每天需要 {{ examCountdown.perDay }} 个新词</span>
    </div>

    <div class="stat-grid">
      <div class="stat-cell">
        <b>{{ counts.words }}</b>
        <small>词条</small>
      </div>
      <div class="stat-cell">
        <b>{{ counts.cards }}</b>
        <small>卡片</small>
      </div>
      <div class="stat-cell">
        <b>{{ remainingNew }}</b>
        <small>今日新词余额</small>
      </div>
    </div>

    <section>
      <div class="page-head">
        <h2 class="page-title" style="font-size: 16px;">最近加的</h2>
        <button class="text-btn" type="button" @click="router.push('/capture')">去收词</button>
      </div>
      <div v-if="recentNotes.length" class="word-list" style="margin-top: 10px;">
        <button
          v-for="note in recentNotes"
          :key="note.id"
          class="word-row"
          type="button"
          @click="router.push(`/library/${note.id}`)"
        >
          <span class="word-row-main">
            <span class="word-row-word">{{ note.word }}</span>
            <span class="word-row-meaning">{{ note.meaning || '还没填释义' }}</span>
          </span>
          <span class="word-row-side">
            <span class="state-dot" :class="`is-${stateFor(note.id)}`">{{ stateLabel(note.id) }}</span>
          </span>
        </button>
      </div>
      <div v-else class="empty-hint">
        <strong>词库还是空的</strong>
        <span>去「收词」粘一段英文，Pan 会帮你扫出生词</span>
        <button class="secondary-btn" type="button" style="margin-top: 8px;" @click="router.push('/capture')">
          粘一段文字
        </button>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useLibrary } from '../composables/useLibrary';
import { CARD_STATE_LABELS } from '../srs/constants.js';
import { greetingForHour } from '../utils/greeting.js';

const router = useRouter();
const {
  ready,
  loading,
  notes,
  cards,
  deckNotes,
  load,
  quota,
  counts,
  streak,
  todayStats,
  activeDeck,
  buildTodayQueue,
  reload
} = useLibrary();

const greeting = computed(() => greetingForHour(new Date().getHours()));

const remainingNew = computed(() => quota.value.remainingNew);

const hasQueue = computed(() => {
  const queue = buildTodayQueue();
  return queue.queue.length > 0;
});

const heroState = computed(() => {
  if (hasQueue.value) return load.value.due > 0 ? 'learning' : 'new';
  return 'review';
});

const heroStateLabel = computed(() => {
  if (!ready.value) return '读取中';
  if (!hasQueue.value) return '今日完成';
  if (load.value.overdue > 0) return '有逾期';
  return '排队中';
});

const recentNotes = computed(() => deckNotes.value.slice(0, 5));

const cardStateByNote = computed(() => {
  const map = new Map();
  for (const card of cards.value) {
    if (card.mode !== 'recognize') continue;
    map.set(card.noteId, card.state);
  }
  return map;
});

function stateFor(noteId) {
  return cardStateByNote.value.get(noteId) || 'new';
}

function stateLabel(noteId) {
  return CARD_STATE_LABELS[stateFor(noteId)] || '新词';
}

const examCountdown = computed(() => {
  const examDate = activeDeck.value?.examDate;
  if (!examDate) return null;
  const target = new Date(`${examDate}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((target - today) / (24 * 60 * 60 * 1000));
  if (days < 0) return { days: 0, perDay: 0 };
  const newCards = notes.value.filter((note) => {
    const card = cardStateByNote.value.get(note.id);
    return !card || card === 'new';
  }).length;
  const perDay = days > 0 ? Math.ceil(newCards / days) : newCards;
  return { days, perDay };
});

function startReview() {
  if (!hasQueue.value) return;
  router.push('/review');
}

onMounted(() => {
  reload().catch((err) => console.error(err));
});
</script>
