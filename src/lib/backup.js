// 备份格式：单行 JSON manifest + 数据行。
// 与 charge 的 backupFormat 思路一致（可流式校验），但内容是 Pan 的领域数据。

import { getAll, putMany, putRecord } from './db.js';
import { uid } from './repo.js';

export const BACKUP_APP = 'pan-words';
export const BACKUP_KIND = 'full';
export const BACKUP_SCHEMA_VERSION = 1;
export const BACKUP_EXTENSION = '.panbackup';

function downloadText(text, filename, mime = 'application/json') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function stamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

/** 导出全部数据 */
export async function exportBackup() {
  const [decks, notes, cards, reviewLog, articles] = await Promise.all([
    getAll('decks'),
    getAll('notes'),
    getAll('cards'),
    getAll('reviewLog'),
    getAll('articles')
  ]);

  const payload = {
    app: BACKUP_APP,
    kind: BACKUP_KIND,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    decks,
    notes,
    cards,
    reviewLog,
    articles
  };

  const filename = `pan-words-${stamp()}${BACKUP_EXTENSION}`;
  downloadText(JSON.stringify(payload, null, 2), filename);
  return { mode: 'download', filename, notes: notes.length };
}

export async function parseBackupFile(file) {
  const text = await file.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch (err) {
    throw new Error('这个文件不是 JSON 备份');
  }
  if (payload?.app !== BACKUP_APP) {
    throw new Error('这不是 Pan 的备份文件');
  }
  if (!Array.isArray(payload.notes)) {
    throw new Error('备份里没有词条数据');
  }
  return payload;
}

/**
 * 合并导入：按 lemma 去重，跳过已存在的词。
 * 不做覆盖删除，避免误伤当前数据。
 */
export async function restoreBackup(payload) {
  const existingNotes = await getAll('notes');
  const existingLemmas = new Set(existingNotes.map((note) => note.lemma));
  const existingNoteIds = new Set(existingNotes.map((note) => note.id));

  const incomingNotes = [];
  const idMap = new Map();

  for (const note of payload.notes || []) {
    if (!note?.lemma || existingLemmas.has(note.lemma)) continue;
    existingLemmas.add(note.lemma);
    const nextId = existingNoteIds.has(note.id) ? uid('note') : note.id;
    idMap.set(note.id, nextId);
    incomingNotes.push({ ...note, id: nextId });
  }

  const incomingCards = (payload.cards || [])
    .filter((card) => idMap.has(card.noteId))
    .map((card) => ({
      ...card,
      id: `${idMap.get(card.noteId)}:${card.mode}`,
      noteId: idMap.get(card.noteId)
    }));

  const incomingLogs = (payload.reviewLog || [])
    .filter((log) => idMap.has(log.noteId))
    .map((log) => ({
      ...log,
      cardId: `${idMap.get(log.noteId)}:${log.mode}`,
      noteId: idMap.get(log.noteId)
    }));

  if (incomingNotes.length) await putMany('notes', incomingNotes);
  if (incomingCards.length) await putMany('cards', incomingCards);
  if (incomingLogs.length) await putMany('reviewLog', incomingLogs);

  const existingDecks = await getAll('decks');
  const deckIds = new Set(existingDecks.map((deck) => deck.id));
  for (const deck of payload.decks || []) {
    if (deckIds.has(deck.id)) continue;
    await putRecord('decks', deck);
  }

  return { added: incomingNotes.length };
}
