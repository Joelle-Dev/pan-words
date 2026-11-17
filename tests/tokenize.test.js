import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeCoverage,
  maskSentence,
  sentenceBlocks,
  splitSentences,
  tokenize
} from '../src/srs/tokenize.js';

const SAMPLE = `A well-known U.S. firm, e.g. Apple Inc., didn't pay $1.5 billion (approx.) in 2024; the CEO's aide's résumé.`;

test('splitSentences keeps punctuation with each sentence', () => {
  const sentences = splitSentences('Dr. Smith said the policy was met with skepticism. I am running late! Really?');
  assert.ok(sentences.length >= 3);
  assert.ok(sentences[0].text.includes('skepticism'));
  assert.ok(sentences.at(-1).text.includes('Really'));
});

test('tokenize skips punctuation, numbers and symbols', () => {
  const tokens = tokenize(SAMPLE);
  const words = tokens.filter((token) => token.wordLike && !token.skip).map((token) => token.text);
  assert.ok(words.includes('well-known'));
  assert.ok(words.includes('firm'));
  assert.ok(words.includes('pay'));
  assert.ok(!words.includes('1.5'));
  assert.ok(!words.includes('$'));
});

test('tokenize marks acronyms, dotted forms and proper nouns as skip', () => {
  const tokens = tokenize(SAMPLE);
  const skipped = tokens.filter((token) => token.skip).map((token) => token.text);
  assert.ok(skipped.some((text) => text.includes('U.S')));
  assert.ok(skipped.some((text) => text.includes('e.g')));
  assert.ok(skipped.some((text) => text.includes('Apple')));
  assert.ok(skipped.some((text) => text.includes('Inc')));
});

test('tokenize splits contractions into library keys', () => {
  const tokens = tokenize(SAMPLE);
  const did = tokens.find((token) => token.text === "didn't");
  assert.ok(did);
  assert.deepEqual(did.keys, ['do', 'not']);

  const ceo = tokens.find((token) => token.text === "CEO's");
  assert.ok(ceo);
  assert.deepEqual(ceo.keys, ['ceo']);
});

test('tokenize records sentence indexes', () => {
  const tokens = tokenize('One two. Three four.');
  const first = tokens.find((token) => token.text === 'One');
  const second = tokens.find((token) => token.text === 'Three');
  assert.equal(first.sentenceIndex, 0);
  assert.equal(second.sentenceIndex, 1);
});

test('computeCoverage reports totals and unknown words sorted by frequency', () => {
  const tokens = tokenize('The cat sat. The cat ran. A dog sat.');
  const known = new Set(['the', 'cat', 'a', 'run', 'sit']);
  const coverage = computeCoverage({ tokens, knownWords: known });

  assert.ok(coverage.total > 0);
  assert.ok(coverage.coverage > 0 && coverage.coverage <= 1);
  // dog 未收录
  assert.ok(coverage.unknown.some((item) => item.lemma === 'dog'));
  // ran -> run 已收录，不该出现在 unknown
  assert.ok(!coverage.unknown.some((item) => item.lemma === 'ran'));
  // 频率高的排前面
  assert.ok(coverage.unknown[0].count >= coverage.unknown.at(-1).count);
});

test('computeCoverage returns 100% for an empty known list when nothing is countable', () => {
  const tokens = tokenize('123 $$$ ...');
  const coverage = computeCoverage({ tokens, knownWords: new Set() });
  assert.equal(coverage.total, 0);
  assert.equal(coverage.coverage, 1);
  assert.equal(coverage.unknown.length, 0);
});

test('maskSentence blanks only the matched word', () => {
  assert.equal(maskSentence('The cat sat on the mat.', 'cat'), 'The ____ sat on the mat.');
  assert.equal(maskSentence('He is running fast.', 'running'), 'He is ____ fast.');
  // run 不应该误伤 running 之外的部分
  assert.equal(maskSentence('He is running fast.', 'run'), 'He is ____ fast.');
});

test('maskSentence falls back to a word-boundary regex when tokens miss', () => {
  const masked = maskSentence('Skepticism everywhere.', 'skepticism');
  assert.ok(masked.includes('____'));
  assert.ok(!masked.toLowerCase().includes('skepticism'));
});

test('sentenceBlocks trims and drops empty entries', () => {
  const blocks = sentenceBlocks('First one.   \n\n Second two.  ');
  assert.ok(blocks.length >= 2);
  assert.ok(blocks.every((block) => block.text.length > 0));
  assert.equal(blocks[0].index, 0);
});

test('tokenize handles empty and non-string input', () => {
  assert.deepEqual(tokenize(''), []);
  assert.deepEqual(tokenize(null), []);
  assert.deepEqual(tokenize(undefined), []);
});
