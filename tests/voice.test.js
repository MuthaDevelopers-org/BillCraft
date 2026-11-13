import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeSpokenNumber } from '../js/voice.js';

test('plain Latin digits pass through', () => {
  assert.equal(normalizeSpokenNumber('1500'), '1500');
});

test('Devanagari, Bengali, Tamil and Arabic-Indic digits become Latin digits', () => {
  assert.equal(normalizeSpokenNumber('१५००'), '1500');
  assert.equal(normalizeSpokenNumber('৩৫'), '35');
  assert.equal(normalizeSpokenNumber('௨௦௦'), '200');
  assert.equal(normalizeSpokenNumber('٤٥'), '45');
});

test('commas, currency signs and words are dropped', () => {
  assert.equal(normalizeSpokenNumber('₹ 1,250'), '1250');
  assert.equal(normalizeSpokenNumber('abc'), '');
});

test('only one decimal point is kept', () => {
  assert.equal(normalizeSpokenNumber('12.5.3'), '12.53');
});
