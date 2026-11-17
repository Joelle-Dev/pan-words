import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWordList } from '../src/utils/wordList.js';

test('parses tab separated with phonetic', () => {
  const rows = parseWordList('abandon\t放弃\t/əˈbændən/');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].word, 'abandon');
  assert.equal(rows[0].meaning, '放弃');
  assert.equal(rows[0].phonetic, '/əˈbændən/');
});

test('parses dash and comma formats', () => {
  const dash = parseWordList('abandon - 放弃');
  assert.deepEqual(
    dash.map((row) => [row.word, row.meaning]),
    [['abandon', '放弃']]
  );

  const comma = parseWordList('abandon,放弃,n.');
  assert.equal(comma[0].word, 'abandon');
  assert.equal(comma[0].meaning, '放弃');
  assert.equal(comma[0].pos, 'n.');
});

test('parses a bare word without meaning', () => {
  const rows = parseWordList('abandon');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].word, 'abandon');
  assert.equal(rows[0].meaning, '');
});

test('drops duplicate words case-insensitively', () => {
  const rows = parseWordList('Abandon\nabandon\nabandon - 放弃');
  assert.equal(rows.length, 1);
});

test('ignores lines without latin letters', () => {
  const rows = parseWordList('123\n纯中文\n\nabandon');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].word, 'abandon');
});

test('handles word + space + chinese meaning', () => {
  const rows = parseWordList('skepticism 怀疑态度');
  assert.equal(rows[0].word, 'skepticism');
  assert.equal(rows[0].meaning, '怀疑态度');
});

test('empty input returns empty array', () => {
  assert.deepEqual(parseWordList(''), []);
  assert.deepEqual(parseWordList(null), []);
});
