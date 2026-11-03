import { test } from 'node:test';
import assert from 'node:assert/strict';

import { BackupError, buildBackup, parseBackup } from '../js/backup.js';
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
  assert.equal(parsed.settings.billPrefix, 'BILL-');
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
  assert.equal(bill.billDiscount, 0);
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
    settings: { brandName: 'Asha', billPrefix: 'INV/', setupDone: true },
    catalog: [{ id: 'prod_1', name: 'Soap', unitPrice: 40 }],
    invoices: [],
    counter: 12,
    appVersion: '1.0.0'
  });
  const data = JSON.parse(json);
  assert.equal(data.app, 'BillCraft');
  assert.equal(data.format, 2);
  const parsed = parseBackup(json);
  assert.equal(parsed.settings.billPrefix, 'INV/');
  assert.equal(parsed.counter, 12);
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
