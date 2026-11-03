/**
 * Storage Service: settings, products, bills and the open draft, in localStorage.
 * Every write goes through write(), so a full storage is reported as a
 * StorageFullError instead of failing silently.
 */
import { Product, Invoice, BusinessSettings } from './models.js';
import { buildBackup, clearOldDemoSettings, parseBackup } from './backup.js';

const STORAGE_KEYS = {
  SETTINGS: 'billcraft_settings',
  CATALOG: 'billcraft_catalog',
  INVOICES: 'billcraft_invoices',
  ACTIVE_DRAFT: 'billcraft_active_draft',
  COUNTER: 'billcraft_inv_counter',
  SCHEMA: 'billcraft_schema'
};

// The data that a backup holds and a restore replaces (the open draft is not part of it)
const BACKED_UP_KEYS = [STORAGE_KEYS.SETTINGS, STORAGE_KEYS.CATALOG, STORAGE_KEYS.INVOICES, STORAGE_KEYS.COUNTER];

// 2: made-up shop details from versions before 1.0 are cleared (see migrate)
export const SCHEMA_VERSION = 2;

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

/** The number at the end of a bill number, e.g. 12 for "BILL-012", or null */
export function trailingNumber(invoiceNumber) {
  const match = String(invoiceNumber || '').match(/(\d+)\s*$/);
  return match ? Number.parseInt(match[1], 10) : null;
}

const sameNumber = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

export const StorageService = {
  /** Brings stored data up to SCHEMA_VERSION. Runs once at start; safe to run again. */
  migrate() {
    const version = Number(localStorage.getItem(STORAGE_KEYS.SCHEMA)) || 1;
    if (version >= SCHEMA_VERSION) return;
    const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (data) {
      try {
        this.saveSettings(clearOldDemoSettings(JSON.parse(data)));
      } catch (error) {
        console.error('Could not update the saved settings', error);
      }
    }
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

  /** Adds the bill, or replaces the saved one with the same id. The bill number is then never reused. */
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

  // --- Bill numbers: a counter that only goes up, so a deleted bill's number is not given out again ---
  getNextInvoiceNumber(prefix = 'BILL-') {
    const counter = Number(localStorage.getItem(STORAGE_KEYS.COUNTER)) || 0;
    const highest = this.getInvoices().reduce((max, inv) => Math.max(max, trailingNumber(inv.invoiceNumber) || 0), counter);
    return `${prefix}${String(highest + 1).padStart(3, '0')}`;
  },

  noteBillNumber(invoiceNumber) {
    const number = trailingNumber(invoiceNumber);
    const counter = Number(localStorage.getItem(STORAGE_KEYS.COUNTER)) || 0;
    if (number !== null && number > counter) write(STORAGE_KEYS.COUNTER, String(number));
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
      counter: Number(localStorage.getItem(STORAGE_KEYS.COUNTER)) || 0,
      appVersion
    });
  },

  /** Writes a checked backup (see parseBackup). Sections missing from the file are left as they are. */
  applyBackup({ settings, catalog, invoices, counter }) {
    if (settings) this.saveSettings(settings);
    if (catalog) this.saveCatalog(catalog);
    if (invoices) this.saveInvoices(invoices);
    const current = Number(localStorage.getItem(STORAGE_KEYS.COUNTER)) || 0;
    if (counter > current) write(STORAGE_KEYS.COUNTER, String(counter));
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
