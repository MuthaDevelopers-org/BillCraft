import { test } from 'node:test';
import assert from 'node:assert/strict';

import { InvoiceItem } from '../js/models.js';
import {
  addProductLine, customerKey, isMeasuredUnit, presetsFor, rankProducts,
  recentCustomers, roundQty, setLineQuantity, stepQuantity
} from '../js/quickBill.js';

const product = (id, name, unit = 'pcs', unitPrice = 100) => ({ id, name, unit, unitPrice, description: '' });
const bill = (items, customer = {}) => ({ items, customer });

test('weight, volume and length units ask for a quantity; counted units do not', () => {
  for (const unit of ['kg', 'KG', ' Litre ', 'ml', 'mtr', 'kg.', 'किलो', 'मीटर']) {
    assert.equal(isMeasuredUnit(unit), true, unit);
  }
  for (const unit of ['pcs', 'jar', 'box', '', undefined]) {
    assert.equal(isMeasuredUnit(unit), false, String(unit));
  }
  assert.deepEqual(presetsFor('kg'), [0.25, 0.5, 1, 1.5, 2, 5]);
  assert.deepEqual(presetsFor('pcs'), [1, 2, 3, 5, 10, 12]);
});

test('quantity steps round to 3 decimals and stop at zero', () => {
  assert.equal(stepQuantity(1, 1), 2);
  assert.equal(stepQuantity(0.1, 0.2), 0.3);
  assert.equal(stepQuantity(1.5, -1), 0.5);
  assert.equal(stepQuantity(0.5, -1), 0);
  assert.equal(roundQty('2.5'), 2.5);
});

test('adding a product twice adds to its line instead of making a new one', () => {
  const items = [];
  const candle = product('p1', 'Candle');
  const first = addProductLine(items, candle);
  const second = addProductLine(items, candle, 2);
  assert.equal(first, second);
  assert.equal(items.length, 1);
  assert.equal(items[0].quantity, 3);
  assert.ok(items[0] instanceof InvoiceItem);

  addProductLine(items, product('p2', 'Rice', 'kg', 60), 2.5);
  assert.equal(items.length, 2);
  assert.equal(items[1].total, 150);
});

test('setting a quantity of zero removes the line', () => {
  const items = [];
  const line = addProductLine(items, product('p1', 'Rice', 'kg'), 1);
  assert.equal(setLineQuantity(items, line.id, 1.25).quantity, 1.25);
  assert.equal(setLineQuantity(items, line.id, 0), null);
  assert.equal(items.length, 0);
  assert.equal(setLineQuantity(items, 'missing', 2), null);
});

test('products used on more bills come first, and ties keep the catalog order', () => {
  const catalog = [product('a', 'Mug'), product('b', 'Honey'), product('c', 'Candle'), product('d', 'Tote')];
  const invoices = [
    bill([{ productId: 'c', name: 'Candle' }, { productId: 'c', name: 'Candle' }]), // counted once per bill
    bill([{ productId: 'c', name: 'Candle' }, { productId: 'b', name: 'Honey' }]),
    bill([{ productId: 'c', name: 'Candle' }]),
    bill([{ name: 'honey ' }]) // an older bill without productId, matched by name
  ];
  assert.deepEqual(rankProducts(catalog, invoices).map(p => p.id), ['c', 'b', 'a', 'd']);
});

test('recent customers are newest first, listed once, and skip bills without a name', () => {
  const invoices = [
    bill([], { name: 'Meera', phone: '+91 99123 45678', address: 'Pune' }),
    bill([], { name: '', phone: '9000000000' }),
    bill([], { name: 'Meera D', phone: '9912345678' }), // same phone as Meera
    bill([], { name: 'Ravi', phone: '' }),
    bill([], { name: 'ravi ', phone: '' }), // same name as Ravi
    bill([], { name: 'Asha', phone: '' })
  ];
  assert.deepEqual(recentCustomers(invoices).map(c => c.name), ['Meera', 'Ravi', 'Asha']);
  assert.deepEqual(recentCustomers(invoices, 2).map(c => c.name), ['Meera', 'Ravi']);
  assert.equal(recentCustomers(invoices)[0].address, 'Pune');
  assert.equal(
    customerKey({ name: 'X', phone: '+91 99123 45678' }),
    customerKey({ name: 'Y', phone: '9912345678' })
  );
});
