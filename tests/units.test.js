import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  SUGGESTIONS, UNITS, isMeasuredUnit, presetsFor, suggestForProduct, unitInfo, unitLabel
} from '../js/units.js';
import { createTranslator, loadLocale } from '../js/i18n/i18n.js';
import { availableLanguages } from '../js/i18n/languages.js';
import english from '../js/i18n/locales/en.js';
import hindi from '../js/i18n/locales/hi.js';

const en = createTranslator(english, 'en').t;
const hi = createTranslator(hindi, 'hi').t;

test('a standard unit is found by its code or any common spelling', () => {
  assert.equal(unitInfo('kg').code, 'kg');
  assert.equal(unitInfo('KG').code, 'kg');
  assert.equal(unitInfo(' Kilo ').code, 'kg');
  assert.equal(unitInfo('Litre').code, 'ltr');
  assert.equal(unitInfo('Nos.').code, 'pcs', 'a final full stop is ignored');
  assert.equal(unitInfo('पैकेट').code, 'pack');
  assert.equal(unitInfo('tray'), null);
  assert.equal(unitInfo(''), null);
  assert.equal(unitInfo(undefined), null);
});

test('codes and spellings belong to one unit only', () => {
  const seen = new Map();
  for (const unit of UNITS) {
    for (const spelling of [unit.code, ...unit.aliases]) {
      assert.ok(!seen.has(spelling), `"${spelling}" is in both ${seen.get(spelling)} and ${unit.code}`);
      assert.equal(spelling, spelling.toLowerCase().trim().replace(/\.$/, ''), `"${spelling}" is not written as it is matched`);
      seen.set(spelling, unit.code);
    }
  }
});

test('every standard unit has a name in each language, which reads back as that unit', async () => {
  for (const language of availableLanguages()) {
    const { t } = createTranslator(await loadLocale(language.code), language.code);
    for (const unit of UNITS) {
      const label = unitLabel(unit.code, t);
      assert.notEqual(label, `unit.${unit.code}`, `${language.code} has no name for ${unit.code}`);
      assert.equal(unitInfo(label)?.code, unit.code, `${language.code} "${label}" does not read back as ${unit.code}`);
    }
  }
});

test('standard units are shown in the reader\'s language; typed ones as typed', () => {
  assert.equal(unitLabel('kg', en), 'kg');
  assert.equal(unitLabel('kg', hi), 'किलो');
  assert.equal(unitLabel('Kilo', hi), 'किलो', 'old data spelt another way');
  assert.equal(unitLabel('pcs', hi), 'नग');
  assert.equal(unitLabel('tray', hi), 'tray');
  assert.equal(unitLabel('', en), '');
});

test('units sold by weight, volume, length or time ask how much', () => {
  for (const unit of ['kg', 'g', 'ltr', 'ml', 'm', 'cm', 'hr', 'Kgs', 'लीटर', 'ft', 'sq ft']) {
    assert.ok(isMeasuredUnit(unit), unit);
  }
  for (const unit of ['pcs', 'pack', 'bottle', 'dozen', 'plate', 'tray', '']) {
    assert.ok(!isMeasuredUnit(unit), unit);
  }
});

test('one-tap amounts suit the unit', () => {
  assert.deepEqual(presetsFor('g'), [50, 100, 200, 250, 500, 750]);
  assert.deepEqual(presetsFor('kg'), [0.25, 0.5, 1, 1.5, 2, 5]);
  assert.deepEqual(presetsFor('ft'), [0.25, 0.5, 1, 1.5, 2, 5]);
  assert.deepEqual(presetsFor('dozen'), [0.5, 1, 2, 3, 5, 10]);
  assert.deepEqual(presetsFor('pcs'), [1, 2, 3, 5, 10, 12]);
  assert.deepEqual(presetsFor('tray'), [1, 2, 3, 5, 10, 12]);
});

test('a product name suggests a unit and a picture, in English, Hinglish or Hindi', () => {
  assert.deepEqual(suggestForProduct('Basmati Rice 5kg'), { unit: 'kg', icon: '🍚' });
  assert.deepEqual(suggestForProduct('chawal'), { unit: 'kg', icon: '🍚' });
  assert.deepEqual(suggestForProduct('चावल'), { unit: 'kg', icon: '🍚' });
  assert.deepEqual(suggestForProduct('Toor dal'), { unit: 'kg', icon: '🌾' });
  assert.deepEqual(suggestForProduct('Amul Milk'), { unit: 'ltr', icon: '🥛' });
  assert.deepEqual(suggestForProduct('दूध'), { unit: 'ltr', icon: '🥛' });
  assert.deepEqual(suggestForProduct('Desi eggs'), { unit: 'dozen', icon: '🥚' });
  assert.deepEqual(suggestForProduct('Soy Candle'), { unit: 'pcs', icon: '🕯️' });
  assert.deepEqual(suggestForProduct('Masala chai'), { unit: 'pack', icon: '🍵' });
  assert.deepEqual(suggestForProduct('Maths tuition'), { unit: 'hr', icon: '📚' });
});

test('Latin words match whole words only, and unknown names suggest nothing', () => {
  assert.equal(suggestForProduct('Price list'), null, '"rice" inside "price" is not rice');
  assert.equal(suggestForProduct('Toy car'), null);
  assert.equal(suggestForProduct('   '), null);
  assert.equal(suggestForProduct(undefined), null);
});

test('every suggestion is a standard unit, and every word is matched as written', () => {
  for (const rule of SUGGESTIONS) {
    assert.ok(unitInfo(rule.unit)?.code === rule.unit, `${rule.unit} is not a standard unit code`);
    assert.ok(rule.icon, `${rule.unit} has no picture`);
    for (const word of rule.words) assert.equal(word, word.toLowerCase().trim(), `"${word}" must be lower case`);
  }
});
