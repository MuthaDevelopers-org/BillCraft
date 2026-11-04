/**
 * Storage Service: settings, products, bills and the open draft, in localStorage.
 * Every write goes through write(), so a full storage is reported as a
 * StorageFullError instead of failing silently.
 */
import { Product, Invoice, BusinessSettings } from './models.js';
import { buildBackup, clearOldDemoSettings, parseBackup } from './backup.js';
import { billScope, formatBillNumber, normalizeShopCode, splitBillNumber } from './billNumber.js';

const STORAGE_KEYS = {
  SETTINGS: 'billcraft_settings',
  CATALOG: 'billcraft_catalog',
  INVOICES: 'billcraft_invoices',
  ACTIVE_DRAFT: 'billcraft_active_draft',
  COUNTER: 'billcraft_inv_counter', // before 1.1: one counter for all bills
  COUNTERS: 'billcraft_counters', // the last count used in each period, e.g. { "AC-2611-": 42 }
  SCHEMA: 'billcraft_schema'
};

// The data that a backup holds and a restore replaces (the open draft is not part of it)
const BACKED_UP_KEYS = [STORAGE_KEYS.SETTINGS, STORAGE_KEYS.CATALOG, STORAGE_KEYS.INVOICES, STORAGE_KEYS.COUNTER, STORAGE_KEYS.COUNTERS];

// 2: made-up shop details from versions before 1.0 are cleared
// 3: bill numbers by period (a shop code and a format replace the prefix)
export const SCHEMA_VERSION = 3;

/** The browser refused to store more: the user must free space (back up, delete old bills) */
export class StorageFullError extends Error {
  constructor(cause) {
    super('Browser storage is full');
    this.name = 'StorageFullError';
    this.cause = cause;
  }
}

function isQuotaError(error) {
  return error instanceof DOMException
    && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED' || error.code === 22);
}

function write(key, value) {
  try {
    localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
  } catch (error) {
    throw isQuotaError(error) ? new StorageFullError(error) : error;
  }
}

function readList(key, Model) {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data).map(entry => new Model(entry)) : [];
  } catch (error) {
    console.error(`Could not read ${key}`, error);
    return [];
  }
}

const sameNumber = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

export const StorageService = {
  /** Brings stored data up to SCHEMA_VERSION. Runs once at start; safe to run again. */
  migrate() {
    const version = Number(localStorage.getItem(STORAGE_KEYS.SCHEMA)) || 1;
    if (version >= SCHEMA_VERSION) return;
    let settings = null;
    try {
      settings = JSON.parse(localStorage.getItem(STORAGE_KEYS.SETTINGS) || 'null');
    } catch (error) {
      console.error('Could not read the saved settings', error);
    }
    if (settings && version < 2) settings = clearOldDemoSettings(settings);
    if (version < 3) {
      // The old prefix becomes the shop code, unless it was the default BILL-;
      // the old counter stays with the numbers made with that prefix
      const prefix = settings && typeof settings.billPrefix === 'string' ? settings.billPrefix : 'BILL-';
      const oldCount = Number(localStorage.getItem(STORAGE_KEYS.COUNTER)) || 0;
      if (oldCount) this.saveCounters({ ...this.getCounters(), [prefix]: Math.max(oldCount, this.getCounters()[prefix] || 0) });
      if (settings) {
        const code = normalizeShopCode(prefix);
        if (settings.billCode === undefined) settings.billCode = code === 'BILL' ? '' : code;
        delete settings.billPrefix;
      }
    }
    if (settings) this.saveSettings(settings);
    write(STORAGE_KEYS.SCHEMA, String(SCHEMA_VERSION));
  },

  // --- Settings ---
  getSettings() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      return data ? new BusinessSettings(JSON.parse(data)) : new BusinessSettings();
    } catch (error) {
      console.error('Could not read the settings', error);
      return new BusinessSettings();
    }
  },

  saveSettings(settings) {
    write(STORAGE_KEYS.SETTINGS, settings);
  },

  // --- Catalog ---
  getCatalog() {
    return readList(STORAGE_KEYS.CATALOG, Product);
  },

  saveCatalog(products) {
    write(STORAGE_KEYS.CATALOG, products);
  },

  addProduct(product) {
    const catalog = this.getCatalog();
    catalog.unshift(product);
    this.saveCatalog(catalog);
    return catalog;
  },

  updateProduct(updated) {
    const catalog = this.getCatalog();
    const index = catalog.findIndex(p => p.id === updated.id);
    if (index !== -1) {
      catalog[index] = updated;
      this.saveCatalog(catalog);
    }
    return catalog;
  },

  deleteProduct(productId) {
    const catalog = this.getCatalog().filter(p => p.id !== productId);
    this.saveCatalog(catalog);
    return catalog;
  },

  // --- Bills ---
  getInvoices() {
    return readList(STORAGE_KEYS.INVOICES, Invoice);
  },

  saveInvoices(invoices) {
    write(STORAGE_KEYS.INVOICES, invoices);
  },

  /** Adds the bill, or replaces the saved one with the same id. Its number is then never given out again. */
  saveInvoice(invoice) {
    const list = this.getInvoices();
    const existingIndex = list.findIndex(i => i.id === invoice.id);
    if (existingIndex !== -1) {
      list[existingIndex] = invoice;
    } else {
      list.unshift(invoice);
    }
    this.saveInvoices(list);
    this.noteBillNumber(invoice.invoiceNumber);
    return list;
  },

  deleteInvoice(invoiceId) {
    const list = this.getInvoices().filter(i => i.id !== invoiceId);
    this.saveInvoices(list);
    return list;
  },

  getInvoiceById(id) {
    return this.getInvoices().find(i => i.id === id) || null;
  },

  /** Another saved bill with this number (ignoring case and spaces), other than `exceptId` */
  findInvoiceByNumber(invoiceNumber, exceptId) {
    return this.getInvoices().find(inv => inv.id !== exceptId && sameNumber(inv.invoiceNumber, invoiceNumber)) || null;
  },

  // --- Bill numbers: a count per period that only goes up (see js/billNumber.js) ---
  getCounters() {
    try {
      const counters = JSON.parse(localStorage.getItem(STORAGE_KEYS.COUNTERS) || '{}');
      return counters && typeof counters === 'object' && !Array.isArray(counters) ? counters : {};
    } catch {
      return {};
    }
  },

  saveCounters(counters) {
    write(STORAGE_KEYS.COUNTERS, counters);
  },

  /**
   * The next number for a bill dated `dateISO`: one more than the highest count used
   * in that period, saved or deleted, so a number is never given out twice.
   */
  nextBillNumber(format, code, dateISO) {
    const scope = billScope(format, code, dateISO);
    const same = text => text.toLowerCase() === scope.toLowerCase();
    const counters = this.getCounters();
    const counted = Object.entries(counters).reduce((max, [key, value]) => (same(key) ? Math.max(max, Number(value) || 0) : max), 0);
    const highest = this.getInvoices().reduce((max, inv) => {
      const split = splitBillNumber(inv.invoiceNumber);
      return split && same(split.scope) ? Math.max(max, split.count) : max;
    }, counted);
    return formatBillNumber(format, code, dateISO, highest + 1);
  },

  /** Remembers the count of a saved bill's number in its period */
  noteBillNumber(invoiceNumber) {
    const split = splitBillNumber(invoiceNumber);
    if (!split) return;
    const counters = this.getCounters();
    if (split.count > (Number(counters[split.scope]) || 0)) this.saveCounters({ ...counters, [split.scope]: split.count });
  },

  // --- Draft Persistence ---
  getActiveDraft() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.ACTIVE_DRAFT);
      return data ? new Invoice(JSON.parse(data)) : null;
    } catch {
      return null;
    }
  },

  saveActiveDraft(invoice) {
    write(STORAGE_KEYS.ACTIVE_DRAFT, invoice);
  },

  clearActiveDraft() {
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_DRAFT);
  },

  // --- Backup & Restore ---
  exportBackupJSON(appVersion = '') {
    return buildBackup({
      settings: this.getSettings(),
      catalog: this.getCatalog(),
      invoices: this.getInvoices(),
      counters: this.getCounters(),
      appVersion
    });
  },

  /** Writes a checked backup (see parseBackup). Sections missing from the file are left as they are. */
  applyBackup({ settings, catalog, invoices, counters }) {
    if (settings) this.saveSettings(settings);
    if (catalog) this.saveCatalog(catalog);
    if (invoices) this.saveInvoices(invoices);
    // Counts only go up: keep the higher of the phone's and the file's for each period
    const merged = { ...this.getCounters() };
    for (const [scope, count] of Object.entries(counters || {})) merged[scope] = Math.max(Number(merged[scope]) || 0, count);
    this.saveCounters(merged);
  },

  importBackupJSON(jsonString) {
    this.applyBackup(parseBackup(jsonString));
  },

  /** The stored data a restore replaces, exactly as stored, so the restore can be undone */
  snapshot() {
    return Object.fromEntries(BACKED_UP_KEYS.map(key => [key, localStorage.getItem(key)]));
  },

  restoreSnapshot(snapshot) {
    for (const [key, value] of Object.entries(snapshot)) {
      if (value === null) {
        localStorage.removeItem(key);
      } else {
        write(key, value);
      }
    }
  }
};
