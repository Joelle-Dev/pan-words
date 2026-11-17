// 在线补全：音标 + 词性 + 中英释义 + 中文翻译。
//
// 两个免费的公开 API，都带 CORS 头（access-control-allow-origin: *）：
//   - dictionaryapi.dev  → 英英释义、音标、词性
//   - mymemory            → 英译中
//
// 设计原则：
//   1. 完全可选。任何一步失败都不能阻塞「加词」这个主流程。
//   2. 结果只做「填进输入框」，用户仍然可以改。绝不静默入库。
//   3. 超时即放弃（2.5s），不让人干等。

const DICT_URL = 'https://api.dictionaryapi.dev/api/v2/entries/en';
const TRANSLATE_URL = 'https://api.mymemory.translated.net/get';
const TIMEOUT_MS = 2500;

async function fetchJson(url, { timeout = TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json' }
    });
    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/** 从 dictionaryapi.dev 的响应里提取最有用的一条 */
export function pickDictionaryEntry(entries) {
  if (!Array.isArray(entries) || !entries.length) return null;
  const first = entries[0];

  let phonetic = first.phonetic || '';
  let audio = '';
  for (const item of first.phonetics || []) {
    if (!phonetic && item.text) phonetic = item.text;
    if (!audio && item.audio) audio = item.audio;
  }

  const meanings = (first.meanings || []).map((meaning) => ({
    pos: meaning.partOfSpeech || '',
    definitions: (meaning.definitions || [])
      .map((item) => item.definition)
      .filter(Boolean)
      .slice(0, 3)
  })).filter((meaning) => meaning.definitions.length);

  if (!meanings.length) return { phonetic, audio, meanings: [] };

  return {
    phonetic,
    audio,
    word: first.word || '',
    meanings
  };
}

function cleanTranslation(text) {
  return String(text || '')
    .replace(/^[a-z]+\.\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 查一个词。
 * 返回 { word, phonetic, audio, meaning, meanings, english }。
 * 查不到时返回 null，调用方自己决定提示什么。
 */
export async function lookupWord(rawWord, { signal } = {}) {
  const word = String(rawWord || '').trim();
  if (!word) return null;

  const encoded = encodeURIComponent(word);
  const translationUrl = `${TRANSLATE_URL}?q=${encoded}&langpair=en%7Czh-CN`;

  // 两个请求并行，互不阻塞
  const [dictResult, transResult] = await Promise.allSettled([
    fetchJson(`${DICT_URL}/${encoded}`),
    fetchJson(translationUrl)
  ]);

  if (signal?.aborted) return null;

  const dict = dictResult.status === 'fulfilled'
    ? pickDictionaryEntry(dictResult.value)
    : null;

  let translation = '';
  if (transResult.status === 'fulfilled') {
    translation = cleanTranslation(transResult.value?.responseData?.translatedText || '');
    // mymemory 查不到时会返回原文
    if (translation.toLowerCase() === word.toLowerCase()) translation = '';
  }

  if (!dict && !translation) {
    const notFound = dictResult.status === 'rejected' && dictResult.reason?.status === 404;
    const error = new Error(notFound ? '没查到这个词' : '查询失败，检查一下网络');
    error.notFound = notFound;
    throw error;
  }

  const firstMeaning = dict?.meanings?.[0];

  return {
    word: dict?.word || word,
    phonetic: dict?.phonetic || '',
    audio: dict?.audio || '',
    pos: firstMeaning?.pos || '',
    english: firstMeaning?.definitions?.[0] || '',
    meanings: dict?.meanings || [],
    meaning: translation
  };
}
