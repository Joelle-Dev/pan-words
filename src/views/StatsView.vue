<template>
  <div class="page">
    <header class="page-head">
      <div class="page-head-copy">
        <h1 class="page-title">统计</h1>
        <p class="page-subtitle">坚持比速度更重要</p>
      </div>
    </header>

    <div class="stat-grid">
      <div class="stat-cell">
        <b>{{ totalReviewed }}</b>
        <small>累计复习</small>
      </div>
      <div class="stat-cell">
        <b>{{ streak }}</b>
        <small>连续天数</small>
      </div>
      <div class="stat-cell">
        <b>{{ retentionPercent }}</b>
        <small>记忆保持</small>
      </div>
    </div>

    <section class="card">
      <div class="section-head">
        <h2 class="section-title">最近 12 周</h2>
        <span class="section-meta">{{ heatmapTotal }} 次复习</span>
      </div>
      <div class="heatmap">
        <span
          v-for="cell in heatmap"
          :key="cell.key"
          class="heatmap-cell"
          :data-level="cell.level"
          :title="`${cell.key} · ${cell.count} 次`"
        ></span>
      </div>
      <div class="heatmap-legend">
        <span>少</span>
        <span>多</span>
      </div>
    </section>

    <section class="card">
      <h2 class="section-title">卡片状态</h2>
      <div class="dist-list" style="margin-top: 12px;">
        <div v-for="row in stateRows" :key="row.state" class="dist-row">
          <span class="dist-name">{{ row.label }}</span>
          <span class="dist-track">
            <span class="dist-fill" :class="`is-${row.state}`" :style="{ width: `${row.percent}%` }"></span>
          </span>
          <span class="dist-count">{{ row.count }} 张</span>
        </div>
      </div>
    </section>

    <button class="secondary-btn" type="button" @click="generateReport">生成月度小票</button>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { showToast } from 'vant';
import { useLibrary, dayKeyOf } from '../composables/useLibrary';
import { CARD_STATE_LABELS } from '../srs/constants.js';
import { reviewStreak } from '../srs/queue.js';

const { logs, cards, reload } = useLibrary();

onMounted(() => {
  reload().catch((err) => console.error(err));
});

const totalReviewed = computed(() => logs.value.length);

const streak = computed(() => (
  reviewStreak({ logs: logs.value, todayKey: dayKeyOf(new Date()), dayKeyOf })
));

const retentionPercent = computed(() => {
  if (!logs.value.length) return '—';
  const good = logs.value.filter((log) => Number(log.rating) >= 3).length;
  return `${Math.round((good / logs.value.length) * 100)}%`;
});

const heatmapTotal = computed(() => {
  const counts = new Map();
  for (const log of logs.value) {
    const key = dayKeyOf(new Date(Number(log.reviewedAt) || 0));
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.values()].reduce((sum, value) => sum + value, 0);
});

const heatmap = computed(() => {
  const counts = new Map();
  for (const log of logs.value) {
    const key = dayKeyOf(new Date(Number(log.reviewedAt) || 0));
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  const days = 7 * 12;
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const cells = [];

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(today);
    date.setDate(date.getDate() - offset);
    const key = dayKeyOf(date);
    const count = counts.get(key) || 0;
    let level = 0;
    if (count > 0) level = 1;
    if (count >= 5) level = 2;
    if (count >= 15) level = 3;
    if (count >= 30) level = 4;
    cells.push({ key, count, level });
  }

  return cells;
});

const stateRows = computed(() => {
  const counts = { new: 0, learning: 0, review: 0, relearning: 0 };
  for (const card of cards.value) {
    if (card.suspended) continue;
    counts[card.state] = (counts[card.state] || 0) + 1;
  }
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0) || 1;
  return Object.entries(counts).map(([state, count]) => ({
    state,
    label: CARD_STATE_LABELS[state] || state,
    count,
    percent: Math.round((count / total) * 100)
  }));
});

function generateReport() {
  showToast('月度小票正在路上');
}
</script>
