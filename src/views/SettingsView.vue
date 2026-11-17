<template>
  <div class="page">
    <header class="page-head">
      <div class="page-head-copy">
        <h1 class="page-title">我的</h1>
        <p class="page-subtitle">{{ deckName }}</p>
      </div>
    </header>

    <section class="card">
      <h2 class="section-title">每日节奏</h2>

      <div class="field field-gap">
        <label class="field-label" for="new-per-day">每天新词：{{ form.newPerDay }}</label>
        <input
          id="new-per-day"
          v-model.number="form.newPerDay"
          class="input"
          type="range"
          min="5"
          max="60"
          step="5"
        >
      </div>

      <div class="field field-gap">
        <label class="field-label" for="reviews-per-day">每天复习上限：{{ form.reviewsPerDay }}</label>
        <input
          id="reviews-per-day"
          v-model.number="form.reviewsPerDay"
          class="input"
          type="range"
          min="50"
          max="500"
          step="50"
        >
      </div>

      <div class="field field-gap">
        <label class="field-label" for="exam-date">考试日期（可选）</label>
        <input id="exam-date" v-model="form.examDate" class="input" type="date">
      </div>

      <button
        class="primary-btn"
        type="button"
        style="margin-top: 18px;"
        :disabled="!dirty"
        @click="saveDeck"
      >
        {{ dirty ? '保存设置' : '已保存' }}
      </button>
    </section>

    <section class="card">
      <h2 class="section-title">外观</h2>
      <div class="chip-row" style="margin-top: 12px;">
        <button
          v-for="option in THEME_OPTIONS"
          :key="option.key"
          class="chip"
          :class="{ 'is-active': themeMode === option.key }"
          type="button"
          @click="setThemeMode(option.key)"
        >
          {{ option.label }}
        </button>
      </div>
    </section>

    <section class="card">
      <h2 class="section-title">数据</h2>
      <p class="card-hint">
        词库只存在这台设备上。换手机或清理浏览器数据前，记得导出一份。
      </p>
      <p class="card-hint is-strong">{{ backupText }}</p>
      <div style="display: flex; gap: 10px; margin-top: 14px;">
        <button class="secondary-btn" type="button" style="flex: 1;" :disabled="busy" @click="exportData">
          导出备份
        </button>
        <button class="secondary-btn" type="button" style="flex: 1;" :disabled="busy" @click="triggerImport">
          导入备份
        </button>
      </div>
      <input
        ref="fileInput"
        type="file"
        accept=".panbackup,application/json"
        style="display: none;"
        @change="importData"
      >
    </section>

    <section v-if="!standalone" class="card">
      <h2 class="section-title">装到主屏幕</h2>
      <template v-if="isIos">
        <p class="page-subtitle" style="margin-top: 8px;">
          在 Safari 里点「分享」→「添加到主屏幕」。不装的话，系统可能会清掉你的词库。
        </p>
      </template>
      <template v-else>
        <p class="page-subtitle" style="margin-top: 8px;">
          装到主屏幕后，离线也能复习，数据也不容易被清掉。
        </p>
        <button class="secondary-btn" type="button" style="margin-top: 12px;" @click="install">
          安装
        </button>
      </template>
    </section>

    <footer class="page-footer">
      <BrandMark icon-only tiny />
      <span>{{ buildLabel }}</span>
    </footer>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { showConfirmDialog, showToast } from 'vant';
import { useLibrary } from '../composables/useLibrary';
import { THEME_OPTIONS, setThemeMode, themeMode } from '../utils/theme';
import BrandMark from '../components/BrandMark.vue';
import { usePwaInstall } from '../composables/usePwaInstall';
import { backupReminder } from '../utils/backupReminder';
import { getSetting, putRecord, setSetting } from '../lib/db.js';
import { exportBackup, parseBackupFile, restoreBackup } from '../lib/backup.js';
import { haptic } from '../utils/haptics';

const { activeDeck, reload } = useLibrary();
const { standalone, isIos, promptInstall } = usePwaInstall();

const form = ref({
  newPerDay: 20,
  reviewsPerDay: 200,
  examDate: ''
});
const saved = ref({ ...form.value });
const busy = ref(false);
const lastBackupAt = ref(null);
const fileInput = ref(null);

const deckName = computed(() => activeDeck.value?.name || '我的词库');
const dirty = computed(() => (
  form.value.newPerDay !== saved.value.newPerDay ||
  form.value.reviewsPerDay !== saved.value.reviewsPerDay ||
  form.value.examDate !== saved.value.examDate
));

const backupText = computed(() => backupReminder(lastBackupAt.value).text);

const buildLabel = computed(() => {
  const date = new Date(__APP_BUILD_TIME__);
  if (Number.isNaN(date.getTime())) return '';
  return `版本 ${date.toLocaleDateString('zh-CN')}`;
});

function syncForm() {
  if (!activeDeck.value) return;
  form.value = {
    newPerDay: Number(activeDeck.value.newPerDay) || 20,
    reviewsPerDay: Number(activeDeck.value.reviewsPerDay) || 200,
    examDate: activeDeck.value.examDate || ''
  };
  saved.value = { ...form.value };
}

async function saveDeck() {
  if (!activeDeck.value) return;
  const next = {
    ...activeDeck.value,
    newPerDay: Number(form.value.newPerDay) || 20,
    reviewsPerDay: Number(form.value.reviewsPerDay) || 200,
    examDate: form.value.examDate || null
  };
  await putRecord('decks', next);
  saved.value = { ...form.value };
  await reload();
  haptic('success');
  showToast('设置已保存');
}

async function exportData() {
  if (busy.value) return;
  busy.value = true;
  try {
    const result = await exportBackup();
    const now = Date.now();
    await setSetting('lastBackupAt', now);
    lastBackupAt.value = now;
    showToast(result?.mode === 'share' ? '已打开分享' : '备份已导出');
  } catch (err) {
    console.error('导出失败', err);
    showToast('导出失败，再试一次');
  } finally {
    busy.value = false;
  }
}

function triggerImport() {
  fileInput.value?.click?.();
}

async function importData(event) {
  const file = event.target?.files?.[0];
  event.target.value = '';
  if (!file) return;

  try {
    await showConfirmDialog({
      title: '导入备份？',
      message: '会合并到当前词库，重复的词自动跳过。',
      confirmButtonText: '导入',
      cancelButtonText: '算了'
    });
  } catch (err) {
    return;
  }

  busy.value = true;
  try {
    const payload = await parseBackupFile(file);
    const result = await restoreBackup(payload);
    await reload();
    haptic('success');
    showToast(`导入完成：新增 ${result.added} 个词`);
  } catch (err) {
    console.error('导入失败', err);
    showToast(err?.message || '导入失败，检查一下文件');
  } finally {
    busy.value = false;
  }
}

async function install() {
  const ok = await promptInstall();
  if (!ok) showToast('当前浏览器没提供安装入口');
}

async function loadBackupAt() {
  const stored = await getSetting('lastBackupAt', null);
  lastBackupAt.value = stored ? Number(stored) : null;
}

onMounted(async () => {
  syncForm();
  await loadBackupAt();
  await reload();
  syncForm();
});
</script>
