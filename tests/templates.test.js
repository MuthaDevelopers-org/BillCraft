import { test } from 'node:test';
import assert from 'node:assert/strict';

import { renderInvoice } from '../js/templates.js';
import { BusinessSettings, Invoice, InvoiceItem } from '../js/models.js';
import { createTranslator } from '../js/i18n/i18n.js';
import english from '../js/i18n/locales/en.js';

const TEMPLATES = ['modern', 'classic', 'boutique', 'thermal'];
const ATTACK = '<img src=x onerror="alert(1)">';

const hostileInvoice = () => new Invoice({
  invoiceNumber: `<script>alert(1)</script>`,
  date: `2026-11-03"><svg onload=alert(1)>`,
  dueDate: '2026-11-10',
  status: 'Due',
  customer: { name: ATTACK, phone: `"'><b>`, address: '<iframe src=javascript:alert(1)>', note: '</p><script>x</script>' },
  items: [new InvoiceItem({ name: ATTACK, description: '<u>desc</u>', unit: '<kg>', quantity: 2, unitPrice: 10, discount: 5 })],
  notes: '<marquee>notes</marquee>'
});

const hostileSettings = () => new BusinessSettings({
  brandName: ATTACK,
  sellerName: '<b>owner</b>',
  tagline: '<i>tag</i>',
  phone: '<phone>',
  email: '"><x>',
  address: '<addr>',
  upiId: '<upi>',
  paymentNotes: '<pay>',
  qrCustomImage: '" onerror="alert(1)',
  currency: '<script>'
});

// Every tag the hostile values could create; none may appear as real markup
const FORBIDDEN = /<(script|img src=x|svg onload|iframe|marquee|b>|i>|u>|kg>|x>|phone>|addr>|upi>|pay>)/i;

test('every bill design escapes what the user typed', () => {
  for (const template of TEMPLATES) {
    const html = renderInvoice(template, hostileInvoice(), hostileSettings(), '', createTranslator(english));
    assert.doesNotMatch(html, FORBIDDEN, template);
    assert.doesNotMatch(html, /onerror="alert/, template);
    assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/, `${template} shows the text`);
  }
});

test('an unsafe QR image is dropped, and the currency is one of the known ones', () => {
  for (const template of TEMPLATES) {
    const html = renderInvoice(template, hostileInvoice(), hostileSettings(), 'javascript:alert(1)', createTranslator(english));
    assert.doesNotMatch(html, /<img[^>]*src="[^"]*(javascript|onerror)/, template);
    assert.match(html, /₹ 19\.00/, `${template} shows the amount in rupees`);
  }
});

test('translations are escaped too', () => {
  const hostileLocale = { ...english, messages: { ...english.messages, 'bill.title': '<b>Bill</b>', 'bill.date': '<i>Date</i>' } };
  for (const template of TEMPLATES) {
    const html = renderInvoice(template, hostileInvoice(), hostileSettings(), '', createTranslator(hostileLocale));
    assert.doesNotMatch(html, /<b>Bill<\/b>|<i>Date<\/i>/, template);
  }
});

test('the app QR code is shown when it is the app\'s own SVG', () => {
  const qr = 'data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3C%2Fsvg%3E';
  const settings = new BusinessSettings({ upiId: 'asha@okaxis' });
  for (const template of TEMPLATES) {
    const html = renderInvoice(template, hostileInvoice(), settings, qr, createTranslator(english));
    assert.ok(html.includes(`src="${qr}"`), template);
  }
});
