import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  billScope, financialYearStart, formatBillNumber, normalizeShopCode, readBillNumber, shopCode, splitBillNumber
} from '../js/billNumber.js';

test('the shop code is the initials of the shop name', () => {
  assert.equal(shopCode('Asha Candles'), 'AC');
  assert.equal(shopCode('Sri Lakshmi General Stores'), 'SLG');
  assert.equal(shopCode('R.K. Traders'), 'RKT');
  assert.equal(shopCode('Craftisan'), 'CR');
  assert.equal(shopCode('7 Stars'), '7S');
  assert.equal(shopCode('आशा कैंडल्स'), 'BC', 'no Latin letters: BC until a code is typed');
  assert.equal(shopCode(''), 'BC');
});

test('a typed shop code keeps capital letters and digits, at most four', () => {
  assert.equal(normalizeShopCode(' ac-1 '), 'AC1');
  assert.equal(normalizeShopCode('asha candles'), 'ASHA');
  assert.equal(normalizeShopCode('BILL-'), 'BILL');
  assert.equal(normalizeShopCode(undefined), '');
});

test('the three formats', () => {
  assert.equal(formatBillNumber('month', 'AC', '2026-11-04', 42), 'AC-2611-042');
  assert.equal(formatBillNumber('day', 'AC', '2026-11-04', 3), 'AC-261104-03');
  assert.equal(formatBillNumber('fy', 'AC', '2026-11-04', 412), 'AC/26-27/0412');
  assert.equal(formatBillNumber('month', 'AC', '2026-11-04', 1234), 'AC-2611-1234', 'a count past the digits still fits');
});

test('the financial year runs from April to March', () => {
  assert.equal(financialYearStart('2027-03-31'), 2026);
  assert.equal(financialYearStart('2027-04-01'), 2027);
  assert.equal(billScope('fy', 'AC', '2027-03-31'), 'AC/26-27/');
  assert.equal(billScope('fy', 'AC', '2027-04-01'), 'AC/27-28/');
  assert.equal(billScope('fy', 'AC', '2099-12-31'), 'AC/99-00/');
});

test('a number splits into its period and count', () => {
  assert.deepEqual(splitBillNumber('AC-2611-042'), { scope: 'AC-2611-', count: 42 });
  assert.deepEqual(splitBillNumber('AC/26-27/0412'), { scope: 'AC/26-27/', count: 412 });
  assert.deepEqual(splitBillNumber('BILL-005'), { scope: 'BILL-', count: 5 });
  assert.equal(splitBillNumber('no digits'), null);
});

test('a number can be read back into what it says', () => {
  assert.deepEqual(readBillNumber('AC-2611-042'), { format: 'month', code: 'AC', year: 2026, month: 11, count: 42 });
  assert.deepEqual(readBillNumber('AC-261104-03'), { format: 'day', code: 'AC', year: 2026, month: 11, day: 4, count: 3 });
  assert.deepEqual(readBillNumber('AC/26-27/0412'), { format: 'fy', code: 'AC', fyStart: 2026, count: 412 });
  assert.equal(readBillNumber('BILL-005'), null);
  assert.equal(readBillNumber('AC-2613-001'), null, 'there is no month 13');
  assert.equal(readBillNumber('AC/26-28/0001'), null, 'a financial year is one year long');
});
