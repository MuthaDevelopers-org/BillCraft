import { test } from 'node:test';
import assert from 'node:assert/strict';

import { BackupError, buildBackup, csvCell, invoicesToCSV, parseBackup } from '../js/backup.js';
import { escapeHTML, safeImageSrc } from '../js/safe.js';

const refused = (json, reason) => assert.throws(() => parseBackup(json), error => error instanceof BackupError && error.reason === reason);

test('files that are not BillCraft backups are refused', () => {
  refused('not json at all', 'not-backup');
  refused('[]', 'not-backup');
  refused('null', 'not-backup');
  refused('{"hello": "world"}', 'not-backup');
  refused('{"settings": "text", "catalog": {}, "invoices": 5}', 'not-backup');
  refused(JSON.stringify({ app: 'OtherApp', invoices: [] }), 'not-backup');
});

test('a backup from a newer version is refused rather than half read', () => {
  refused(JSON.stringify({ app: 'BillCraft', format: 99, invoices: [] }), 'newer');
});

test('backups from before 1.0 still restore', () => {
  const old = {
    version: '1.0',
    settings: { brandName: 'Asha Candles', upiId: 'asha@okaxis', currency: '₹', defaultTemplate: 'classic' },
    catalog: [{ id: 'prod_1700000000000_ab12', name: 'Soap', unitPrice: 40, unit: 'pcs', category: 'General' }],
    invoices: [{
      id: 'inv_1700000000000', invoiceNumber: 'BILL-004', date: '2026-10-30', status: 'Due',
      customer: { name: 'Meera', phone: '99123 45678' },
      items: [{ id: 'item_1', name: 'Soap', quantity: 3, unitPrice: 40, discount: 0 }],
      shippingFee: 20, createdAt: '2026-10-30T10:00:00.000Z'
    }]
  };
  const parsed = parseBackup(JSON.stringify(old));
  assert.equal(parsed.settings.brandName, 'Asha Candles');
  assert.equal(parsed.settings.setupDone, true, 'a named shop skips the setup');
  assert.equal(parsed.settings.billFormat, 'month');
  assert.equal(parsed.settings.billCode, '', 'the default BILL- prefix gives way to the shop initials');
  assert.equal(parsed.catalog[0].id, 'prod_1700000000000_ab12');
  const [bill] = parsed.invoices;
  assert.equal(bill.id, 'inv_1700000000000');
  assert.equal(bill.status, 'Due');
  assert.equal(bill.grandTotal, 140);
});

test('a hostile backup is rebuilt from safe values', () => {
  const hostile = {
    app: 'BillCraft',
    format: 2,
    settings: {
      brandName: '<img src=x onerror=alert(1)>',
      qrCustomImage: 'javascript:alert(1)',
      currency: '<script>',
      defaultTemplate: '../../evil',
      themeAccent: 'red" onclick="x',
      appLanguage: 'xx',
      voiceConsent: 'yes',
      unknownField: 'dropped'
    },
    catalog: [
      { id: 'x" onclick="alert(1)', name: 'Soap', unitPrice: -5 },
      { id: 'prod_1', name: '' }, // no name: dropped
      'not a product'
    ],
    invoices: [{
      id: 'inv_1', invoiceNumber: 'B'.repeat(500), date: '2026-13-45', dueDate: 'tomorrow',
      status: 'Hacked', template: 'nope', shippingFee: 'NaN', billDiscount: Infinity,
      discountType: '<b>', discountValue: -10,
      customer: 'not an object',
      items: [
        { id: 'inv_1', name: 'Dup id', quantity: -5, unitPrice: 1e300, discount: 500, productId: '"><svg>' },
        null
      ],
      createdAt: 'yesterday'
    }]
  };
  // A "__proto__" key can only arrive through the file's text, so it is added there
  const json = JSON.stringify(hostile).replace('"unknownField":"dropped"', '"unknownField":"dropped","__proto__":{"polluted":true}');
  assert.match(json, /"__proto__"/);
  const { settings, catalog, invoices } = parseBackup(json);

  assert.equal(settings.brandName, '<img src=x onerror=alert(1)>', 'text is kept as text; it is escaped when shown');
  assert.equal(escapeHTML(settings.brandName), '&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(settings.qrCustomImage, '');
  assert.equal(settings.currency, '₹');
  assert.equal(settings.defaultTemplate, 'modern');
  assert.equal(settings.themeAccent, 'emerald');
  assert.equal(settings.appLanguage, '');
  assert.equal(settings.voiceConsent, false);
  assert.equal('unknownField' in settings, false);
  assert.equal({}.polluted, undefined);
  assert.equal(settings.polluted, undefined);

  assert.equal(catalog.length, 1);
  assert.match(catalog[0].id, /^prod_[A-Za-z0-9_-]+$/);
  assert.equal(catalog[0].unitPrice, 0);

  const [bill] = invoices;
  assert.equal(bill.invoiceNumber.length, 40);
  assert.equal(bill.date, '');
  assert.equal(bill.dueDate, '');
  assert.equal(bill.status, 'Paid');
  assert.equal(bill.template, 'modern');
  assert.equal(bill.shippingFee, 0);
  assert.equal(bill.discountType, 'percent');
  assert.equal(bill.discountValue, 0);
  assert.equal(bill.discountAmount, 0);
  assert.deepEqual(bill.customer, { name: '', phone: '', address: '', note: '' });
  assert.equal(bill.items.length, 1);
  const [item] = bill.items;
  assert.notEqual(item.id, 'inv_1', 'an id already taken gets a new one');
  assert.equal(item.quantity, 1);
  assert.equal(item.unitPrice, 1e10);
  assert.equal(item.discount, 100);
  assert.equal(item.productId, null);
  assert.ok(!Number.isNaN(Date.parse(bill.createdAt)));
});

test('sections missing from the file are left alone', () => {
  const parsed = parseBackup(JSON.stringify({ app: 'BillCraft', format: 2, invoices: [] }));
  assert.equal(parsed.settings, null);
  assert.equal(parsed.catalog, null);
  assert.deepEqual(parsed.invoices, []);
});

test('a written backup reads back the same', () => {
  const json = buildBackup({
    settings: { brandName: 'Asha', billFormat: 'fy', billCode: 'as', setupDone: true },
    catalog: [{ id: 'prod_1', name: 'Soap', unitPrice: 40 }],
    invoices: [],
    counters: { 'AS/26-27/': 12, 'bad': -3 },
    appVersion: '1.0.0'
  });
  const data = JSON.parse(json);
  assert.equal(data.app, 'BillCraft');
  assert.equal(data.format, 3);
  const parsed = parseBackup(json);
  assert.equal(parsed.settings.billFormat, 'fy');
  assert.equal(parsed.settings.billCode, 'AS');
  assert.deepEqual(parsed.counters, { 'AS/26-27/': 12 });
  assert.equal(parsed.catalog[0].name, 'Soap');
});

test('escapeHTML covers quotes and keeps zero', () => {
  assert.equal(escapeHTML(`<a href="x" title='y'>&</a>`), '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
  assert.equal(escapeHTML(0), '0');
  assert.equal(escapeHTML(null), '');
  assert.equal(escapeHTML(undefined), '');
});

test('only inline pictures and the app QR code are accepted as images', () => {
  assert.equal(safeImageSrc('data:image/png;base64,iVBORw0KGgo='), 'data:image/png;base64,iVBORw0KGgo=');
  assert.equal(safeImageSrc('data:image/jpeg;base64,/9j/4AAQ'), 'data:image/jpeg;base64,/9j/4AAQ');
  assert.ok(safeImageSrc('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3C%2Fsvg%3E'));
  for (const bad of [
    'javascript:alert(1)',
    'https://example.com/qr.png',
    'data:image/png;base64,abc" onerror="alert(1)',
    'data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+',
    'data:text/html;base64,PHNjcmlwdD4=',
    'data:image/svg+xml;charset=utf-8,<svg onload=alert(1)>',
    42,
    null
  ]) {
    assert.equal(safeImageSrc(bad), '', String(bad));
  }
  assert.equal(safeImageSrc(`data:image/png;base64,${'A'.repeat(3_000_000)}`), '', 'too large');
});

test('CSV cells are quoted when needed, and formulas are disarmed', () => {
  assert.equal(csvCell('Meera'), 'Meera');
  assert.equal(csvCell('Deshmukh, Meera'), '"Deshmukh, Meera"');
  assert.equal(csvCell('5" candle'), '"5"" candle"');
  assert.equal(csvCell('line one\nline two'), '"line one\nline two"');
  assert.equal(csvCell('=HYPERLINK("http://x","click")'), `"'=HYPERLINK(""http://x"",""click"")"`);
  assert.equal(csvCell('+91 98765 43210'), "'+91 98765 43210");
  assert.equal(csvCell('-5'), "'-5");
  assert.equal(csvCell('@SUM(A1)'), "'@SUM(A1)");
  assert.equal(csvCell(1280.5), '1280.5');
  assert.equal(csvCell(0), '0');
  assert.equal(csvCell(null), '');
});

test('the bills spreadsheet has headings, plain numbers and a BOM for Hindi names', async () => {
  const { Invoice } = await import('../js/models.js');
  const { createTranslator, statusLabel } = await import('../js/i18n/i18n.js');
  const english = (await import('../js/i18n/locales/en.js')).default;
  const csv = invoicesToCSV([
    new Invoice({ invoiceNumber: 'BILL-002', date: '2026-11-03', status: 'Due', dueDate: '2026-11-10', customer: { name: 'मीरा', phone: '99123 45678' }, items: [{ name: 'Candle', quantity: 2, unitPrice: 450 }], shippingFee: 50, billDiscount: 30 }),
    new Invoice({ invoiceNumber: '=cmd', date: '2026-11-02', status: 'Paid', customer: {}, items: [] }),
    new Invoice({ invoiceNumber: 'AC-2611-003', date: '2026-11-04', status: 'Paid', customer: {}, items: [{ name: 'Soap', quantity: 3, unitPrice: 40 }], discountType: 'percent', discountValue: 10 })
  ], { t: createTranslator(english).t, statusLabel });
  assert.ok(csv.startsWith('﻿'));
  const lines = csv.slice(1).trimEnd().split('\r\n');
  assert.equal(lines[0], 'Bill number,Date,Customer,Phone,Items,Subtotal,Bill discount,Delivery,Total,Status,Pay by');
  assert.equal(lines[1], 'BILL-002,2026-11-03,मीरा,99123 45678,1,900,30,50,920,Due,2026-11-10');
  assert.equal(lines[2], "'=cmd,2026-11-02,,,0,0,0,0,0,Paid,");
  assert.equal(lines[3], 'AC-2611-003,2026-11-04,,,1,120,12,0,108,Paid,', 'a percent discount is written as its amount');
});

test('a bill keeps its discount through a backup, and an old flat discount reads as an amount', () => {
  const items = [{ name: 'Candle', quantity: 2, unitPrice: 450 }];
  const json = JSON.stringify({ app: 'BillCraft', format: 3, invoices: [
    { id: 'inv_1', invoiceNumber: 'AC-2611-001', date: '2026-11-04', items, discountType: 'percent', discountValue: 10 },
    { id: 'inv_2', invoiceNumber: 'AC-2611-002', date: '2026-11-04', items, discountType: 'amount', discountValue: 75 },
    { id: 'inv_3', invoiceNumber: 'BILL-003', date: '2026-10-30', items, billDiscount: 30 },
    { id: 'inv_4', invoiceNumber: 'AC-2611-004', date: '2026-11-04', items, discountType: 'percent', discountValue: 1e9 }
  ] });
  const [percent, amount, old, huge] = parseBackup(json).invoices;
  assert.deepEqual([percent.discountType, percent.discountValue, percent.discountAmount], ['percent', 10, 90]);
  assert.deepEqual([amount.discountType, amount.discountValue, amount.discountAmount], ['amount', 75, 75]);
  assert.deepEqual([old.discountType, old.discountValue, old.grandTotal], ['amount', 30, 870]);
  assert.equal(huge.discountValue, 100);
});

test('a backup from before 1.1 keeps its counter with its prefix', () => {
  const parsed = parseBackup(JSON.stringify({ version: '1.0', settings: { billPrefix: 'INV-' }, invoices: [], counter: 7 }));
  assert.deepEqual(parsed.counters, { 'INV-': 7 });
  assert.equal(parsed.settings.billCode, 'INV');
});
