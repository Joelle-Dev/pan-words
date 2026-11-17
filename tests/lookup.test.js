import test from 'node:test';
import assert from 'node:assert/strict';
import { pickDictionaryEntry } from '../src/lib/lookup.js';

const SAMPLE = [
  {
    word: 'skepticism',
    phonetic: '/ˈskɛp.tɪˌsɪ.zəm/',
    phonetics: [
      { text: '/ˈskɛp.tɪˌsɪ.zəm/', audio: '' },
      { text: '', audio: 'https://example.com/skepticism.mp3' }
    ],
    meanings: [
      {
        partOfSpeech: 'noun',
        definitions: [
          { definition: 'The practice or philosophy of being a skeptic.' },
          { definition: 'A studied attitude of questioning and doubt' },
          { definition: 'The doctrine that absolute knowledge is not possible' },
          { definition: 'should be trimmed away' }
        ]
      }
    ]
  }
];

test('picks phonetic, audio and definitions', () => {
  const entry = pickDictionaryEntry(SAMPLE);
  assert.equal(entry.phonetic, '/ˈskɛp.tɪˌsɪ.zəm/');
  assert.equal(entry.audio, 'https://example.com/skepticism.mp3');
  assert.equal(entry.word, 'skepticism');
  assert.equal(entry.meanings.length, 1);
  assert.equal(entry.meanings[0].pos, 'noun');
  assert.equal(entry.meanings[0].definitions.length, 3, 'definitions are capped');
  assert.ok(entry.meanings[0].definitions[0].startsWith('The practice'));
});

test('returns null for empty or invalid payloads', () => {
  assert.equal(pickDictionaryEntry(null), null);
  assert.equal(pickDictionaryEntry([]), null);
  assert.equal(pickDictionaryEntry({}), null);
});

test('handles an entry with no meanings', () => {
  const entry = pickDictionaryEntry([{ word: 'x', phonetic: '/eks/', meanings: [] }]);
  assert.equal(entry.phonetic, '/eks/');
  assert.deepEqual(entry.meanings, []);
});

test('fills phonetic from the phonetics array when the top field is missing', () => {
  const entry = pickDictionaryEntry([
    { word: 'x', phonetics: [{ text: '/eks/' }], meanings: [] }
  ]);
  assert.equal(entry.phonetic, '/eks/');
});

test('drops meanings whose definitions are all empty', () => {
  const entry = pickDictionaryEntry([
    {
      word: 'x',
      meanings: [
        { partOfSpeech: 'noun', definitions: [] },
        { partOfSpeech: 'verb', definitions: [{ definition: 'to do something' }] }
      ]
    }
  ]);
  assert.equal(entry.meanings.length, 1);
  assert.equal(entry.meanings[0].pos, 'verb');
});
