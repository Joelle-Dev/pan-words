// 英语分词、分句与覆盖率计算。
//
// 全部基于浏览器内置的 Intl.Segmenter，不引入任何依赖。
// 实测需要处理的真实情况（不要靠臆测，用真实文章当测试语料）：
//   - 缩写：U.S / e.g / Inc.  会被切成词
//   - 连字符：well-known 会被切成 well / - / known
//   - 缩写词：didn't / CEO's 是整体输出
//   - 数字与货币：1.5 / $ 直接跳过

import {
  IRREGULAR,
  lemmaCandidates,
  lemmaOf,
  looksLikeProperNoun,
  normalizeWord,
  splitContraction
} from './lemma.js';

// 句号并不总是句子结束：Dr. / e.g. / U.S. 之后往往还接着同一句。
const ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st', 'vs', 'etc', 'eg', 'ie',
  'inc', 'ltd', 'co', 'corp', 'approx', 'fig', 'no', 'vol', 'pp', 'al', 'ca',
  'cf', 'ed', 'eds', 'est', 'min', 'max', 'dept', 'univ', 'gov', 'sen', 'rep',
  'gen', 'col', 'capt', 'lt', 'sgt', 'rev', 'hon', 'pres', 'jan', 'feb', 'mar',
  'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec'
]);

function tailWord(text) {
  const match = String(text).trimEnd().match(/([A-Za-z.]+)\.$/);
  if (!match) return '';
  return match[1];
}

function endsWithAbbreviation(text) {
  const word = tailWord(text);
  if (!word) return false;
  // 内部带点：U.S / e.g / i.e
  if (word.includes('.')) return true;
  // 单字母：J. K. Rowling
  if (word.length === 1) return true;
  return ABBREVIATIONS.has(word.toLowerCase().replace(/\./g, ''));
}

const FALLBACK_WORD_CHARS = /[A-Za-z\u00C0-\u024F'’-]/;

let segmenterCache = null;

function getSegmenter(locale = 'en', granularity = 'word') {
  if (typeof Intl === 'undefined' || typeof Intl.Segmenter !== 'function') return null;
  if (!segmenterCache) segmenterCache = new Map();
  const key = `${locale}:${granularity}`;
  if (!segmenterCache.has(key)) {
    segmenterCache.set(key, new Intl.Segmenter(locale, { granularity }));
  }
  return segmenterCache.get(key);
}

function fallbackSegment(text) {
  // 极老浏览器兜底：按空白与标点粗切。
  const tokens = [];
  let index = 0;
  for (const piece of String(text).split(/(\s+)/)) {
    if (piece) tokens.push({ segment: piece, index, isWordLike: FALLBACK_WORD_CHARS.test(piece) });
    index += piece.length;
  }
  return tokens;
}

function rawSegments(text, locale = 'en') {
  const segmenter = getSegmenter(locale, 'word');
  if (!segmenter) return fallbackSegment(text);
  return [...segmenter.segment(String(text))].map((item) => ({
    segment: item.segment,
    index: item.index,
    isWordLike: item.isWordLike
  }));
}

/**
 * 分句。返回 [{ text, start, end }]。
 * Intl.Segmenter 会在 Dr. / e.g. 之后断句，这里把缩写结尾的片段并回下一句。
 */
export function splitSentences(text, { locale = 'en' } = {}) {
  const source = String(text ?? '');
  if (!source) return [];
  const segmenter = getSegmenter(locale, 'sentence');
  if (!segmenter) {
    return [{ text: source, start: 0, end: source.length }];
  }

  const raw = [...segmenter.segment(source)].map((item) => ({
    text: item.segment,
    start: item.index,
    end: item.index + item.segment.length
  }));

  const merged = [];
  let pending = null;

  for (const piece of raw) {
    if (pending) {
      pending = {
        text: pending.text + piece.text,
        start: pending.start,
        end: piece.end
      };
    } else {
      pending = { ...piece };
    }

    if (endsWithAbbreviation(pending.text) && piece !== raw.at(-1)) {
      // 缩写结尾：继续并入下一段
      continue;
    }

    merged.push(pending);
    pending = null;
  }

  if (pending) merged.push(pending);
  return merged;
}

function isDigits(value) {
  return /^[\d.,]+$/.test(value);
}

function isCurrencyOrSymbol(value) {
  return /^[$€£¥%#@&*+=<>/\\|~^(){}[\]]+$/.test(value);
}

/** 合并连字符词：well / - / known → well-known */
function mergeHyphenated(segments) {
  const merged = [];
  for (let i = 0; i < segments.length; i += 1) {
    const current = segments[i];
    if (!current.isWordLike) {
      merged.push(current);
      continue;
    }

    let text = current.segment;
    let end = current.index + current.segment.length;
    let next = i + 1;

    // 允许一连串：well-known-known
    while (next + 1 < segments.length) {
      const joiner = segments[next];
      const following = segments[next + 1];
      if (joiner.segment !== '-' || !following.isWordLike) break;
      text += `-${following.segment}`;
      end = following.index + following.segment.length;
      next += 2;
    }

    merged.push({ segment: text, index: current.index, end, isWordLike: true });
    i = next - 1;
  }
  return merged;
}

function sentenceIndexFor(sentences, offset) {
  for (let i = 0; i < sentences.length; i += 1) {
    if (offset < sentences[i].end) return i;
  }
  return Math.max(0, sentences.length - 1);
}

/**
 * 分词。返回 Token[]：
 *   { text, index, end, sentenceIndex, wordLike, skip, keys }
 * skip=true 表示不参与覆盖率的词（缩写、数字、专有名词）
 * keys 是用于查词库的候选 key 列表（已处理缩写与所有格）
 */
export function tokenize(text, { locale = 'en' } = {}) {
  const source = String(text ?? '');
  if (!source) return [];

  const sentences = splitSentences(source, { locale });
  const merged = mergeHyphenated(rawSegments(source, locale));
  const tokens = [];

  for (const segment of merged) {
    const raw = segment.segment;
    const wordLike = Boolean(segment.wordLike ?? segment.isWordLike);
    const sentenceIndex = sentenceIndexFor(sentences, segment.index);
    const sentenceText = sentences[sentenceIndex]?.text || '';
    const sentenceStart = sentences[sentenceIndex]?.start || 0;
    const withinSentence = segment.index - sentenceStart;
    const atSentenceStart = sentenceText.slice(0, Math.max(0, withinSentence)).trim() === '';

    if (!wordLike) {
      tokens.push({
        text: raw,
        index: segment.index,
        end: segment.index + raw.length,
        sentenceIndex,
        wordLike: false,
        skip: true,
        keys: []
      });
      continue;
    }

    const normalized = normalizeWord(raw);
    let skip = false;

    if (!normalized) skip = true;
    else if (isDigits(raw) || isDigits(normalized)) skip = true;
    else if (isCurrencyOrSymbol(raw)) skip = true;
    else if (looksLikeProperNoun(raw, { sentenceStart: atSentenceStart })) skip = true;
    // 单字母（除 a / i）不参与统计
    else if (normalized.length === 1 && normalized !== 'a' && normalized !== 'i') skip = true;

    const keys = splitContraction(normalized).map((part) => part).filter(Boolean);
    if (!keys.length) keys.push(normalized);

    tokens.push({
      text: raw,
      index: segment.index,
      end: segment.index + raw.length,
      sentenceIndex,
      wordLike: true,
      skip,
      keys
    });
  }

  return tokens;
}

function keyLemma(key, knownWords) {
  if (IRREGULAR[key]) return IRREGULAR[key];
  if (!knownWords) return key;
  return lemmaOf(key, { knownWords });
}

/**
 * 计算覆盖率。
 * knownWords 是「已知词」集合，元素为小写词形或 lemma 均可。
 */
export function computeCoverage({ tokens = [], knownWords = null } = {}) {
  const known = knownWords instanceof Set
    ? knownWords
    : new Set(Array.isArray(knownWords) ? knownWords : []);

  let total = 0;
  const stats = new Map(); // lemma -> { count, word, firstSentenceIndex, known }

  for (const token of tokens) {
    if (!token.wordLike || token.skip) continue;
    total += 1;

    const allKnown = token.keys.every((key) => {
      if (known.has(key)) return true;
      const lemma = keyLemma(key, known);
      return known.has(lemma);
    });

    const primaryKey = token.keys[0];
    const lemma = keyLemma(primaryKey, known);
    const entry = stats.get(lemma) || {
      lemma,
      word: token.text,
      count: 0,
      firstSentenceIndex: token.sentenceIndex,
      known: allKnown
    };
    if (!entry.known && allKnown) {
      // 同一个 lemma 只要有一次被判定为已知，就认为这个词整体已知
      entry.known = true;
    }
    entry.count += 1;
    stats.set(lemma, entry);
  }

  const unique = stats.size;
  const knownCount = [...stats.values()].filter((item) => item.known).length;
  const unknown = [...stats.values()]
    .filter((item) => !item.known)
    .sort((a, b) => b.count - a.count || a.lemma.localeCompare(b.lemma))
    .map((item) => ({
      word: item.word,
      lemma: item.lemma,
      count: item.count,
      firstSentenceIndex: item.firstSentenceIndex
    }));

  return {
    total,
    unique,
    known: knownCount,
    unknownCount: unique - knownCount,
    coverage: unique ? knownCount / unique : 1,
    unknown
  };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 把句子中的目标词替换成挖空。
 * 按 token 匹配而不是纯字符串 find，避免 run 误伤 running。
 */
export function maskSentence(sentence, word, { locale = 'en' } = {}) {
  const source = String(sentence ?? '');
  const target = normalizeWord(word);
  if (!source || !target) return source;

  const tokens = tokenize(source, { locale });
  const hit = tokens.find((token) => {
    if (!token.wordLike || token.skip) return false;
    return token.keys.some((key) => {
      if (key === target) return true;
      if (IRREGULAR[key] === target) return true;
      return lemmaCandidates(key).includes(target);
    });
  });

  if (!hit) {
    // 兜底：整词正则，允许词形变化
    const pattern = new RegExp(`\\b${escapeRegExp(String(word))}[a-z]{0,3}\\b`, 'i');
    return source.replace(pattern, '____');
  }

  return `${source.slice(0, hit.index)}____${source.slice(hit.end)}`;
}

/** 把一段原文切成适合逐句展示的条目 */
export function sentenceBlocks(text, { locale = 'en' } = {}) {
  const sentences = splitSentences(text, { locale });
  return sentences
    .map((item, index) => ({ index, text: item.text.trim() }))
    .filter((item) => item.text);
}
