import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  buildUPIString, dataCodewords, encodeQR, formatBits, generateQRCodeURL,
  isValidUpiId, qrToSVG, reedSolomonRemainder, versionBits
} from '../js/qrHelper.js';

// Module grids made by macOS Core Image (CIQRCodeGenerator, level M) for byte-mode texts,
// with the mask Core Image chose. Versions 4, 6 and 9, so block interleaving is covered.
const GOLDEN = JSON.parse(readFileSync(new URL('./fixtures/qr-golden.json', import.meta.url), 'utf8'));
const rowsOf = code => code.modules.map(row => row.map(dark => (dark ? '1' : '0')).join(''));

test('Reed-Solomon matches the published HELLO WORLD 1-M example', () => {
  const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
  assert.deepEqual(reedSolomonRemainder(data, 10), [196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
});

test('format bits for level M match the standard table', () => {
  const table = [
    '101010000010010', '101000100100101', '101111001111100', '101101101001011',
    '100010111111001', '100000011001110', '100111110010111', '100101010100000'
  ];
  table.forEach((bits, mask) => assert.equal(formatBits(mask).toString(2).padStart(15, '0'), bits));
});

test('version bits match the standard table', () => {
  assert.equal(versionBits(7), 0x07c94);
  assert.equal(versionBits(40), 0x28c69);
});

test('level M data capacity matches the standard', () => {
  assert.equal(dataCodewords(1), 16);
  assert.equal(dataCodewords(4), 64);
  assert.equal(dataCodewords(10), 216);
  assert.equal(dataCodewords(27), 1128);
  assert.equal(dataCodewords(40), 2334);
});

test('the smallest version that holds the text is used', () => {
  // Byte mode needs 4 bits of mode and an 8-bit count up to version 9
  const fits = version => 'a'.repeat(dataCodewords(version) - 2);
  assert.equal(encodeQR(fits(5)).version, 5);
  assert.equal(encodeQR(`${fits(5)}a`).version, 6);
  assert.equal(encodeQR('').version, 1);
});

test('every module matches Core Image for the same text and mask', () => {
  assert.ok(GOLDEN.length >= 3);
  for (const { text, mask, rows } of GOLDEN) {
    assert.deepEqual(rowsOf(encodeQR(text, { mask })), rows, text);
  }
});

test('the automatic mask matches the one Core Image picked', () => {
  const { text, mask } = GOLDEN[0];
  assert.equal(encodeQR(text).mask, mask);
});

test('text longer than the largest version is refused', () => {
  assert.throws(() => encodeQR('a'.repeat(2400)), RangeError);
  assert.equal(generateQRCodeURL('a'.repeat(2400)), '');
});

test('the SVG is square and keeps a 4-module light border', () => {
  const code = encodeQR('upi://pay?pa=asha@okaxis&pn=Asha&cu=INR&tn=Bill');
  const svg = qrToSVG(code);
  const total = code.size + 8;
  assert.match(svg, new RegExp(`viewBox="0 0 ${total} ${total}"`));
  assert.match(svg, new RegExp(`width="${total * 8}" height="${total * 8}"`));
  // No dark module is drawn inside the border
  const starts = [...svg.matchAll(/M(\d+) (\d+)/g)].map(([, x, y]) => [Number(x), Number(y)]);
  assert.ok(starts.every(([x, y]) => x >= 4 && y >= 4 && x < total - 4 && y < total - 4));
});

test('generateQRCodeURL gives an SVG data URL, or nothing for empty text', () => {
  assert.match(generateQRCodeURL('upi://pay?pa=asha@okaxis'), /^data:image\/svg\+xml;charset=utf-8,%3Csvg/);
  assert.equal(generateQRCodeURL(''), '');
});

test('UPI links carry the payee, a fixed amount and the bill number', () => {
  assert.equal(
    buildUPIString({ upiId: ' asha@okaxis ', brandName: 'Asha Candles', amount: 1280, invoiceNumber: 'BILL-003' }),
    'upi://pay?pa=asha@okaxis&pn=Asha%20Candles&am=1280.00&cu=INR&tn=Bill%20BILL-003'
  );
  // No amount when the bill is empty; the payee falls back to the name part of the UPI ID
  assert.equal(
    buildUPIString({ upiId: 'asha@okaxis', brandName: '', amount: 0, invoiceNumber: '' }),
    'upi://pay?pa=asha@okaxis&pn=asha&cu=INR&tn=Bill'
  );
  assert.equal(buildUPIString({ upiId: '' }), '');
});

test('UPI IDs are checked for the name@bank shape', () => {
  for (const id of ['asha.candles@okaxis', '9876543210@ybl', 'ram_kumar-1@oksbi', ' asha@upi ']) {
    assert.ok(isValidUpiId(id), id);
  }
  for (const id of ['', 'asha', '@okaxis', 'asha@', 'a@b', 'asha@ok axis', 'asha@@upi', 'asha@1bank', 'https://x.y']) {
    assert.ok(!isValidUpiId(id), id);
  }
});
