<template>
  <div class="page">
    <header class="page-head">
      <div class="page-head-copy">
        <h1 class="page-title">词库</h1>
        <p class="page-subtitle">{{ deckNotes.length }} 个词 · {{ filtered.length }} 个符合条件</p>
      </div>
      <button class="icon-btn" type="button" aria-label="收词" @click="router.push('/capture')">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true">
          <path d="M12 5.5v13"></path>
          <path d="M5.5 12h13"></path>
        </svg>
      </button>
    </header>

    <div class="search-sticky">
      <input
        v-model="query"
        class="input"
        type="search"
        placeholder="搜单词、释义或来源"
        autocomplete="off"
        autocapitalize="off"
        autocorrect="off"
        spellcheck="false"
      >
      <div class="chip-row" style="margin-top: 8px;">
        <button
          v-for="filter in FILTERS"
          :key="filter.value"
          class="chip"
          :class="{ 'is-active': stateFilter === filter.value }"
          type="button"
          @click="stateFilter = filter.value"
        >
          {{ filter.label }}
        </button>
      </div>
    </div>

    <div v-if="filtered.length" class="word-list">
      <button
        v-for="row in visibleRows"
        :key="row.note.id"
        class="word-row"
        type="button"
        @click="router.push(`/library/${row.note.id}`)"
      >
        <span class="word-row-main">
          <span class="word-row-word">{{ row.note.word }}</span>
          <span class="word-row-meaning">{{ row.note.meaning || '还没填释义' }}</span>
        </span>
        <span class="word-row-side">
          <span class="state-dot" :class="`is-${row.state}`"></span>
          <span v-if="row.dueLabel">{{ row.dueLabel }}</span>
        </span>
      </button>
    </div>

    <div v-else class="empty-hint">
      <strong>{{ query ? '没找到这个词' : '词库还是空的' }}</strong>
      <span v-if="query">换个词试试，或者清空搜索</span>
      <span v-else>去「收词」粘一段原文，Pan 会帮你扫出生词</span>
    </div>

    <div v-if="hasMore" ref="sentinel" class="section-meta" style="text-align: center; padding: 10px 0;">
      下滑加载更多（{{ filtered.length - visibleRows.length }} 个）
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useLibrary } from '../composables/useLibrary';
import { CARD_STATE_LABELS } from '../srs/constants.js';
import { normalizeWord } from '../srs/lemma.js';

const router = useRouter();
const { deckNotes, cards } = useLibrary();

const query = ref('');
const stateFilter = ref('all');
const limit = ref(100);
const sentinel = ref(null);
let observer = null;

const FILTERS = [
  { value: 'all', label: '全部' },
  { value: 'new', label: '新词' },
  { value: 'review', label: '复习中' },
  { value: 'learning', label: '学习中' },
  { value: 'relearning', label: '重学中' }
];

const DAY_MS = 24 * 60 * 60 * 1000;

const cardByNote = computed(() => {
  const map = new Map();
  const priority = { learning: 0, relearning: 1, review: 2, new: 3 };
  for (const card of cards.value) {
    if (card.mode !== 'recognize') continue;
    const existing = map.get(card.noteId);
    if (!existing || (priority[card.state] ?? 9) < (priority[existing.state] ?? 9)) {
      map.set(card.noteId, card);
    }
  }
  return map;
});

function dueLabelFor(card) {
  if (!card || card.state === 'new') return '';
  const diff = Number(card.dueAt) - Date.now();
  if (diff <= 0) return '待复习';
  const days = Math.ceil(diff / DAY_MS);
  return days <= 1 ? '明天' : `${days} 天后`;
}

const rows = computed(() => deckNotes.value.map((note) => {
  const card = cardByNote.value.get(note.id);
  const state = card?.state || 'new';
  return {
    note,
    state,
    stateLabel: CARD_STATE_LABELS[state] || '新词',
    dueLabel: dueLabelFor(card)
  };
}));

const filtered = computed(() => {
  const keyword = query.value.trim().toLowerCase();
  const normalizedKeyword = keyword ? normalizeWord(keyword) : '';
  return rows.value.filter((row) => {
    if (stateFilter.value !== 'all' && row.state !== stateFilter.value) return false;
    if (!keyword) return true;
    const note = row.note;
    const needle = normalizedKeyword || keyword;
    return (
      String(note.word || '').includes(needle) ||
      String(note.lemma || '').includes(needle) ||
      (note.meaning || '').toLowerCase().includes(keyword) ||
      (note.source || '').toLowerCase().includes(keyword)
    );
  });
});

const visibleRows = computed(() => filtered.value.slice(0, limit.value));
const hasMore = computed(() => filtered.value.length > visibleRows.value.length);

watch([query, stateFilter], () => {
  limit.value = 100;
});

function setupObserver() {
  observer = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting) && hasMore.value) {
      limit.value += 100;
    }
  }, { rootMargin: '200px' });
  if (sentinel.value) observer.observe(sentinel.value);
}

watch(sentinel, (el, prev) => {
  if (prev) observer?.unobserve(prev);
  if (el) observer?.observe(el);
});

onMounted(setupObserver);
onUnmounted(() => observer?.disconnect());
</script>
