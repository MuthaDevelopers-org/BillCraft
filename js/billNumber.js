/**
 * Bill numbers that say something: a shop code, the period, and a count that starts
 * again each period. Pure functions, no DOM (tests/billNumber.test.js).
 *
 *   month (default)  AC-2611-042    Asha Candles, Nov 2026, 42nd bill that month
 *   day              AC-261104-03   4 Nov 2026, 3rd bill that day
 *   fy               AC/26-27/0412  financial year 2026-27 (April to March), 412th bill
 */

export const BILL_FORMATS = ['month', 'day', 'fy'];
export const DEFAULT_BILL_FORMAT = 'month';
const COUNT_DIGITS = { month: 3, day: 2, fy: 4 };
const FALLBACK_CODE = 'BC';

const pad = (value, size) => String(value).padStart(size, '0');

/** A code as typed in Settings: capital letters and digits only, at most 4 */
export function normalizeShopCode(code) {
  return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
}

/**
 * The shop code from the shop name: the initials of up to three words in Latin
 * letters (Asha Candles → AC), or the first two letters of a one-word name. A name
 * with no Latin letters (for example in Hindi) gets BC until a code is typed.
 */
export function shopCode(name) {
  const words = String(name || '').toUpperCase().match(/[A-Z0-9]+/g) || [];
  if (!words.length) return FALLBACK_CODE;
  const code = words.length === 1 ? words[0].slice(0, 2) : words.slice(0, 3).map(word => word[0]).join('');
  return code.length >= 2 ? code : `${code}${FALLBACK_CODE}`.slice(0, 2);
}

function dateParts(dateISO) {
  const [year, month, day] = String(dateISO).split('-').map(Number);
  return { year, month, day };
}

/** The financial year (April to March) a date falls in, by its starting year */
export function financialYearStart(dateISO) {
  const { year, month } = dateParts(dateISO);
  return month >= 4 ? year : year - 1;
}

/** Everything before the count: the shop code and the period, e.g. "AC-2611-" */
export function billScope(format, code, dateISO) {
  const { year, month, day } = dateParts(dateISO);
  const yy = pad(year % 100, 2);
  if (format === 'day') return `${code}-${yy}${pad(month, 2)}${pad(day, 2)}-`;
  if (format === 'fy') {
    const start = financialYearStart(dateISO);
    return `${code}/${pad(start % 100, 2)}-${pad((start + 1) % 100, 2)}/`;
  }
  return `${code}-${yy}${pad(month, 2)}-`;
}

export function formatBillNumber(format, code, dateISO, count) {
  return `${billScope(format, code, dateISO)}${pad(count, COUNT_DIGITS[format] || 3)}`;
}

/** A number's period and count, from its last run of digits: "AC-2611-042" → { scope: "AC-2611-", count: 42 } */
export function splitBillNumber(number) {
  const match = String(number || '').trim().match(/^(.*?)(\d+)$/);
  return match ? { scope: match[1], count: Number.parseInt(match[2], 10) } : null;
}

const PATTERNS = {
  day: /^([A-Z0-9]{1,4})-(\d{2})(\d{2})(\d{2})-(\d{2,})$/,
  month: /^([A-Z0-9]{1,4})-(\d{2})(\d{2})-(\d{3,})$/,
  fy: /^([A-Z0-9]{1,4})\/(\d{2})-(\d{2})\/(\d{4,})$/
};

/**
 * What a number says, or null for any other number (an old BILL-001 or one typed by
 * hand): { format, code, year, month, day, fyStart, count }. Years are 2000 + yy.
 */
export function readBillNumber(number) {
  const text = String(number || '').trim();
  let m = text.match(PATTERNS.day);
  if (m && Number(m[3]) >= 1 && Number(m[3]) <= 12) {
    return { format: 'day', code: m[1], year: 2000 + Number(m[2]), month: Number(m[3]), day: Number(m[4]), count: Number(m[5]) };
  }
  m = text.match(PATTERNS.month);
  if (m && Number(m[3]) >= 1 && Number(m[3]) <= 12) {
    return { format: 'month', code: m[1], year: 2000 + Number(m[2]), month: Number(m[3]), count: Number(m[4]) };
  }
  m = text.match(PATTERNS.fy);
  if (m && (Number(m[2]) + 1) % 100 === Number(m[3])) {
    return { format: 'fy', code: m[1], fyStart: 2000 + Number(m[2]), count: Number(m[4]) };
  }
  return null;
}
