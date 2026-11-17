<template>
  <div class="review-page">
    <header class="review-head">
      <button class="icon-btn" type="button" aria-label="退出复习" @click="quit">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true">
          <path d="M18 6 6 18M6 6l12 12"></path>
        </svg>
      </button>
      <div class="review-progress">
        <div class="review-progress-fill" :style="{ width: `${progressPercent}%` }"></div>
      </div>
      <span class="review-counter">{{ doneCount }}/{{ totalCount }}</span>
    </header>

    <div v-if="loading" class="review-stage">
      <LoadingState text="正在准备今天的队列…" />
    </div>

    <div v-else-if="!current" class="review-stage">
      <div v-if="doneCount" class="review-done">
        <span class="done-star" aria-hidden="true">✦</span>
        <h2 class="review-done-title">今日完成 {{ doneCount }} 个</h2>
        <p class="review-done-text">用时 {{ elapsedLabel }} · 准确率 {{ accuracyPercent }}</p>

        <div class="done-dist">
          <div
            v-for="item in distribution"
            :key="item.rating"
            class="done-dist-cell"
            :data-rating="item.rating"
          >
            <b>{{ item.count }}</b>
            <small>{{ item.label }}</small>
          </div>
        </div>

        <p v-if="streak" class="done-streak">连续打卡 <b>{{ streak }}</b> 天 🔥</p>

        <div class="done-actions">
          <button class="primary-btn" type="button" @click="quit">回到今天</button>
          <button class="secondary-btn" type="button" @click="studyMore">再学一轮</button>
        </div>
      </div>

      <div v-else class="review-done">
        <h2 class="review-done-title">现在没有要复习的</h2>
        <p class="review-done-text">去「收词」加几个词，或者明天再来。</p>
        <button class="primary-btn" type="button" style="max-width: 240px;" @click="quit">
          回到今天
        </button>
      </div>
    </div>

    <template v-else>
      <div class="review-stage">
        <div class="review-card" :class="{ 'is-flipping': flipping }">
          <span class="review-mode">{{ modeLabel }}</span>

          <button
            v-if="current.mode === 'listen'"
            class="icon-btn"
            type="button"
            aria-label="再听一次"
            @click="playAudio"
          >🔊</button>

          <p
            v-if="current.mode !== 'cloze' && displayWord"
            class="review-word"
            :class="{ 'is-long': displayWord.length > 14 }"
          >
            {{ displayWord }}
          </p>

          <p v-if="current.mode === 'cloze'" class="review-sentence">
            {{ clozeSentence }}
          </p>

          <div v-if="current.mode === 'spell'" class="review-answer">
            <input
              ref="spellInput"
              v-model="spellValue"
              class="spell-input"
              :class="spellStateClass"
              type="text"
              inputmode="text"
              autocomplete="off"
              autocapitalize="off"
              autocorrect="off"
              spellcheck="false"
              :placeholder="revealed ? '' : '按听写拼出来'"
              :disabled="revealed"
              @keydown.enter.prevent="reveal"
            >
            <p v-if="revealed" class="spell-diff" v-html="spellDiffHtml"></p>
          </div>

          <template v-if="revealed">
            <p v-if="note?.phonetic" class="review-extra">{{ note.phonetic }}</p>
            <p v-if="note?.sentence && current.mode !== 'cloze'" class="review-sentence">{{ note.sentence }}</p>
            <div class="review-divider"></div>
            <p class="review-meaning">{{ note?.meaning || '还没填释义' }}</p>
            <p v-if="reviewFacts" class="review-facts">{{ reviewFacts }}</p>
            <p v-if="current.mode === 'recognize' && note?.sentenceBlank && !note?.sentence" class="review-extra">
              {{ note.sentenceBlank }}
            </p>
          </template>

          <button
            v-else
            class="primary-btn review-reveal"
            type="button"
            @click="reveal"
          >
            想好了，看答案
          </button>
        </div>
      </div>

      <RatingBar :preview="revealed ? preview : null" :show-preview="showPreview" @rate="rate" />
    </template>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import RatingBar from '../components/RatingBar.vue';
import LoadingState from '../components/LoadingState.vue';
import { useLibrary } from '../composables/useLibrary';
import { CARD_MODE_LABELS, RATING_LABELS } from '../srs/constants.js';
import { RATING, previewIntervals } from '../srs/fsrs.js';
import { submitRating } from '../lib/repo.js';
import { haptic } from '../utils/haptics.js';
import { primeSpeech, speak, supportsSpeech } from '../lib/tts.js';

const router = useRouter();
const { ready, noteById, activeDeck, buildTodayQueue, reload, streak } = useLibrary();

const loading = ref(true);
const queue = ref([]);
const index = ref(0);
const revealed = ref(false);
const flipping = ref(false);
const spellValue = ref('');
const spellInput = ref(null);
const doneCount = ref(0);
const showPreview = ref(false);
const spellingCorrect = ref(null);
const repeatCount = ref(new Map());
const startedAt = ref(0);
const elapsedMs = ref(0);
const ratingCounts = ref({ 1: 0, 2: 0, 3: 0, 4: 0 });

const current = computed(() => queue.value[index.value] || null);
const note = computed(() => (current.value ? noteById.value.get(current.value.noteId) : null));

const totalCount = computed(() => queue.value.length);
const progressPercent = computed(() => (
  totalCount.value ? Math.round((doneCount.value / totalCount.value) * 100) : 0
));

const modeLabel = computed(() => CARD_MODE_LABELS[current.value?.mode] || '认词');

// 揭晓后的小字信息（词性 / 来源）合并成一行
const reviewFacts = computed(() => {
  if (!note.value) return '';
  return [note.value.pos, note.value.source].filter(Boolean).join(' · ');
});

const displayWord = computed(() => {
  if (!current.value) return '';
  if (!revealed.value) {
    if (current.value.mode === 'listen') return '听一听，这是哪个词';
    if (current.value.mode === 'spell') return '';
    return note.value?.word || '';
  }
  return note.value?.word || '';
});

const clozeSentence = computed(() => {
  if (!note.value) return '';
  if (revealed.value) {
    return note.value.sentence || note.value.sentenceBlank || '';
  }
  return note.value.sentenceBlank || note.value.sentence || '';
});

const preview = computed(() => {
  if (!current.value) return null;
  return previewIntervals({
    card: current.value,
    now: Date.now(),
    desiredRetention: Number(activeDeck.value?.desiredRetention) || 0.9
  });
});

const spellStateClass = computed(() => {
  if (!revealed.value) return '';
  if (spellingCorrect.value === true) return 'is-right';
  if (spellingCorrect.value === false) return 'is-wrong';
  return '';
});

const spellDiffHtml = computed(() => {
  const expected = String(note.value?.word || '');
  const actual = String(spellValue.value || '').trim();
  if (!expected) return '';
  if (actual.toLowerCase() === expected.toLowerCase()) {
    return `<span style="color: var(--success)">拼写正确</span>`;
  }
  const limit = Math.max(expected.length, actual.length);
  let html = '';
  for (let i = 0; i < limit; i += 1) {
    const want = expected[i] || '';
    const got = actual[i] || '';
    if (!got) {
      html += `<span class="extra">${escapeHtml(want)}</span>`;
    } else if (!want) {
      html += `<span class="miss">${escapeHtml(got)}</span>`;
    } else if (want.toLowerCase() !== got.toLowerCase()) {
      html += `<span class="miss">${escapeHtml(got)}</span>`;
    } else {
      html += escapeHtml(got);
    }
  }
  return `正确拼写：<b>${escapeHtml(expected)}</b><br>${html}`;
});

// 结算：本次会话用时 / 准确率 / 四档分布
const elapsedLabel = computed(() => {
  const total = Math.round((elapsedMs.value || 0) / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
});

const accuracyPercent = computed(() => {
  const total = Object.values(ratingCounts.value).reduce((sum, value) => sum + value, 0);
  if (!total) return '—';
  const good = (ratingCounts.value[3] || 0) + (ratingCounts.value[4] || 0);
  return `${Math.round((good / total) * 100)}%`;
});

const distribution = computed(() => (
  [1, 2, 3, 4].map((rating) => ({
    rating,
    label: RATING_LABELS[rating],
    count: ratingCounts.value[rating] || 0
  }))
));

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function resetCardState() {
  revealed.value = false;
  spellValue.value = '';
  spellingCorrect.value = null;
  flipping.value = false;
}

async function reveal() {
  if (!current.value || revealed.value) return;
  if (current.value.mode === 'spell') {
    const expected = String(note.value?.word || '').trim().toLowerCase();
    const actual = String(spellValue.value || '').trim().toLowerCase();
    spellingCorrect.value = Boolean(expected) && expected === actual;
  }
  revealed.value = true;
  haptic('light');
  if (current.value.mode === 'listen') playAudio();
}

async function playAudio() {
  if (!supportsSpeech()) return;
  primeSpeech();
  speak(note.value?.word || '', { rate: 0.85 });
}

async function rate(rating) {
  if (!current.value) return;
  const card = current.value;
  haptic(rating === RATING.AGAIN ? 'warning' : 'light');

  let next = null;
  try {
    const result = await submitRating({
      card,
      rating,
      now: Date.now(),
      desiredRetention: Number(activeDeck.value?.desiredRetention) || 0.9
    });
    next = result.card;
  } catch (err) {
    console.error('保存复习结果失败', err);
  }

  // 学习和重学中的卡要在本轮内再出现一次，否则「忘记」等于逃避。
  // 上限 5 次，避免用户一直点忘记被困在同一张卡上。
  if (next && (next.state === 'learning' || next.state === 'relearning')) {
    const seen = repeatCount.value.get(next.id) || 0;
    if (seen < 5) {
      repeatCount.value.set(next.id, seen + 1);
      queue.value.push(next);
    }
  }

  doneCount.value += 1;
  ratingCounts.value = {
    ...ratingCounts.value,
    [rating]: (ratingCounts.value[rating] || 0) + 1
  };
  flipping.value = true;
  await new Promise((resolve) => setTimeout(resolve, 200));
  index.value += 1;
  resetCardState();

  if (!current.value) elapsedMs.value = Date.now() - startedAt.value;

  if (current.value?.mode === 'spell') {
    await nextTick();
    spellInput.value?.focus?.();
  } else if (current.value?.mode === 'listen') {
    playAudio();
  }
}

function quit() {
  reload().catch(() => {});
  router.replace('/');
}

async function studyMore() {
  await reload();
  const { queue: built } = buildTodayQueue();
  if (!built.length) {
    quit();
    return;
  }
  queue.value = built;
  index.value = 0;
  doneCount.value = 0;
  ratingCounts.value = { 1: 0, 2: 0, 3: 0, 4: 0 };
  elapsedMs.value = 0;
  startedAt.value = Date.now();
  resetCardState();
  if (built[0]?.mode === 'spell') {
    await nextTick();
    spellInput.value?.focus?.();
  }
}

function onKey(event) {
  if (!current.value) return;
  if (event.key === ' ' || event.key === 'Enter') {
    if (!revealed.value) {
      event.preventDefault();
      reveal();
    }
    return;
  }
  if (revealed.value && ['1', '2', '3', '4'].includes(event.key)) {
    event.preventDefault();
    rate(Number(event.key));
  }
}

onMounted(async () => {
  document.addEventListener('keydown', onKey);

  // 兜底：IndexedDB 被其他标签页占住时 openDB 会一直挂着，
  // 不能让用户永远看着转圈。
  let safety = setTimeout(() => {
    if (loading.value) loading.value = false;
  }, 4000);

  try {
    await reload();
    const { queue: built } = buildTodayQueue();
    queue.value = built;
    if (built.length) startedAt.value = Date.now();
  } catch (err) {
    console.error('准备复习队列失败', err);
  } finally {
    clearTimeout(safety);
    loading.value = false;
    if (current.value?.mode === 'spell') {
      await nextTick();
      spellInput.value?.focus?.();
    }
  }
});

onUnmounted(() => {
  document.removeEventListener('keydown', onKey);
});
</script>
