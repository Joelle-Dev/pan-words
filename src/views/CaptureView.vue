<template>
  <div class="page">
    <header class="page-head">
      <div class="page-head-copy">
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

        <div class="field field-gap">
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
            <span class="section-meta">能读懂的比例</span>
          </div>
          <p class="card-hint">
            共 {{ coverage.total }} 个词 · {{ coverage.unique }} 个不同词 · 生词 {{ coverage.unknown.length }} 个
          </p>
          <div class="coverage-bar">
            <div class="coverage-fill" :style="{ width: `${coverage.coverage * 100}%` }"></div>
          </div>
        </div>

        <div v-if="coverage.unknown.length" class="card">
          <div class="section-head">
            <h2 class="section-title">生词</h2>
            <button class="text-btn" type="button" @click="toggleAll">
              {{ allPicked ? '全不选' : '全选' }}
            </button>
          </div>
          <div class="unknown-list">
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

      <section v-if="articles.length">
        <div class="section-head">
          <h2 class="section-title">读过的文章</h2>
          <span class="section-meta">{{ articles.length }} 篇</span>
        </div>
        <div class="word-list" style="margin-top: 12px;">
          <button
            v-for="item in articles"
            :key="item.id"
            class="word-row"
            type="button"
            @click="openArticle(item.id)"
          >
            <span class="word-row-main">
              <span class="word-row-label">{{ item.title }}</span>
              <span class="word-row-meaning">{{ articleSummary(item) }}</span>
            </span>
            <span class="word-row-side">
              <span>{{ readAt(item.lastReadAt) }}</span>
            </span>
          </button>
        </div>
      </section>
    </template>

    <!-- 手动加词 -->
    <template v-else-if="tab === 'manual'">
      <div class="card-soft">
        <div class="field">
          <label class="field-label" for="manual-word">单词</label>
          <div class="input-with-action">
            <input
              id="manual-word"
              ref="wordInput"
              v-model="manual.word"
              class="input"
              type="text"
              autocomplete="off"
              autocapitalize="off"
              autocorrect="off"
              spellcheck="false"
              placeholder="skepticism"
              @keydown.enter.prevent="runLookup"
            >
            <button
              class="input-action"
              type="button"
              :disabled="!manual.word.trim() || looking"
              @click="runLookup"
            >
              {{ looking ? '查…' : '自动填' }}
            </button>
          </div>
          <p v-if="lookupNote" class="field-note">{{ lookupNote }}</p>
        </div>

        <div class="field field-gap">
          <label class="field-label" for="manual-meaning">释义</label>
          <input
            id="manual-meaning"
            v-model="manual.meaning"
            class="input"
            type="text"
            placeholder="怀疑，怀疑态度"
          >
        </div>

        <div class="field field-gap">
          <label class="field-label" for="manual-phonetic">音标（可选）</label>
          <input
            id="manual-phonetic"
            v-model="manual.phonetic"
            class="input"
            type="text"
            placeholder="/ˈskeptɪsɪzəm/"
          >
        </div>

        <div v-if="lookupMeanings.length" class="dictionary-hints">
          <div v-for="(item, index) in lookupMeanings" :key="index" class="dictionary-hint">
            <span class="dictionary-pos">{{ item.pos || '—' }}</span>
            <span class="dictionary-def">{{ item.definitions.join(' / ') }}</span>
          </div>
        </div>

        <div class="field field-gap">
          <label class="field-label" for="manual-sentence">原句（可选，会做成挖空卡）</label>
          <textarea
            id="manual-sentence"
            v-model="manual.sentence"
            class="textarea is-short"
            placeholder="The policy was met with widespread skepticism."
            spellcheck="false"
          ></textarea>
        </div>
        <div class="field field-gap">
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
            class="textarea is-tall"
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
        <h2 class="section-title">识别到 {{ importPreview.length }} 行</h2>
        <div class="word-list" style="margin-top: 12px;">
          <div v-for="(row, index) in importPreview.slice(0, 20)" :key="index" class="word-row">
            <span class="word-row-main">
              <span class="word-row-word">{{ row.word }}</span>
              <span class="word-row-meaning">{{ row.meaning || '无释义' }}</span>
            </span>
          </div>
        </div>
        <p v-if="importPreview.length > 20" class="card-hint">
          还有 {{ importPreview.length - 20 }} 行未显示
        </p>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { showToast } from 'vant';
import { useRouter } from 'vue-router';
import { computeCoverage, tokenize } from '../srs/tokenize.js';
import { addWord, importWords, listArticles, saveArticle } from '../lib/repo.js';
import { lookupWord } from '../lib/lookup.js';
import { useLibrary } from '../composables/useLibrary';
import { haptic } from '../utils/haptics.js';
import { parseWordList } from '../utils/wordList.js';

const MODES = [
  { value: 'scan', label: '粘一段文字' },
  { value: 'manual', label: '手动加词' },
  { value: 'import', label: '导入词表' }
];

const router = useRouter();
const library = useLibrary();

const tab = ref('scan');
const scanText = ref('');
const scanTitle = ref('');
const scanning = ref(false);
const coverage = ref(null);
const picked = ref(new Set());

const manual = ref({ word: '', meaning: '', phonetic: '', sentence: '', source: '' });
const wordInput = ref(null);
const looking = ref(false);
const lookupNote = ref('');
const lookupMeanings = ref([]);
let lookupToken = 0;

const importText = ref('');
const importBusy = ref(false);
const articles = ref([]);

const coveragePercent = computed(() => {
  if (!coverage.value) return '0%';
  const value = coverage.value.coverage * 100;
  return value >= 99.95 ? '100%' : `${value.toFixed(1)}%`;
});

const allPicked = computed(() => (
  coverage.value?.unknown.length > 0 && picked.value.size === coverage.value.unknown.length
));

const importEntries = computed(() => parseWordList(importText.value));

onMounted(() => {
  loadArticles();
});
const importPreview = computed(() => importEntries.value);

function setTab(next) {
  tab.value = next;
  lookupNote.value = '';
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
  await loadArticles();
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

async function runLookup() {
  const word = manual.value.word.trim();
  if (!word || looking.value) return;

  const token = ++lookupToken;
  looking.value = true;
  lookupNote.value = '';

  try {
    const result = await lookupWord(word);
    if (token !== lookupToken) return;

    if (!result) {
      lookupNote.value = '没查到，自己填也可以';
      return;
    }

    // 只填空着的字段，不覆盖用户已经输入的内容
    if (!manual.value.meaning.trim() && result.meaning) {
      manual.value.meaning = result.meaning;
    }
    if (!manual.value.phonetic.trim() && result.phonetic) {
      manual.value.phonetic = result.phonetic;
    }
    lookupMeanings.value = result.meanings || [];

    const parts = [];
    if (result.phonetic) parts.push(result.phonetic);
    if (result.pos) parts.push(result.pos);
    lookupNote.value = parts.length
      ? `已补全${result.meaning ? '释义和' : ''}${result.phonetic ? '音标' : '词性'}，可以再改`
      : '查到了英文释义，见下方';
    haptic('light');
  } catch (err) {
    if (token !== lookupToken) return;
    lookupNote.value = err?.message || '查询失败，自己填也可以';
  } finally {
    if (token === lookupToken) looking.value = false;
  }
}

async function addManual() {
  const word = manual.value.word.trim();
  if (!word) return;
  try {
    const result = await addWord({
      word,
      meaning: manual.value.meaning,
      phonetic: manual.value.phonetic,
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
      manual.value = { word: '', meaning: '', phonetic: '', sentence: '', source: '' };
      lookupMeanings.value = [];
      lookupNote.value = '';
    }
  } catch (err) {
    console.error('加词失败', err);
    showToast(err?.message || '没加进去，再试试');
  }
}

function articleSummary(item) {
  const stats = item.stats;
  if (!stats) return '还没读过';
  const percent = (Number(stats.coverage || 0) * 100).toFixed(1);
  const unknown = Math.max(0, Number(stats.unique || 0) - Number(stats.known || 0));
  return `能读懂 ${percent}% · 生词 ${unknown} 个`;
}

function readAt(timestamp) {
  const at = Number(timestamp) || 0;
  if (!at) return '';
  const date = new Date(at);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function openArticle(articleId) {
  router.push(`/read/${articleId}`);
}

async function loadArticles() {
  try {
    articles.value = await listArticles();
  } catch (err) {
    console.error('读取文章列表失败', err);
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
