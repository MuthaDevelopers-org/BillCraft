/**
 * Backup files: what is written, and what is accepted back.
 *
 * A file is checked completely, and every value rebuilt from the fields the app
 * expects, before anything on the phone is replaced. A damaged or hostile file
 * changes nothing; unknown fields are dropped and odd values get safe defaults.
 */

import { BusinessSettings, CURRENCIES, Invoice, InvoiceItem, Product, newId } from './models.js';
import { getLanguage } from './i18n/languages.js';
import { safeImageSrc } from './safe.js';
import { BILL_FORMATS, DEFAULT_BILL_FORMAT, normalizeShopCode } from './billNumber.js';

// 3: bill-number counters per period, discount type and value, product pictures
export const BACKUP_FORMAT = 3;
export const MAX_BACKUP_BYTES = 25 * 1024 * 1024;

const TEMPLATES = ['modern', 'classic', 'boutique', 'thermal'];
const ACCENTS = ['emerald', 'sapphire', 'purple', 'rose', 'amber', 'charcoal'];
const STATUSES = ['Paid', 'Due', 'Draft'];
const MAX_TEXT = 300;
const MAX_LONG_TEXT = 2000;
const MAX_ITEMS_PER_BILL = 1000;
const MAX_AMOUNT = 1e10;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;

/** A file that is not a BillCraft backup ('not-backup') or comes from a newer version ('newer') */
export class BackupError extends Error {
  constructor(reason) {
    super(`Backup refused: ${reason}`);
    this.name = 'BackupError';
    this.reason = reason;
  }
}

// Versions before 1.0 started every install with a made-up shop and saved it with
// the first change of settings. Above all the UPI ID: it belongs to nobody here, and
// a bill carrying it would ask customers to pay a stranger.
const OLD_DEMO_SETTINGS = {
  sellerName: 'Aarav Sharma',
  brandName: 'Craftisan Studio',
  tagline: 'Handmade Domestic Goods & Curations',
  phone: '+91 98765 43210',
  email: 'contact@craftisan.store',
  address: '12 Green Avenue, Gandhi Nagar, Bengaluru, KA',
  upiId: 'craftisan@upi',
  paymentNotes: 'Scan QR code or pay to UPI ID for quick settlement.',
  defaultNotes: 'Thank you for supporting our domestic venture! Please retain this bill for your reference.'
};

/**
 * Clears each setting that still holds its made-up value from before 1.0. Values
 * the user typed are kept. Someone who already named their shop skips the setup.
 */
export function clearOldDemoSettings(settings) {
  const cleaned = { ...settings };
  for (const [field, demo] of Object.entries(OLD_DEMO_SETTINGS)) {
    if (cleaned[field] === demo) cleaned[field] = '';
  }
  if (cleaned.setupDone === undefined) cleaned.setupDone = Boolean(cleaned.brandName);
  return cleaned;
}

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, max = MAX_TEXT) =>
  (typeof value === 'string' || typeof value === 'number' ? String(value).trim().slice(0, max) : '');
const amount = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.min(n, MAX_AMOUNT) : 0;
};
const oneOf = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);
const isoDate = value =>
  (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) ? value : '');
const timestamp = value =>
  (typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : '');
const languageCode = code => (typeof code === 'string' && getLanguage(code)?.loader ? code : '');

/** Keeps an id that is well formed and not taken; otherwise makes a new one */
function uniqueId(value, prefix, seen) {
  const id = typeof value === 'string' && ID_PATTERN.test(value) && !seen.has(value) ? value : newId(prefix);
  seen.add(id);
  return id;
}

/** The shop code, or from a backup made before 1.1, its bill prefix unless it was the default BILL- */
function legacyShopCode(raw) {
  if (raw.billCode !== undefined) return normalizeShopCode(raw.billCode);
  const code = normalizeShopCode(raw.billPrefix);
  return code === 'BILL' ? '' : code;
}

/** Counts per bill-number period; a backup made before 1.1 has one counter for its prefix */
function readCounters(data) {
  const counters = {};
  if (isObject(data.counters)) {
    for (const [scope, count] of Object.entries(data.counters)) {
      if (scope.length <= 40 && Number.isInteger(count) && count > 0) counters[scope] = count;
    }
  }
  if (Number.isInteger(data.counter) && data.counter > 0) {
    const prefix = isObject(data.settings) && typeof data.settings.billPrefix === 'string' ? data.settings.billPrefix : 'BILL-';
    counters[prefix] = Math.max(counters[prefix] || 0, data.counter);
  }
  return counters;
}

function readSettings(raw) {
  return new BusinessSettings({
    sellerName: text(raw.sellerName),
    brandName: text(raw.brandName),
    tagline: text(raw.tagline),
    phone: text(raw.phone, 40),
    email: text(raw.email, 120),
    address: text(raw.address, 500),
    currency: oneOf(raw.currency, CURRENCIES, '₹'),
    upiId: text(raw.upiId, 120),
    paymentNotes: text(raw.paymentNotes, 500),
    defaultTemplate: oneOf(raw.defaultTemplate, TEMPLATES, 'modern'),
    themeAccent: oneOf(raw.themeAccent, ACCENTS, 'emerald'),
    defaultNotes: text(raw.defaultNotes, MAX_LONG_TEXT),
    qrCustomImage: safeImageSrc(raw.qrCustomImage),
    appLanguage: languageCode(raw.appLanguage),
    billLanguage: languageCode(raw.billLanguage),
    voiceConsent: raw.voiceConsent === true,
    setupDone: raw.setupDone === true,
    billFormat: oneOf(raw.billFormat, BILL_FORMATS, DEFAULT_BILL_FORMAT),
    billCode: legacyShopCode(raw),
    lastBackupAt: timestamp(raw.lastBackupAt),
    persistAsked: raw.persistAsked === true,
    installTipShown: raw.installTipShown === true
  });
}

function readProduct(raw, seen) {
  if (!isObject(raw) || !text(raw.name)) return null;
  return new Product({
    id: uniqueId(raw.id, 'prod', seen),
    name: text(raw.name),
    description: text(raw.description, 500),
    unitPrice: amount(raw.unitPrice),
    unit: text(raw.unit, 20) || 'pcs',
    category: text(raw.category, 60),
    sku: text(raw.sku, 40)
  });
}

function readItem(raw, seen) {
  if (!isObject(raw)) return null;
  const quantity = Number(raw.quantity);
  return new InvoiceItem({
    id: uniqueId(raw.id, 'item', seen),
    productId: typeof raw.productId === 'string' && ID_PATTERN.test(raw.productId) ? raw.productId : null,
    name: text(raw.name),
    description: text(raw.description, 500),
    quantity: Number.isFinite(quantity) && quantity > 0 ? Math.min(quantity, 1e6) : 1,
    unit: text(raw.unit, 20) || 'pcs',
    unitPrice: amount(raw.unitPrice),
    discount: Math.min(100, amount(raw.discount))
  });
}

function readInvoice(raw, seen) {
  if (!isObject(raw)) return null;
  const customer = isObject(raw.customer) ? raw.customer : {};
  const items = Array.isArray(raw.items) ? raw.items.slice(0, MAX_ITEMS_PER_BILL) : [];
  return new Invoice({
    id: uniqueId(raw.id, 'inv', seen),
    invoiceNumber: text(raw.invoiceNumber, 40),
    date: isoDate(raw.date),
    dueDate: isoDate(raw.dueDate),
    customer: {
      name: text(customer.name),
      phone: text(customer.phone, 40),
      address: text(customer.address, 500),
      note: text(customer.note, 500)
    },
    items: items.map(item => readItem(item, seen)).filter(Boolean),
    shippingFee: amount(raw.shippingFee),
    billDiscount: amount(raw.billDiscount),
    notes: text(raw.notes, MAX_LONG_TEXT),
    template: oneOf(raw.template, TEMPLATES, 'modern'),
    status: oneOf(raw.status, STATUSES, 'Paid'),
    createdAt: timestamp(raw.createdAt) || new Date().toISOString(),
    numberAuto: raw.numberAuto === true
  });
}

/**
 * Reads a backup file's text. Returns { settings, catalog, invoices, counters }, where a
 * section missing from the file is null (left as it is on the phone). Throws a
 * BackupError when the file is not a BillCraft backup.
 */
export function parseBackup(json) {
  let data;
  try {
    data = JSON.parse(json);
  } catch {
    throw new BackupError('not-backup');
  }
  if (!isObject(data) || (data.app !== undefined && data.app !== 'BillCraft')) throw new BackupError('not-backup');
  const hasSettings = isObject(data.settings);
  const hasCatalog = Array.isArray(data.catalog);
  const hasInvoices = Array.isArray(data.invoices);
  if (!hasSettings && !hasCatalog && !hasInvoices) throw new BackupError('not-backup');
  if (Number(data.format) > BACKUP_FORMAT) throw new BackupError('newer');

  const seen = new Set();
  return {
    settings: hasSettings ? readSettings(clearOldDemoSettings(data.settings)) : null,
    catalog: hasCatalog ? data.catalog.map(product => readProduct(product, seen)).filter(Boolean) : null,
    invoices: hasInvoices ? data.invoices.map(invoice => readInvoice(invoice, seen)).filter(Boolean) : null,
    counters: readCounters(data)
  };
}

/** The text of a backup file */
export function buildBackup({ settings, catalog, invoices, counters, appVersion }) {
  return JSON.stringify({
    app: 'BillCraft',
    format: BACKUP_FORMAT,
    appVersion,
    exportedAt: new Date().toISOString(),
    settings,
    catalog,
    invoices,
    counters
  }, null, 2);
}

// --- Spreadsheet export ---

/**
 * One CSV cell. Text that a spreadsheet would run as a formula (starting with
 * = + - @, tab or return) gets a leading apostrophe; quotes, commas and line
 * breaks are quoted. Numbers are written as plain numbers.
 */
export function csvCell(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * The bills as a CSV file for Excel or an accountant: a byte-order mark (so Hindi
 * names open correctly), column headings in the app language, one row per bill,
 * amounts as plain numbers with two decimals, and dates as YYYY-MM-DD.
 */
export function invoicesToCSV(invoices, { t, statusLabel }) {
  const headings = ['csv.number', 'csv.date', 'csv.customer', 'csv.phone', 'csv.items', 'csv.subtotal',
    'csv.discount', 'csv.delivery', 'csv.total', 'csv.status', 'csv.payBy'].map(key => t(key));
  const money = amount => Number(Number(amount || 0).toFixed(2));
  const rows = invoices.map(inv => [
    inv.invoiceNumber,
    inv.date,
    inv.customer.name,
    inv.customer.phone,
    inv.items.length,
    money(inv.subtotal),
    money(inv.billDiscount),
    money(inv.shippingFee),
    money(inv.grandTotal),
    statusLabel(t, inv.status),
    inv.status === 'Due' ? inv.dueDate : ''
  ]);
  return `﻿${[headings, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}
