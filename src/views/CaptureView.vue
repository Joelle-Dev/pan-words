<template>
  <div class="page">
    <header class="page-head">
      <div>
        <h1 class="page-title">收词</h1>
        <p class="page-subtitle">粘一段英文，扫出你还不认识的词</p>
      </div>
    </header>

    <div class="chip-row">
      <button
        v-for="mode in MODES"
        :key="mode.value"
        class="chip"
        :class="{ 'is-active': tab === mode.value }"
        type="button"
        @click="setTab(mode.value)"
      >
        {{ mode.label }}
      </button>
    </div>

    <!-- 扫描 -->
    <template v-if="tab === 'scan'">
      <div class="card-soft">
        <div class="field">
          <label class="field-label" for="scan-text">原文</label>
          <textarea
            id="scan-text"
            v-model="scanText"
            class="textarea"
            placeholder="把一章原文、一篇文章、一段新闻粘进来…"
            spellcheck="false"
          ></textarea>
        </div>

        <div class="field" style="margin-top: 12px;">
          <label class="field-label" for="scan-title">标题（可选，会存进阅读列表）</label>
          <input
            id="scan-title"
            v-model="scanTitle"
            class="input"
            type="text"
            placeholder="比如：The Economist 2026-05"
          >
        </div>

        <button
          class="primary-btn"
          type="button"
          style="margin-top: 14px;"
          :disabled="!scanText.trim() || scanning"
          @click="runScan"
        >
          {{ scanning ? '正在扫…' : '看看覆盖率和生词' }}
        </button>
      </div>

      <template v-if="coverage">
        <div class="card">
          <div class="coverage-head">
            <span class="coverage-value">{{ coveragePercent }}</span>
            <span class="page-subtitle" style="margin: 0;">你能读懂的比例</span>
          </div>
          <p class="page-subtitle" style="margin-top: 6px;">
            共 {{ coverage.total }} 个词 · {{ coverage.unique }} 个不同词 · 生词 {{ coverage.unknown.length }} 个
          </p>
          <div class="coverage-bar">
            <div class="coverage-fill" :style="{ width: `${coverage.coverage * 100}%` }"></div>
          </div>
        </div>

        <div v-if="coverage.unknown.length" class="card">
          <div class="page-head">
            <h2 class="page-title" style="font-size: 16px;">生词</h2>
            <button class="text-btn" type="button" @click="toggleAll">
              {{ allPicked ? '全不选' : '全选' }}
            </button>
          </div>
          <div class="unknown-list" style="margin-top: 12px;">
            <button
              v-for="item in coverage.unknown"
              :key="item.lemma"
              class="unknown-word"
              :class="{ 'is-picked': picked.has(item.lemma) }"
              type="button"
              @click="togglePick(item.lemma)"
            >
              {{ item.word }}
              <small>{{ item.count }}</small>
            </button>
          </div>
          <button
            class="primary-btn"
            type="button"
            style="margin-top: 16px;"
            :disabled="!picked.size"
            @click="addPickedWords"
          >
            加入词库（{{ picked.size }} 个）
          </button>
        </div>

        <div v-else class="empty-hint">
          <strong>这一篇没有生词</strong>
          <span>你要么太厉害，要么词库已经覆盖了它</span>
        </div>
      </template>
    </template>

    <!-- 手动加词 -->
    <template v-else-if="tab === 'manual'">
      <div class="card-soft">
        <div class="field">
          <label class="field-label" for="manual-word">单词</label>
          <input
            id="manual-word"
            v-model="manual.word"
            class="input"
            type="text"
            autocomplete="off"
            autocapitalize="off"
            autocorrect="off"
            spellcheck="false"
            placeholder="skepticism"
          >
        </div>
        <div class="field" style="margin-top: 12px;">
          <label class="field-label" for="manual-meaning">释义</label>
          <input
            id="manual-meaning"
            v-model="manual.meaning"
            class="input"
            type="text"
            placeholder="怀疑，怀疑态度"
          >
        </div>
        <div class="field" style="margin-top: 12px;">
          <label class="field-label" for="manual-sentence">原句（可选，会做成挖空卡）</label>
          <textarea
            id="manual-sentence"
            v-model="manual.sentence"
            class="textarea"
            style="min-height: 74px;"
            placeholder="The policy was met with widespread skepticism."
            spellcheck="false"
          ></textarea>
        </div>
        <div class="field" style="margin-top: 12px;">
          <label class="field-label" for="manual-source">来源（可选）</label>
          <input
            id="manual-source"
            v-model="manual.source"
            class="input"
            type="text"
            placeholder="书名 第 3 章"
          >
        </div>
        <button
          class="primary-btn"
          type="button"
          style="margin-top: 16px;"
          :disabled="!manual.word.trim()"
          @click="addManual"
        >
          加进词库
        </button>
      </div>
    </template>

    <!-- 导入词表 -->
    <template v-else>
      <div class="card-soft">
        <div class="field">
          <label class="field-label" for="import-text">词表</label>
          <textarea
            id="import-text"
            v-model="importText"
            class="textarea"
            style="min-height: 180px;"
            placeholder="每行一个词，支持这几种格式：&#10;abandon​放弃&#10;abandon - 放弃&#10;abandon,放弃,n.&#10;abandon"
            spellcheck="false"
          ></textarea>
        </div>
        <button
          class="primary-btn"
          type="button"
          style="margin-top: 14px;"
          :disabled="!importEntries.length"
          @click="runImport"
        >
          导入 {{ importEntries.length }} 个词
        </button>
      </div>

      <div v-if="importPreview.length" class="card">
        <h2 class="page-title" style="font-size: 16px;">识别到 {{ importPreview.length }} 行</h2>
        <div class="word-list" style="margin-top: 10px;">
          <div v-for="(row, index) in importPreview.slice(0, 20)" :key="index" class="word-row">
            <span class="word-row-main">
              <span class="word-row-word">{{ row.word }}</span>
              <span class="word-row-meaning">{{ row.meaning || '无释义' }}</span>
            </span>
          </div>
        </div>
        <p v-if="importPreview.length > 20" class="page-subtitle" style="margin-top: 8px;">
          还有 {{ importPreview.length - 20 }} 行未显示
        </p>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { showToast } from 'vant';
import { computeCoverage, tokenize } from '../srs/tokenize.js';
import { addWord, importWords, saveArticle } from '../lib/repo.js';
import { useLibrary } from '../composables/useLibrary';
import { haptic } from '../utils/haptics.js';
import { parseWordList } from '../utils/wordList.js';

const MODES = [
  { value: 'scan', label: '粘一段文字' },
  { value: 'manual', label: '手动加词' },
  { value: 'import', label: '导入词表' }
];

const library = useLibrary();

const tab = ref('scan');
const scanText = ref('');
const scanTitle = ref('');
const scanning = ref(false);
const coverage = ref(null);
const picked = ref(new Set());

const manual = ref({ word: '', meaning: '', sentence: '', source: '' });

const importText = ref('');
const importBusy = ref(false);

const coveragePercent = computed(() => {
  if (!coverage.value) return '0%';
  const value = coverage.value.coverage * 100;
  return value >= 99.95 ? '100%' : `${value.toFixed(1)}%`;
});

const allPicked = computed(() => (
  coverage.value?.unknown.length > 0 && picked.value.size === coverage.value.unknown.length
));

const importEntries = computed(() => parseWordList(importText.value));
const importPreview = computed(() => importEntries.value);

function setTab(next) {
  tab.value = next;
  haptic('light');
}

function togglePick(lemma) {
  const next = new Set(picked.value);
  if (next.has(lemma)) next.delete(lemma);
  else next.add(lemma);
  picked.value = next;
  haptic('light');
}

function toggleAll() {
  if (allPicked.value) {
    picked.value = new Set();
    return;
  }
  picked.value = new Set((coverage.value?.unknown || []).map((item) => item.lemma));
}

function knownWordSet() {
  const set = new Set();
  for (const note of library.notes.value) {
    if (note.lemma) set.add(note.lemma);
    if (note.word) set.add(note.word);
  }
  return set;
}

function runScan() {
  const text = scanText.value.trim();
  if (!text) return;
  scanning.value = true;
  try {
    const tokens = tokenize(text);
    const result = computeCoverage({ tokens, knownWords: knownWordSet() });
    coverage.value = result;
    picked.value = new Set(result.unknown.slice(0, 30).map((item) => item.lemma));
    haptic('success');
  } catch (err) {
    console.error('扫描失败', err);
    showToast('扫描没成功，再试一次');
  } finally {
    scanning.value = false;
  }
}

async function addPickedWords() {
  const text = scanText.value.trim();
  const unknown = coverage.value?.unknown || [];
  const chosen = unknown.filter((item) => picked.value.has(item.lemma));
  if (!chosen.length) return;

  let added = 0;
  let duplicates = 0;

  for (const item of chosen) {
    const sentence = sentenceFor(item);
    try {
      const result = await addWord({
        word: item.word,
        sentence,
        source: scanTitle.value.trim(),
        knownWords: knownWordSet()
      });
      if (result.duplicate) duplicates += 1;
      else added += 1;
    } catch (err) {
      console.error('加词失败', err);
    }
  }

  if (text) {
    try {
      await saveArticle({ title: scanTitle.value, text });
    } catch (err) {
      console.error('保存文章失败', err);
    }
  }

  await library.reload();
  haptic('success');
  showToast(`加了 ${added} 个词${duplicates ? `，${duplicates} 个已存在` : ''}`);
  picked.value = new Set();
  coverage.value = null;
}

function sentenceFor(item) {
  const text = scanText.value;
  const sentences = text.split(/(?<=[.!?])\s+/);
  const index = Math.min(item.firstSentenceIndex || 0, sentences.length - 1);
  return (sentences[index] || '').trim();
}

async function addManual() {
  const word = manual.value.word.trim();
  if (!word) return;
  try {
    const result = await addWord({
      word,
      meaning: manual.value.meaning,
      sentence: manual.value.sentence,
      source: manual.value.source,
      knownWords: knownWordSet()
    });
    await library.reload();
    haptic('success');
    if (result.duplicate) {
      showToast('这个词已经在词库里了');
    } else {
      showToast('加到词库啦');
      manual.value = { word: '', meaning: '', sentence: '', source: '' };
    }
  } catch (err) {
    console.error('加词失败', err);
    showToast(err?.message || '没加进去，再试试');
  }
}

async function runImport() {
  const entries = importEntries.value;
  if (!entries.length || importBusy.value) return;
  importBusy.value = true;
  try {
    const result = await importWords(entries);
    await library.reload();
    haptic('success');
    showToast(`导入 ${result.added} 个${result.duplicates.length ? `，跳过 ${result.duplicates.length} 个重复` : ''}`);
    importText.value = '';
  } catch (err) {
    console.error('导入失败', err);
    showToast('导入没成功，检查一下格式');
  } finally {
    importBusy.value = false;
  }
}
</script>
