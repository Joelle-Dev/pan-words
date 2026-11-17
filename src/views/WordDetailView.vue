<template>
  <div class="page">
    <header class="page-head">
      <button class="icon-btn" type="button" aria-label="返回" @click="back">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="m14.5 18-6-6 6-6"></path>
        </svg>
      </button>
      <span v-if="note" class="state-dot" :class="`is-${primaryState}`" style="margin-left: auto;">
        {{ stateLabel(primaryState) }}
      </span>
      <button class="icon-btn" type="button" aria-label="发音" @click="playAudio">🔊</button>
    </header>

    <div v-if="note" class="card">
      <div class="field">
        <label class="field-label" for="word">单词</label>
        <div class="input-with-action">
          <input id="word" v-model="form.word" class="input" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">
          <button class="input-action" type="button" :disabled="!form.word.trim() || looking" @click="runLookup">
            {{ looking ? '查…' : '自动填' }}
          </button>
        </div>
        <p v-if="lookupNote" class="field-note">{{ lookupNote }}</p>
      </div>

      <div class="field field-gap">
        <label class="field-label" for="meaning">释义</label>
        <input id="meaning" v-model="form.meaning" class="input" type="text" placeholder="填一个你记得住的中文释义">
      </div>

      <div class="fold" :class="{ 'is-open': moreOpen }">
        <button class="fold-toggle" type="button" @click="moreOpen = !moreOpen">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"></path></svg>
          更多选项（音标 / 原句 / 来源）
        </button>
        <div v-if="moreOpen" class="fold-body">
          <div class="field" style="margin-top: 6px;">
            <label class="field-label" for="phonetic">音标</label>
            <input id="phonetic" v-model="form.phonetic" class="input" type="text" placeholder="/ˈskeptɪsɪzəm/">
          </div>
          <div class="field field-gap">
            <label class="field-label" for="sentence">原句</label>
            <textarea id="sentence" v-model="form.sentence" class="textarea is-short" spellcheck="false"></textarea>
            <p v-if="blankPreview" class="field-note">挖空预览：{{ blankPreview }}</p>
          </div>
          <div class="field field-gap">
            <label class="field-label" for="source">来源</label>
            <input id="source" v-model="form.source" class="input" type="text" placeholder="书名 第 3 章">
          </div>
        </div>
      </div>

      <button
        class="primary-btn"
        type="button"
        style="margin-top: 16px;"
        :disabled="!dirty || saving"
        @click="save"
      >
        {{ saving ? '保存中…' : (dirty ? '保存' : '已保存') }}
      </button>
    </div>

    <div v-if="noteCards.length" class="card">
      <h2 class="section-title">这张词的卡</h2>
      <div class="word-list is-flat" style="margin-top: 10px;">
        <div v-for="card in noteCards" :key="card.id" class="word-row">
          <span class="word-row-main">
            <span class="word-row-label">{{ modeLabel(card.mode) }}</span>
            <span class="word-row-meaning">{{ stabilityLabel(card) }}</span>
          </span>
          <span class="word-row-side">
            <span class="state-dot" :class="`is-${card.state}`">{{ stateLabel(card.state) }}</span>
            <span>{{ dueLabel(card) }}</span>
          </span>
        </div>
      </div>
    </div>

    <button v-if="note" class="text-btn is-danger" type="button" style="align-self: center;" @click="remove">
      删除这个词
    </button>

    <div v-if="!note" class="empty-hint">
      <strong>这个词找不到了</strong>
      <span>可能已经被删掉了</span>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { showConfirmDialog, showToast } from 'vant';
import { useLibrary } from '../composables/useLibrary';
import { cardsForNote, deleteWord, updateWord } from '../lib/repo.js';
import { lookupWord } from '../lib/lookup.js';
import { CARD_MODE_LABELS, CARD_STATE_LABELS } from '../srs/constants.js';
import { maskSentence } from '../srs/tokenize.js';
import { primeSpeech, speak } from '../lib/tts.js';
import { haptic } from '../utils/haptics.js';
import { useUndo } from '../composables/useUndo';

const route = useRoute();
const router = useRouter();
const library = useLibrary();
const { showUndo } = useUndo();

const note = ref(null);
const noteCards = ref([]);
const saving = ref(false);
const looking = ref(false);
const lookupNote = ref('');
const moreOpen = ref(false);
const form = ref({ word: '', meaning: '', phonetic: '', sentence: '', source: '' });

const DAY_MS = 24 * 60 * 60 * 1000;

const dirty = computed(() => {
  if (!note.value) return false;
  return ['word', 'meaning', 'phonetic', 'sentence', 'source']
    .some((key) => (form.value[key] || '') !== (note.value[key] || ''));
});

const blankPreview = computed(() => {
  if (!form.value.sentence) return '';
  return maskSentence(form.value.sentence, form.value.word);
});

const primaryState = computed(() => {
  const card = noteCards.value.find((item) => item.mode === 'recognize') || noteCards.value[0];
  return card?.state || 'new';
});

function modeLabel(mode) {
  return CARD_MODE_LABELS[mode] || mode;
}

function stateLabel(state) {
  return CARD_STATE_LABELS[state] || state;
}

function stabilityLabel(card) {
  if (!card.reps) return '还没开始';
  return `复习 ${card.reps} 次 · ${card.lapses} 次忘记`;
}

function dueLabel(card) {
  if (card.state === 'new') return '新词';
  const diff = Number(card.dueAt) - Date.now();
  if (diff <= 0) return '待复习';
  const days = Math.ceil(diff / DAY_MS);
  return days <= 1 ? '明天' : `${days} 天后`;
}

async function load() {
  const id = route.params.noteId;
  const found = await library.getNote(id);
  note.value = found || null;
  if (found) {
    form.value = {
      word: found.word || '',
      meaning: found.meaning || '',
      phonetic: found.phonetic || '',
      sentence: found.sentence || '',
      source: found.source || ''
    };
  }
  noteCards.value = found ? await cardsForNote(id) : [];
  moreOpen.value = Boolean(found && (found.phonetic || found.sentence || found.source));
}

async function runLookup() {
  const word = form.value.word.trim();
  if (!word || looking.value) return;
  looking.value = true;
  lookupNote.value = '';
  try {
    const result = await lookupWord(word);
    if (!result) {
      lookupNote.value = '没查到，自己填也可以';
      return;
    }
    if (!form.value.meaning.trim() && result.meaning) form.value.meaning = result.meaning;
    if (!form.value.phonetic.trim() && result.phonetic) form.value.phonetic = result.phonetic;
    lookupNote.value = result.meaning || result.phonetic ? '已补全，记得保存' : '只查到英文释义';
    haptic('light');
  } catch (err) {
    lookupNote.value = err?.message || '查询失败，自己填也可以';
  } finally {
    looking.value = false;
  }
}

async function save() {
  if (!note.value || saving.value) return;
  saving.value = true;
  try {
    const next = await updateWord(note.value.id, { ...form.value });
    note.value = next;
    await library.reload();
    haptic('success');
    showToast('保存好了');
  } catch (err) {
    console.error('保存失败', err);
    showToast('没保存成功，再试一次');
  } finally {
    saving.value = false;
  }
}

async function remove() {
  if (!note.value) return;
  const target = note.value;
  try {
    await showConfirmDialog({
      title: '删除这个词？',
      message: `「${target.word}」和它的卡片都会删掉，无法恢复。`,
      confirmButtonText: '删除',
      cancelButtonText: '算了'
    });
  } catch (err) {
    return;
  }

  const cards = noteCards.value;
  await deleteWord(target.id);
  await library.reload();
  haptic('warning');
  router.replace('/library');

  showUndo(`已删除「${target.word}」`, async () => {
    const { putMany, putRecord } = await import('../lib/db.js');
    await putRecord('notes', target);
    await putMany('cards', cards);
    await library.reload();
  });
}

function playAudio() {
  if (!form.value.word) return;
  primeSpeech();
  speak(form.value.word, { rate: 0.85 });
}

function back() {
  if (window.history.length > 1) router.back();
  else router.replace('/library');
}

watch(() => route.params.noteId, load);

onMounted(load);
</script>
