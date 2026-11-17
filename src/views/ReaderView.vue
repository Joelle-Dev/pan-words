<template>
  <div class="review-page">
    <header class="review-head">
      <button class="icon-btn" type="button" aria-label="返回" @click="back">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="m15 18-6-6 6-6"></path>
        </svg>
      </button>
      <span class="review-counter" style="flex: 1; text-align: center;">
        {{ coverage ? `能读懂 ${coverageText}` : article?.title || '阅读' }}
      </span>
      <button class="icon-btn" type="button" aria-label="收词" @click="router.push('/capture')">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <path d="M12 5v14"></path>
          <path d="M5 12h14"></path>
        </svg>
      </button>
    </header>

    <div v-if="!article" class="review-done">
      <h2 class="review-done-title">这篇文章找不到了</h2>
      <button class="primary-btn" type="button" style="max-width: 220px;" @click="back">回去</button>
    </div>

    <template v-else>
      <div class="card-soft" style="margin-bottom: 12px;">
        <div class="coverage-head">
          <span class="coverage-value">{{ coverageText }}</span>
          <span class="page-subtitle" style="margin: 0;">可读性</span>
        </div>
        <div class="coverage-bar">
          <div class="coverage-fill" :style="{ width: `${(coverage?.coverage || 0) * 100}%` }"></div>
        </div>
        <p class="page-subtitle" style="margin-top: 8px;">
          生词 {{ coverage?.unknown.length || 0 }} 个 · 点带下划线的词可以加进词库
        </p>
      </div>

      <div class="reader-text" ref="readerRef" @click="onTextClick" v-html="rendered"></div>
    </template>

    <SheetFrame v-model:show="showWordSheet" :title="selected?.word || '加进词库'">
      <div v-if="selected" class="field">
        <label class="field-label">释义</label>
        <div class="input-with-action">
          <input v-model="meaningDraft" class="input" type="text" placeholder="填一个你记得住的中文释义">
          <button class="input-action" type="button" :disabled="looking" @click="lookupSelected">
            {{ looking ? '查…' : '自动填' }}
          </button>
        </div>
        <p v-if="lookupNote" class="field-note">{{ lookupNote }}</p>
      </div>
      <p v-if="selectedSentence" class="page-subtitle" style="margin-top: 10px;">{{ selectedSentence }}</p>
      <button class="primary-btn" type="button" style="margin-top: 16px;" @click="addSelected">
        加入词库
      </button>
    </SheetFrame>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { showToast } from 'vant';
import SheetFrame from '../components/SheetFrame.vue';
import { useLibrary } from '../composables/useLibrary';
import { getArticle, addWord, touchArticle } from '../lib/repo.js';
import { lookupWord } from '../lib/lookup.js';
import { computeCoverage, tokenize } from '../srs/tokenize.js';
import { haptic } from '../utils/haptics';

const route = useRoute();
const router = useRouter();
const library = useLibrary();

const article = ref(null);
const coverage = ref(null);
const rendered = ref('');
const showWordSheet = ref(false);
const selected = ref(null);
const selectedSentence = ref('');
const meaningDraft = ref('');
const looking = ref(false);
const lookupNote = ref('');
const readerRef = ref(null);

const coverageText = computed(() => {
  if (!coverage.value) return '—';
  const value = coverage.value.coverage * 100;
  return value >= 99.95 ? '100%' : `${value.toFixed(1)}%`;
});

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function knownWordSet() {
  const set = new Set();
  for (const note of library.notes.value) {
    if (note.lemma) set.add(note.lemma);
    if (note.word) set.add(note.word);
  }
  return set;
}

function buildRendered(text, known) {
  const tokens = tokenize(text);

  // 标记未知词的区间
  const marks = [];
  for (const token of tokens) {
    if (!token.wordLike || token.skip) continue;
    const knownAll = token.keys.every((key) => known.has(key));
    if (!knownAll) marks.push({ start: token.index, end: token.end, word: token.text });
  }

  let html = '';
  let cursor = 0;
  for (const mark of marks) {
    if (mark.start < cursor) continue;
    html += escapeHtml(text.slice(cursor, mark.start));
    html += `<span class="token-unknown" data-word="${escapeHtml(mark.word)}">${escapeHtml(text.slice(mark.start, mark.end))}</span>`;
    cursor = mark.end;
  }
  html += escapeHtml(text.slice(cursor));

  // 段落化：把换行变成一个换行标签，保持阅读节奏
  return html.replace(/\n{2,}/g, '<br><br>').replace(/\n/g, '<br>');
}

async function onTextClick(event) {
  const target = event.target;
  const word = target?.dataset?.word;
  if (!word) return;
  selected.value = { word };
  meaningDraft.value = '';
  lookupNote.value = '';
  selectedSentence.value = sentenceContaining(article.value?.text || '', word);
  showWordSheet.value = true;
  haptic('light');
  // 打开弹层就顺手查一次，省掉一次点击
  lookupSelected();
}

async function lookupSelected() {
  const word = selected.value?.word;
  if (!word || looking.value) return;
  looking.value = true;
  lookupNote.value = '';
  try {
    const result = await lookupWord(word);
    if (!result) {
      lookupNote.value = '没查到，自己填也可以';
      return;
    }
    if (!meaningDraft.value.trim() && result.meaning) meaningDraft.value = result.meaning;
    const detail = [result.phonetic, result.pos].filter(Boolean).join(' · ');
    lookupNote.value = detail ? `已补全释义（${detail}）` : '已补全释义，可以再改';
  } catch (err) {
    lookupNote.value = err?.message || '查询失败，自己填也可以';
  } finally {
    looking.value = false;
  }
}

function sentenceContaining(text, word) {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const found = sentences.find((sentence) => sentence.toLowerCase().includes(String(word).toLowerCase()));
  return (found || '').trim();
}

async function addSelected() {
  if (!selected.value) return;
  try {
    const result = await addWord({
      word: selected.value.word,
      meaning: meaningDraft.value,
      sentence: selectedSentence.value,
      source: article.value?.title || '',
      knownWords: knownWordSet()
    });
    await library.reload();
    showWordSheet.value = false;
    haptic('success');
    showToast(result.duplicate ? '这个词已经在词库里了' : '加到词库啦');
    if (article.value) {
      await refreshCoverage(article.value);
    }
  } catch (err) {
    console.error('加词失败', err);
    showToast('没加进去，再试试');
  }
}

async function refreshCoverage(current) {
  const known = knownWordSet();
  const tokens = tokenize(current.text);
  const result = computeCoverage({ tokens, knownWords: known });
  coverage.value = result;
  rendered.value = buildRendered(current.text, known);
}

async function load() {
  const id = route.params.articleId;
  const found = await getArticle(id);
  article.value = found || null;
  if (!found) return;
  await refreshCoverage(found);
  const next = await touchArticle(found, {
    tokens: coverage.value.total,
    unique: coverage.value.unique,
    known: coverage.value.known,
    coverage: coverage.value.coverage
  });
  article.value = next;
}

function back() {
  if (window.history.length > 1) router.back();
  else router.replace('/');
}

onMounted(() => {
  load().catch((err) => console.error(err));
});
</script>
