// 数据访问层：把 IndexedDB 的原语包装成领域动作。
// 所有业务规则都留在 srs/ 里，这里只负责读写。

import {
  deleteNote as deleteNoteRecord,
  getAll,
  getAllByIndex,
  getRecord,
  putMany,
  putRecord,
  writeNote as writeNoteRecord,
  writeReview
} from './db.js';
import { DEFAULT_DECK, RATING } from '../srs/constants.js';
import { newCard, schedule } from '../srs/fsrs.js';
import { lemmaOf, normalizeWord } from '../srs/lemma.js';
import { maskSentence } from '../srs/tokenize.js';

export function uid(prefix = 'id') {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${random}`;
}

export const DEFAULT_DECK_ID = 'default';

export async function ensureDefaultDeck() {
  const existing = await getRecord('decks', DEFAULT_DECK_ID);
  if (existing) return existing;
  const deck = {
    id: DEFAULT_DECK_ID,
    name: '我的词库',
    createdAt: Date.now(),
    ...DEFAULT_DECK
  };
  await putRecord('decks', deck);
  return deck;
}

export async function listDecks() {
  const decks = await getAll('decks');
  return decks.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

export async function listNotes({ deckId = null } = {}) {
  const notes = deckId
    ? await getAllByIndex('notes', 'deckId', IDBKeyRange.only(deckId))
    : await getAll('notes');
  return notes.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export async function listCards() {
  return getAll('cards');
}

export async function listRecentLogs({ limit = 2000 } = {}) {
  const all = await getAll('reviewLog');
  return all.sort((a, b) => (b.reviewedAt || 0) - (a.reviewedAt || 0)).slice(0, limit);
}

export function buildCardsForNote({ note, modes = ['recognize', 'spell', 'cloze'], now = Date.now() }) {
  return modes.map((mode) => newCard({ now, noteId: note.id, deckId: note.deckId, mode }));
}

/**
 * 新增一个词。
 * - lemma 已存在于同一牌组时返回 { duplicate: existingNote }
 * - 支持传入 knownWords 让 lemma 归并更准
 */
export async function addWord({
  word,
  meaning = '',
  phonetic = '',
  pos = '',
  sentence = '',
  source = '',
  deckId = DEFAULT_DECK_ID,
  modes = ['recognize', 'spell', 'cloze'],
  knownWords = null
}) {
  const normalized = normalizeWord(word);
  if (!normalized) throw new Error('先写一个单词吧');

  const siblings = await getAllByIndex('notes', 'deckId', IDBKeyRange.only(deckId));
  const lemma = lemmaOf(normalized, { knownWords });
  const duplicate = siblings.find((item) => item.lemma === lemma);
  if (duplicate) return { duplicate };

  const now = Date.now();
  const note = {
    id: uid('note'),
    deckId,
    word: normalized,
    lemma,
    phonetic: String(phonetic || '').trim(),
    meaning: String(meaning || '').trim(),
    pos: String(pos || '').trim(),
    sentence: String(sentence || '').trim(),
    sentenceBlank: sentence ? maskSentence(sentence, normalized) : '',
    source: String(source || '').trim(),
    tags: [],
    createdAt: now,
    updatedAt: now
  };

  const cards = buildCardsForNote({ note, modes, now });
  await writeNoteRecord({ note, cards });
  return { note, cards };
}

export async function updateWord(noteId, patch) {
  const existing = await getRecord('notes', noteId);
  if (!existing) throw new Error('这个词找不到了');
  const next = { ...existing, ...patch, id: existing.id, updatedAt: Date.now() };
  if (patch.word) {
    next.word = normalizeWord(patch.word);
    next.lemma = patch.lemma ? normalizeWord(patch.lemma) : lemmaOf(next.word);
    if (patch.sentence) next.sentenceBlank = maskSentence(patch.sentence, next.word);
  }
  await putRecord('notes', next);
  return next;
}

export async function deleteWord(noteId) {
  await deleteNoteRecord(noteId);
}

export async function getNote(noteId) {
  return getRecord('notes', noteId);
}

export async function cardsForNote(noteId) {
  return getAllByIndex('cards', 'noteId', IDBKeyRange.only(noteId));
}

/**
 * 提交一次评分。纯逻辑在 fsrs.schedule，这里只负责落库。
 */
export async function submitRating({ card, rating, now = Date.now(), desiredRetention = 0.9 }) {
  const { card: next, log } = schedule({ card, rating, now, desiredRetention });
  await writeReview({
    card: next,
    log,
    settings: [{ key: 'lastReviewedAt', value: now }]
  });
  return { card: next, log };
}

/** 批量导入：把「词 / 释义」列表写进库，自动按 lemma 去重。 */
export async function importWords(entries, { deckId = DEFAULT_DECK_ID, modes } = {}) {
  const siblings = await getAllByIndex('notes', 'deckId', IDBKeyRange.only(deckId));
  const known = new Set(siblings.map((item) => item.lemma));
  const now = Date.now();

  const notes = [];
  const cards = [];
  const duplicates = [];

  for (const entry of entries) {
    const normalized = normalizeWord(entry.word);
    if (!normalized) continue;
    const lemma = lemmaOf(normalized, { knownWords: known });
    if (known.has(lemma)) {
      duplicates.push({ word: normalized, lemma });
      continue;
    }
    known.add(lemma);

    const note = {
      id: uid('note'),
      deckId,
      word: normalized,
      lemma,
      phonetic: String(entry.phonetic || '').trim(),
      meaning: String(entry.meaning || '').trim(),
      pos: String(entry.pos || '').trim(),
      sentence: String(entry.sentence || '').trim(),
      sentenceBlank: entry.sentence ? maskSentence(entry.sentence, normalized) : '',
      source: String(entry.source || '').trim(),
      tags: [],
      createdAt: now + notes.length,
      updatedAt: now + notes.length
    };
    notes.push(note);
    cards.push(...buildCardsForNote({
      note,
      modes: modes || ['recognize', 'spell', 'cloze'],
      now
    }));
  }

  if (notes.length) {
    // 逐条写，保证 note 与 card 成对落库
    for (let i = 0; i < notes.length; i += 1) {
      const note = notes[i];
      await writeNoteRecord({
        note,
        cards: cards.filter((card) => card.noteId === note.id)
      });
    }
  }

  return { added: notes.length, duplicates };
}

export async function saveArticle({ title, text }) {
  const article = {
    id: uid('article'),
    title: String(title || '').trim() || '未命名文章',
    text: String(text || ''),
    createdAt: Date.now(),
    lastReadAt: Date.now(),
    stats: null
  };
  await putRecord('articles', article);
  return article;
}

export async function listArticles() {
  const all = await getAll('articles');
  return all.sort((a, b) => (b.lastReadAt || 0) - (a.lastReadAt || 0));
}

export async function getArticle(articleId) {
  return getRecord('articles', articleId);
}

export async function touchArticle(article, stats = null) {
  const next = { ...article, lastReadAt: Date.now() };
  if (stats) next.stats = stats;
  await putRecord('articles', next);
  return next;
}

export async function bulkPutCards(cards) {
  return putMany('cards', cards);
}

export { RATING };
