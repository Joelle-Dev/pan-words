import test from 'node:test';
import assert from 'node:assert/strict';
import {
  IRREGULAR,
  lemmaCandidates,
  lemmaOf,
  looksLikeProperNoun,
  normalizeWord,
  splitContraction
} from '../src/srs/lemma.js';

test('normalizeWord lowercases and strips punctuation but keeps apostrophes', () => {
  assert.equal(normalizeWord('Running,'), 'running');
  assert.equal(normalizeWord('  “Skepticism”  '), 'skepticism');
  assert.equal(normalizeWord("Didn't"), "didn't");
  assert.equal(normalizeWord('“CEO’s”'), "ceo's");
  assert.equal(normalizeWord(''), '');
});

test('every irregular entry maps to a known base form', () => {
  const keys = Object.keys(IRREGULAR);
  assert.ok(keys.length > 150, 'irregular table should be substantial');
  for (const key of keys) {
    const value = IRREGULAR[key];
    assert.equal(value, value.toLowerCase(), `${key} lemma must be lowercase`);
    assert.ok(value.length >= 1);
    assert.ok(!/\s/.test(value), `${key} lemma must be a single word`);
  }
});

test('irregular forms win even without a known-word list', () => {
  assert.equal(lemmaOf('went'), 'go');
  assert.equal(lemmaOf('Went'), 'go');
  assert.equal(lemmaOf('children'), 'child');
  assert.equal(lemmaOf('better'), 'good');
  assert.equal(lemmaOf('was'), 'be');
});

test('suffix stripping only applies when the stem is a known word', () => {
  const known = new Set(['run', 'make', 'study', 'quick', 'hope', 'stop']);
  assert.equal(lemmaOf('running', { knownWords: known }), 'run');
  assert.equal(lemmaOf('runs', { knownWords: known }), 'run');
  assert.equal(lemmaOf('making', { knownWords: known }), 'make');
  assert.equal(lemmaOf('studies', { knownWords: known }), 'study');
  assert.equal(lemmaOf('quickly', { knownWords: known }), 'quick');
  assert.equal(lemmaOf('hoped', { knownWords: known }), 'hope');
  assert.equal(lemmaOf('stopped', { knownWords: known }), 'stop');
});

test('without a known-word list, unknown inflections stay as-is', () => {
  assert.equal(lemmaOf('skepticism'), 'skepticism');
  assert.equal(lemmaOf('running'), 'running');
  assert.equal(lemmaOf('desks'), 'desks');
});

test('suffix stripping never invents words for short stems', () => {
  const known = new Set(['des', 'de', 're']);
  // stem 太短（<2）不参与剥离
  assert.equal(lemmaOf('es', { knownWords: known }), 'es');
});

test('lemmaCandidates offers multiple plausible stems', () => {
  const candidates = lemmaCandidates('running');
  assert.ok(candidates.includes('runn'));
  assert.ok(candidates.includes('run'));
  assert.ok(!candidates.includes('running'));
});

test('contractions split into library keys', () => {
  assert.deepEqual(splitContraction("didn't"), ['do', 'not']);
  assert.deepEqual(splitContraction("I'm"), ['i', 'am']);
  assert.deepEqual(splitContraction("CEO's"), ['ceo']);
  assert.deepEqual(splitContraction('the'), ['the']);
  assert.deepEqual(splitContraction(''), []);
});

test('proper noun detection handles acronyms, dots and sentence starts', () => {
  assert.equal(looksLikeProperNoun('U.S'), true);
  assert.equal(looksLikeProperNoun('CEO'), true);
  assert.equal(looksLikeProperNoun('e.g'), true);
  assert.equal(looksLikeProperNoun('Apple'), true);
  assert.equal(looksLikeProperNoun('Apple', { sentenceStart: true }), false);
  assert.equal(looksLikeProperNoun('apple'), false);
});
