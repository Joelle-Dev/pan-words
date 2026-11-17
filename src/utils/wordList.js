// 词表解析：自动识别常见分隔格式，不需要用户先选格式。
//
// 支持：
//   abandon\t放弃\t/əˈbændən/
//   abandon - 放弃
//   abandon,放弃,n.
//   abandon 放弃
//   abandon

const SEPARATORS = ['\t', ' - ', ' — ', ' – ', ',', '，', '|', '  '];

function splitBy(line) {
  for (const separator of SEPARATORS) {
    if (line.includes(separator)) {
      const parts = line.split(separator);
      return parts.map((part) => part.trim()).filter(Boolean);
    }
  }
  // 最后尝试「单词 + 空格 + 释义」：只在第一个空格后还有非英文字符时这样切
  const match = line.match(/^([A-Za-z][A-Za-z'’\-\s]*?)\s+(.+)$/);
  if (match && /[^\x00-\x7F]/.test(match[2])) {
    return [match[1].trim(), match[2].trim()];
  }
  return [line];
}

function isPhonetic(value) {
  return /^[/\[].*[/\]]$/.test(value);
}

function isPos(value) {
  return /^(n|v|adj|adv|prep|conj|pron|num|art|int|vt|vi|aux)\.?$/i.test(value);
}

/**
 * 解析一段词表文本，返回 [{ word, meaning, phonetic, pos }]
 * 无法识别的行直接跳过。
 */
export function parseWordList(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const entries = [];
  const seen = new Set();

  for (const line of lines) {
    const parts = splitBy(line);
    const word = (parts[0] || '').replace(/^[\d.、)\s]+/, '').trim();
    if (!/[A-Za-z]/.test(word)) continue;
    if (/\s{2,}/.test(word)) continue;

    let meaning = '';
    let phonetic = '';
    let pos = '';

    for (const part of parts.slice(1)) {
      if (isPhonetic(part)) phonetic = part;
      else if (isPos(part)) pos = pos || part;
      else if (!meaning) meaning = part;
    }

    const key = word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    entries.push({ word, meaning, phonetic, pos });
  }

  return entries;
}
