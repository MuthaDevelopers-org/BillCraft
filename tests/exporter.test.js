import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ExporterService, fileNameFor, pageSlices, whatsappNumber } from '../js/exporter.js';
import { BusinessSettings, Invoice, InvoiceItem } from '../js/models.js';
import { createTranslator } from '../js/i18n/i18n.js';
import english from '../js/i18n/locales/en.js';
import hindi from '../js/i18n/locales/hi.js';

test('a short bill is one page', () => {
  assert.deepEqual(pageSlices(800, 1000, [200, 500]), [[0, 800]]);
});

test('a tall bill is cut below a row, never through one', () => {
  // Rows end every 90px; a page holds 1000px
  const rows = Array.from({ length: 30 }, (_, i) => (i + 1) * 90);
  const slices = pageSlices(2700, 1000, rows);
  assert.deepEqual(slices, [[0, 990], [990, 1980], [1980, 2700]]);
  for (const [, end] of slices.slice(0, -1)) assert.ok(rows.includes(end));
});

test('later pages can hold less, to leave room for margins', () => {
  const rows = Array.from({ length: 30 }, (_, i) => (i + 1) * 90);
  assert.deepEqual(pageSlices(2700, 1000, rows, 900), [[0, 990], [990, 1890], [1890, 2700]]);
});

test('a block taller than half a page is cut at the page end', () => {
  assert.deepEqual(pageSlices(2500, 1000, [100, 2400]), [[0, 1000], [1000, 2000], [2000, 2500]]);
});

test('file names come from bill numbers, without characters files cannot have', () => {
  assert.equal(fileNameFor('BILL-012', 'pdf'), 'BILL-012.pdf');
  assert.equal(fileNameFor('INV/2026-27/005', 'png'), 'INV-2026-27-005.png');
  assert.equal(fileNameFor(' A:B*C? ', 'pdf'), 'A-B-C.pdf');
  assert.equal(fileNameFor('', 'pdf'), 'bill.pdf');
});

test('WhatsApp numbers get India\'s code when written locally', () => {
  assert.equal(whatsappNumber('98765 43210'), '919876543210');
  assert.equal(whatsappNumber('098765-43210'), '919876543210');
  assert.equal(whatsappNumber('+91 99123 45678'), '919912345678');
  assert.equal(whatsappNumber('+971 50 123 4567'), '971501234567');
  assert.equal(whatsappNumber('12345'), '');
  assert.equal(whatsappNumber(''), '');
});

const bill = () => new Invoice({
  invoiceNumber: 'BILL-012',
  date: '2026-11-03',
  dueDate: '2026-11-10',
  status: 'Due',
  customer: { name: 'Meera', phone: '99123 45678' },
  items: [new InvoiceItem({ name: 'Candle', quantity: 2, unitPrice: 450 })]
});

test('the bill message shows dates in the bill language, the due date, and a tidy contact line', () => {
  const settings = new BusinessSettings({ brandName: 'Asha Candles', phone: '98765 43210', upiId: 'asha@okaxis' });
  const text = ExporterService.formatInvoiceText(bill(), settings, createTranslator(english), 'en');
  assert.match(text, /Date: 3 Nov 2026/);
  assert.match(text, /Please pay by 10 Nov 2026\./);
  assert.match(text, /Contact: 98765 43210$/m);
  assert.match(text, /₹ 900\.00/);

  const hindiText = ExporterService.formatInvoiceText(bill(), settings, createTranslator(hindi), 'hi');
  assert.match(hindiText, /3 नव॰ 2026/);
});

test('a reminder names the bill, the amount due, the date and how to pay', () => {
  const settings = new BusinessSettings({ brandName: 'Asha Candles', sellerName: 'Asha', phone: '98765 43210', upiId: 'asha@okaxis' });
  const text = ExporterService.formatReminderText(bill(), settings, createTranslator(english), 'en');
  assert.equal(text, [
    '🔔 *Payment reminder from Asha Candles*',
    'Bill BILL-012, 3 Nov 2026',
    '*Amount due: ₹ 900.00*',
    'Please pay by 10 Nov 2026.',
    '',
    '💳 Pay via UPI: asha@okaxis',
    'Contact: Asha (98765 43210)',
    '',
    'Thank you for your business!'
  ].join('\n'));
});
