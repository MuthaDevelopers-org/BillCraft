import { test } from 'node:test';
import assert from 'node:assert/strict';

import { BusinessSettings, Invoice, InvoiceItem, formatCurrency } from '../js/models.js';

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
