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

export class Product {
  constructor({
    id = 'prod_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
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
    id = 'item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
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
    id = 'inv_' + Date.now(),
    invoiceNumber = 'BILL-001',
    date = new Date().toISOString().split('T')[0],
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
    notes = 'Thank you for your business! Items once sold can be exchanged within 7 days.',
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

export class BusinessSettings {
  constructor({
    sellerName = 'Aarav Sharma',
    brandName = 'Craftisan Studio',
    tagline = 'Handmade Domestic Goods & Curations',
    phone = '+91 98765 43210',
    email = 'contact@craftisan.store',
    address = '12 Green Avenue, Gandhi Nagar, Bengaluru, KA',
    currency = '₹',
    upiId = 'craftisan@upi',
    paymentNotes = 'Scan QR code or pay to UPI ID for quick settlement.',
    defaultTemplate = 'modern',
    themeAccent = 'emerald',
    defaultNotes = 'Thank you for supporting our domestic venture! Please retain this bill for your reference.',
    qrCustomImage = '',
    appLanguage = '', // '' = not chosen yet, so the first-run picker is shown
    billLanguage = '', // '' = same as the app language
    voiceConsent = false // set once the user agrees to voice typing
  } = {}) {
    this.sellerName = sellerName;
    this.brandName = brandName;
    this.tagline = tagline;
    this.phone = phone;
    this.email = email;
    this.address = address;
    this.currency = currency;
    this.upiId = upiId;
    this.paymentNotes = paymentNotes;
    this.defaultTemplate = defaultTemplate;
    this.themeAccent = themeAccent;
    this.defaultNotes = defaultNotes;
    this.qrCustomImage = qrCustomImage;
    this.appLanguage = appLanguage;
    this.billLanguage = billLanguage;
    this.voiceConsent = Boolean(voiceConsent);
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
export function formatCurrency(amount, currency = '₹') {
  const num = Number(amount) || 0;
  return `${currency} ${num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}
