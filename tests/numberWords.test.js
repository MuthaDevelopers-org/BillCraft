import { test } from 'node:test';
import assert from 'node:assert/strict';

import { numberToWords } from '../js/models.js';
import hindi from '../js/i18n/locales/hi.js';
import english from '../js/i18n/locales/en.js';
import { spellAmount } from '../js/i18n/numberWords.js';

// English output must stay exactly as it was before translations were added.
// These expectations were recorded from the original numberToWords().
test('English amounts are unchanged from the original implementation', () => {
  const cases = [
    [0, 'Zero Only'],
    [5, 'Five Only'],
    [15, 'Fifteen Only'],
    [20, 'Twenty Only'],
    [21, 'Twenty One Only'],
    [99, 'Ninety Nine Only'],
    [100, 'One Hundred Only'],
    [101, 'One Hundred and One Only'],
    [520, 'Five Hundred and Twenty Only'],
    [1000, 'One Thousand Only'],
    [1520, 'One Thousand Five Hundred and Twenty Only'],
    [100000, 'One Lakh Only'],
    [1250075, 'Twelve Lakh Fifty Thousand Seventy Five Only'],
    [10000000, 'One Crore Only'],
    [12550075, 'One Crore Twenty Five Lakh Fifty Thousand Seventy Five Only'],
    [1234.9, 'One Thousand Two Hundred and Thirty Four Only']
  ];
  for (const [amount, expected] of cases) {
    assert.equal(numberToWords(amount), expected, `amount ${amount}`);
  }
});

test('negative and non-numeric amounts do not produce "undefined"', () => {
  assert.equal(numberToWords(-520), 'Five Hundred and Twenty Only');
  assert.equal(numberToWords('abc'), 'Zero Only');
});

test('Hindi amounts use the Hindi vocabulary and Indian units', () => {
  const words = amount => spellAmount(amount, hindi.words);
  assert.equal(words(0), 'शून्य मात्र');
  assert.equal(words(1520), 'एक हज़ार पाँच सौ बीस मात्र');
  assert.equal(words(100), 'एक सौ मात्र');
  assert.equal(words(101), 'एक सौ एक मात्र');
  assert.equal(words(100000), 'एक लाख मात्र');
  assert.equal(words(12550075), 'एक करोड़ पच्चीस लाख पचास हज़ार पचहत्तर मात्र');
});

test('the English vocabulary table covers 0 to 99 without gaps', () => {
  assert.equal(english.words.units.length, 100);
  assert.equal(hindi.words.units.length, 100);
  assert.ok(english.words.units.slice(1).every(Boolean));
  assert.ok(hindi.words.units.slice(1).every(Boolean));
});
