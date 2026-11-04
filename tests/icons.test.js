import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ICON_GROUPS, NO_ICON, cleanIcon, groupOf, isProductIcon, pictureFor } from '../js/icons.js';
import { SUGGESTIONS } from '../js/units.js';
import { Product } from '../js/models.js';
import { parseBackup } from '../js/backup.js';
import english from '../js/i18n/locales/en.js';

test('every picture is in one group only, and every group has a name', () => {
  const seen = new Set();
  for (const group of ICON_GROUPS) {
    assert.ok(english.messages[`iconGroup.${group.key}`], `iconGroup.${group.key} has no name`);
    for (const icon of group.icons) {
      assert.ok(!seen.has(icon), `${icon} is in two groups`);
      seen.add(icon);
    }
  }
});

test('every picture a name suggests can also be chosen in the picker', () => {
  for (const rule of SUGGESTIONS) assert.ok(isProductIcon(rule.icon), `${rule.icon} (for ${rule.words[0]}) is not in the picker`);
});

test('a product keeps a picture from the list, "none", or follows its name', () => {
  assert.equal(new Product({ name: 'Rice', icon: '🍚' }).icon, '🍚');
  assert.equal(new Product({ name: 'Rice', icon: NO_ICON }).icon, NO_ICON);
  assert.equal(new Product({ name: 'Rice', icon: '<img src=x>' }).icon, '');
  assert.equal(new Product({ name: 'Rice' }).icon, '');
  assert.equal(cleanIcon('🦄'), '', 'a picture not in the list is not kept');
});

test('the picture shown: the chosen one, else the one the name suggests, else none', () => {
  assert.equal(pictureFor({ icon: '🎁', name: 'Toor dal' }), '🎁');
  assert.equal(pictureFor({ icon: '', name: 'Toor dal' }), '🌾');
  assert.equal(pictureFor({ icon: NO_ICON, name: 'Toor dal' }), '');
  assert.equal(pictureFor({ name: 'Diya set' }), '🪔');
  assert.equal(pictureFor({ name: 'Toy car' }), '');
  assert.equal(pictureFor(), '');
});

test('the picker opens at the group of the current picture', () => {
  assert.equal(groupOf('🥻'), 'clothes');
  assert.equal(groupOf(''), 'food');
});

test('pictures come back from a backup only when they are in the list', () => {
  const json = JSON.stringify({ app: 'BillCraft', format: 3, catalog: [
    { id: 'prod_1', name: 'Rice', unitPrice: 60, icon: '🍚' },
    { id: 'prod_2', name: 'Soap', unitPrice: 40, icon: '"><script>' },
    { id: 'prod_3', name: 'Gift box', unitPrice: 300, icon: NO_ICON }
  ] });
  assert.deepEqual(parseBackup(json).catalog.map(product => product.icon), ['🍚', '', NO_ICON]);
});
