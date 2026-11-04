/**
 * BillCraft Data Models & Utilities
 */

import english from './i18n/locales/en.js';
import { spellAmount } from './i18n/numberWords.js';

/**
 * Rounds an amount to paise (2 decimals), half up. Shifting by exponent avoids
 * binary errors such as 10.075 * 100 = 1007.4999...
 */
export function roundMoney(value) {
  const n = Number(value) || 0;
  if (String(n).includes('e')) return Math.round(n * 100) / 100;
  return Math.round(Number(`${n}e2`)) / 100;
}

const nonNegative = value => Math.max(0, Number(value) || 0);

/** The currencies a bill can use (Settings). Amounts are placed into markup, so no other value is kept. */
export const CURRENCIES = ['₹', '$', '€', '£', 'AED', 'SAR', 'SGD'];

/** Today's date on this device, as YYYY-MM-DD. (toISOString() would give the UTC date, a day early before 5:30 am in India.) */
export function todayISO(now = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * A date for people to read, in their language with Latin digits: "3 Nov 2026",
 * "3 नव॰ 2026". A YYYY-MM-DD value is a calendar date; a full timestamp is shown
 * in this device's time zone. Anything else is returned as it is.
 */
export function formatDate(value, language = 'en') {
  const text = String(value || '');
  const calendarDate = /^\d{4}-\d{2}-\d{2}$/.test(text);
  const date = new Date(calendarDate ? `${text}T00:00:00Z` : text);
  if (!text || Number.isNaN(date.getTime())) return text;
  try {
    return new Intl.DateTimeFormat(`${language}-IN`, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      numberingSystem: 'latn',
      ...(calendarDate ? { timeZone: 'UTC' } : {})
    }).format(date);
  } catch {
    return text.slice(0, 10);
  }
}

/** A new unique id such as "inv_1f0c…". Random where the browser can, so two made in the same millisecond differ. */
export function newId(prefix) {
  const random = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${random}`;
}

export class Product {
  constructor({
    id = newId('prod'),
    name = '',
    description = '',
    unitPrice = 0,
    unit = 'pcs',
    category = 'General',
    sku = ''
  } = {}) {
    this.id = id;
    this.name = name;
    this.description = description;
    this.unitPrice = Number(unitPrice) || 0;
    this.unit = unit || 'pcs';
    this.category = category || 'General';
    this.sku = sku;
  }
}

export class InvoiceItem {
  constructor({
    id = newId('item'),
    productId = null,
    name = '',
    description = '',
    quantity = 1,
    unit = 'pcs',
    unitPrice = 0,
    discount = 0 // percent or flat
  } = {}) {
    this.id = id;
    this.productId = productId;
    this.name = name;
    this.description = description;
    this.quantity = Number(quantity) > 0 ? Number(quantity) : 1;
    this.unit = unit || 'pcs';
    this.unitPrice = nonNegative(unitPrice);
    this.discount = Math.min(100, nonNegative(discount)); // percent
  }

  /** The line amount in paise-exact rupees, so the printed lines add up to the subtotal */
  get total() {
    const gross = this.quantity * this.unitPrice;
    return roundMoney(gross - (gross * this.discount) / 100);
  }
}

export class Invoice {
  constructor({
    id = newId('inv'),
    invoiceNumber = 'BILL-001',
    date = todayISO(),
    dueDate = '',
    customer = {
      name: '',
      phone: '',
      address: '',
      note: ''
    },
    items = [],
    shippingFee = 0,
    billDiscount = 0, // flat discount
    notes = '', // empty prints the bill language's thank-you line
    template = 'modern',
    status = 'Paid', // Paid, Due, Draft
    createdAt = new Date().toISOString()
  } = {}) {
    this.id = id;
    this.invoiceNumber = invoiceNumber;
    this.date = date;
    this.dueDate = dueDate;
    this.customer = { ...customer };
    this.items = items.map(item => item instanceof InvoiceItem ? item : new InvoiceItem(item));
    this.shippingFee = nonNegative(shippingFee);
    this.billDiscount = nonNegative(billDiscount);
    this.notes = notes;
    this.template = template;
    this.status = status;
    this.createdAt = createdAt;
  }

  get subtotal() {
    return roundMoney(this.items.reduce((sum, item) => sum + item.total, 0));
  }

  get grandTotal() {
    return roundMoney(Math.max(0, this.subtotal - this.billDiscount) + this.shippingFee);
  }

  get totalItemsCount() {
    return Math.round(this.items.reduce((count, item) => count + item.quantity, 0) * 1000) / 1000;
  }

  /** True when every line uses the same unit, so a total quantity means something */
  get hasSingleUnit() {
    return new Set(this.items.map(item => String(item.unit || 'pcs').trim().toLowerCase())).size <= 1;
  }
}

/**
 * The seller's own details and preferences. Everything starts empty: the
 * first-run setup asks for the shop name, phone and UPI ID.
 */
export class BusinessSettings {
  constructor({
    sellerName = '',
    brandName = '',
    tagline = '',
    phone = '',
    email = '',
    address = '',
    currency = '₹',
    upiId = '',
    paymentNotes = '',
    defaultTemplate = 'modern',
    themeAccent = 'emerald',
    defaultNotes = '',
    qrCustomImage = '',
    appLanguage = '', // '' = not chosen yet, so the first-run picker is shown
    billLanguage = '', // '' = same as the app language
    voiceConsent = false, // set once the user agrees to voice typing
    setupDone = false, // set once the shop setup is finished or skipped
    billPrefix = 'BILL-', // bill numbers are this followed by 001, 002, ...
    lastBackupAt = '', // ISO time of the last backup file saved
    persistAsked = false // set once the browser was asked to keep this data
  } = {}) {
    this.sellerName = sellerName;
    this.brandName = brandName;
    this.tagline = tagline;
    this.phone = phone;
    this.email = email;
    this.address = address;
    this.currency = CURRENCIES.includes(currency) ? currency : '₹';
    this.upiId = upiId;
    this.paymentNotes = paymentNotes;
    this.defaultTemplate = defaultTemplate;
    this.themeAccent = themeAccent;
    this.defaultNotes = defaultNotes;
    this.qrCustomImage = qrCustomImage;
    this.appLanguage = appLanguage;
    this.billLanguage = billLanguage;
    this.voiceConsent = Boolean(voiceConsent);
    this.setupDone = Boolean(setupDone);
    this.billPrefix = String(billPrefix ?? 'BILL-');
    this.lastBackupAt = lastBackupAt;
    this.persistAsked = Boolean(persistAsked);
  }
}

/**
 * English amount in words, e.g. 1520 => "One Thousand Five Hundred and Twenty Only".
 * Other languages use spellAmount() with their own vocabulary (see i18n/).
 */
export function numberToWords(num) {
  return spellAmount(num, english.words);
}

/**
 * Currency formatter. Always Indian digit grouping with Latin digits, so
 * amounts match what the customer sees in UPI and payment apps.
 */
export function formatCurrency(amount, currency = '₹', decimals = 2) {
  const num = Number(amount) || 0;
  return `${currency} ${num.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  })}`;
}
