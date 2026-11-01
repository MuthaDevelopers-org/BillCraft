import { test } from 'node:test';
import assert from 'node:assert/strict';

import english from '../js/i18n/locales/en.js';
import hindi from '../js/i18n/locales/hi.js';
import { createTranslator, loadLocale, statusLabel } from '../js/i18n/i18n.js';
import { LANGUAGES, availableLanguages, getLanguage } from '../js/i18n/languages.js';

test('every language file has exactly the same keys as English', () => {
  const expected = Object.keys(english.messages).sort();
  assert.deepEqual(Object.keys(hindi.messages).sort(), expected);
});

test('every language with a loader has a file that loads and has the same keys', async () => {
  for (const language of availableLanguages()) {
    const locale = await loadLocale(language.code);
    assert.deepEqual(
      Object.keys(locale.messages).sort(),
      Object.keys(english.messages).sort(),
      `${language.code} keys differ from English`
    );
  }
});

test('translations contain no HTML, since they are inserted as text', () => {
  for (const locale of [english, hindi]) {
    for (const [key, text] of Object.entries(locale.messages)) {
      assert.doesNotMatch(text, /[<>]/, `${key} contains < or >`);
    }
  }
});

test('t() interpolates named parameters', () => {
  const { t } = createTranslator(english);
  assert.equal(t('toast.billSaved', { number: 'BILL-004' }), 'Bill #BILL-004 saved!');
});

test('t() leaves a placeholder visible when its value is not supplied', () => {
  const { t } = createTranslator(english);
  assert.equal(t('toast.billSaved'), 'Bill #{number} saved!');
});

test('t() translates with the Hindi locale', () => {
  const { t } = createTranslator(hindi);
  assert.equal(t('nav.createBill'), 'बिल बनाएँ');
  assert.equal(t('toast.billSaved', { number: '7' }), 'बिल #7 सेव हो गया!');
});

test('a key missing from a locale falls back to English', () => {
  const partial = { messages: { 'nav.createBill': 'बिल बनाएँ' }, words: hindi.words };
  const { t } = createTranslator(partial);
  assert.equal(t('nav.createBill'), 'बिल बनाएँ');
  assert.equal(t('nav.products'), 'Products');
});

test('a key missing everywhere is shown as the key itself', () => {
  const { t } = createTranslator(english);
  assert.equal(t('does.not.exist'), 'does.not.exist');
});

test('statuses are translated for display only', () => {
  const { t } = createTranslator(hindi);
  assert.equal(statusLabel(t, 'Paid'), 'भुगतान हो गया');
  assert.equal(statusLabel(t, 'due'), 'बाकी');
  assert.equal(statusLabel(createTranslator(english).t, 'Draft'), 'Draft');
  assert.equal(statusLabel(t, 'Other'), 'Other');
});

test('the language registry marks only Hindi and English as available', () => {
  assert.deepEqual(availableLanguages().map(l => l.code), ['en', 'hi']);
  assert.equal(LANGUAGES.length, 12);
  assert.equal(getLanguage('ur').dir, 'rtl');
  assert.equal(getLanguage('xx'), null);
});
