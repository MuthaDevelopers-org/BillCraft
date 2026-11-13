import { test } from 'node:test';
import assert from 'node:assert/strict';

import { BusinessSettings, Invoice, InvoiceItem, formatCurrency, roundMoney } from '../js/models.js';

test('formatCurrency uses Indian grouping and Latin digits', () => {
  assert.equal(formatCurrency(125050, '₹'), '₹ 1,25,050.00');
  assert.equal(formatCurrency(1520.5), '₹ 1,520.50');
  assert.equal(formatCurrency(undefined), '₹ 0.00');
});

test('old saved settings without language fields load with safe defaults', () => {
  const oldSettings = new BusinessSettings({ brandName: 'Asha Candles', upiId: 'asha@upi' });
  assert.equal(oldSettings.brandName, 'Asha Candles');
  assert.equal(oldSettings.appLanguage, '');
  assert.equal(oldSettings.billLanguage, '');
  assert.equal(oldSettings.voiceConsent, false);
});

test('voice consent is stored as a boolean', () => {
  assert.equal(new BusinessSettings({ voiceConsent: 'yes' }).voiceConsent, true);
  assert.equal(new BusinessSettings({ voiceConsent: 0 }).voiceConsent, false);
});

test('bill totals apply item discount, flat discount and delivery', () => {
  const invoice = new Invoice({
    items: [
      new InvoiceItem({ quantity: 2, unitPrice: 450 }),
      new InvoiceItem({ quantity: 1, unitPrice: 280, discount: 10 })
    ],
    billDiscount: 30,
    shippingFee: 50
  });
  assert.equal(invoice.subtotal, 1152);
  assert.equal(invoice.grandTotal, 1172);
  assert.equal(invoice.totalItemsCount, 3);
});

test('a discount is a percent of the subtotal or an amount, and never more than the subtotal', () => {
  const items = () => [new InvoiceItem({ quantity: 3, unitPrice: 111.11 })]; // 333.33
  const percent = new Invoice({ items: items(), discountType: 'percent', discountValue: 10, shippingFee: 50 });
  assert.equal(percent.discountAmount, 33.33);
  assert.equal(percent.grandTotal, 350);
  const amount = new Invoice({ items: items(), discountType: 'amount', discountValue: 20 });
  assert.equal(amount.discountAmount, 20);
  assert.equal(amount.grandTotal, 313.33);
  assert.equal(new Invoice({ items: items(), discountType: 'percent', discountValue: 250 }).discountValue, 100, 'at most 100%');
  assert.equal(new Invoice({ items: items(), discountType: 'amount', discountValue: 500 }).discountAmount, 333.33);
  assert.equal(new Invoice({ items: items(), discountType: 'sideways', discountValue: 5 }).discountType, 'percent');
  assert.equal(new Invoice({ items: [], discountType: 'amount', discountValue: 50, shippingFee: 30 }).grandTotal, 30, 'no items: delivery only');
});

test('a bill from before 1.1 keeps its flat discount as an amount', () => {
  const old = new Invoice({ items: [new InvoiceItem({ quantity: 1, unitPrice: 500 })], billDiscount: 30 });
  assert.equal(old.discountType, 'amount');
  assert.equal(old.discountValue, 30);
  assert.equal(old.grandTotal, 470);
  const stored = JSON.parse(JSON.stringify(old));
  assert.equal('billDiscount' in stored, false, 'new bills are stored with a type and a value');
  assert.equal(new Invoice(stored).grandTotal, 470);
  const none = new Invoice({ items: [], billDiscount: 0 });
  assert.equal(none.discountType, 'percent', 'a new bill starts with percent');
});

test('amounts round to paise, half up, without binary errors', () => {
  assert.equal(roundMoney(10.075), 10.08);
  assert.equal(roundMoney(1.005), 1.01);
  assert.equal(roundMoney(99.999), 100);
  assert.equal(roundMoney(0.1 + 0.2), 0.3);
  assert.equal(roundMoney(1e-7), 0);
  assert.equal(roundMoney('abc'), 0);
});

test('line totals are in paise, so the printed lines add up to the subtotal', () => {
  const invoice = new Invoice({
    items: [
      new InvoiceItem({ quantity: 3, unitPrice: 33.333 }), // 99.999 → 100.00
      new InvoiceItem({ quantity: 0.333, unitPrice: 10 }), // 3.33
      new InvoiceItem({ quantity: 1, unitPrice: 0.1 }),
      new InvoiceItem({ quantity: 1, unitPrice: 0.2 })
    ]
  });
  assert.deepEqual(invoice.items.map(item => item.total), [100, 3.33, 0.1, 0.2]);
  assert.equal(invoice.subtotal, 103.63);
  assert.equal(invoice.grandTotal, 103.63);
});

test('out-of-range amounts are clamped', () => {
  assert.equal(new InvoiceItem({ quantity: 2, unitPrice: 100, discount: 150 }).total, 0);
  assert.equal(new InvoiceItem({ quantity: 2, unitPrice: -100 }).total, 0);
  const invoice = new Invoice({ items: [new InvoiceItem({ unitPrice: 50 })], billDiscount: 80, shippingFee: -20 });
  assert.equal(invoice.grandTotal, 0);
});

test('a total quantity is offered only when every line has the same unit', () => {
  const same = new Invoice({ items: [new InvoiceItem({ quantity: 0.1, unit: 'kg' }), new InvoiceItem({ quantity: 0.2, unit: 'KG ' })] });
  assert.equal(same.hasSingleUnit, true);
  assert.equal(same.totalItemsCount, 0.3);
  const spelt = new Invoice({ items: [new InvoiceItem({ unit: 'kg' }), new InvoiceItem({ unit: 'Kilo' }), new InvoiceItem({ unit: 'किलो' })] });
  assert.equal(spelt.hasSingleUnit, true, 'one unit, spelt three ways');
  const mixed = new Invoice({ items: [new InvoiceItem({ unit: 'pcs' }), new InvoiceItem({ unit: 'kg' })] });
  assert.equal(mixed.hasSingleUnit, false);
  const typed = new Invoice({ items: [new InvoiceItem({ unit: 'Tray' }), new InvoiceItem({ unit: 'tray ' })] });
  assert.equal(typed.hasSingleUnit, true);
});
