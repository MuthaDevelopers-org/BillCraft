/**
 * Storage Service for LocalStorage Persistence
 */
import { Product, Invoice, BusinessSettings } from './models.js';

const STORAGE_KEYS = {
  SETTINGS: 'billcraft_settings',
  CATALOG: 'billcraft_catalog',
  INVOICES: 'billcraft_invoices',
  ACTIVE_DRAFT: 'billcraft_active_draft',
  COUNTER: 'billcraft_inv_counter',
  SCHEMA: 'billcraft_schema'
};

// 2: made-up shop details from versions before 1.0 are cleared (see migrate)
export const SCHEMA_VERSION = 2;

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

export const StorageService = {
  /** Brings stored data up to SCHEMA_VERSION. Runs once at start; safe to run again. */
  migrate() {
    const version = Number(localStorage.getItem(STORAGE_KEYS.SCHEMA)) || 1;
    if (version >= SCHEMA_VERSION) return;
    const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (data) {
      try {
        this.saveSettings(clearOldDemoSettings(JSON.parse(data)));
      } catch (e) {
        console.error('Could not update the saved settings', e);
      }
    }
    localStorage.setItem(STORAGE_KEYS.SCHEMA, String(SCHEMA_VERSION));
  },

  // --- Settings ---
  getSettings() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      return data ? new BusinessSettings(JSON.parse(data)) : new BusinessSettings();
    } catch (e) {
      console.error('Error loading settings:', e);
      return new BusinessSettings();
    }
  },

  saveSettings(settings) {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  },

  // --- Catalog ---
  getCatalog() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.CATALOG);
      return data ? JSON.parse(data).map(p => new Product(p)) : [];
    } catch (e) {
      console.error('Error loading catalog:', e);
      return [];
    }
  },

  saveCatalog(products) {
    localStorage.setItem(STORAGE_KEYS.CATALOG, JSON.stringify(products));
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

  // --- Invoices ---
  getInvoices() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.INVOICES);
      return data ? JSON.parse(data).map(inv => new Invoice(inv)) : [];
    } catch (e) {
      console.error('Error loading invoices:', e);
      return [];
    }
  },

  saveInvoices(invoices) {
    localStorage.setItem(STORAGE_KEYS.INVOICES, JSON.stringify(invoices));
  },

  saveInvoice(invoice) {
    const list = this.getInvoices();
    const existingIndex = list.findIndex(i => i.id === invoice.id);
    if (existingIndex !== -1) {
      list[existingIndex] = invoice;
    } else {
      list.unshift(invoice);
    }
    this.saveInvoices(list);
    return list;
  },

  deleteInvoice(invoiceId) {
    const list = this.getInvoices().filter(i => i.id !== invoiceId);
    this.saveInvoices(list);
    return list;
  },

  getInvoiceById(id) {
    const list = this.getInvoices();
    return list.find(i => i.id === id) || null;
  },

  // --- Invoice Numbering Sequence ---
  getNextInvoiceNumber() {
    const invoices = this.getInvoices();
    let maxNum = 0;
    invoices.forEach(inv => {
      const match = inv.invoiceNumber && inv.invoiceNumber.match(/(\d+)$/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    });
    const next = maxNum + 1;
    return `BILL-${String(next).padStart(3, '0')}`;
  },

  // --- Draft Persistence ---
  getActiveDraft() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.ACTIVE_DRAFT);
      return data ? new Invoice(JSON.parse(data)) : null;
    } catch (e) {
      return null;
    }
  },

  saveActiveDraft(invoice) {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_DRAFT, JSON.stringify(invoice));
  },

  clearActiveDraft() {
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_DRAFT);
  },

  // Backup & Restore
  exportBackupJSON() {
    const payload = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      settings: this.getSettings(),
      catalog: this.getCatalog(),
      invoices: this.getInvoices()
    };
    return JSON.stringify(payload, null, 2);
  },

  importBackupJSON(jsonString) {
    const data = JSON.parse(jsonString);
    if (!data || (!data.settings && !data.catalog && !data.invoices)) {
      throw new Error('Not a BillCraft backup file');
    }
    if (data.settings) this.saveSettings(clearOldDemoSettings(data.settings));
    if (data.catalog) this.saveCatalog(data.catalog);
    if (data.invoices) this.saveInvoices(data.invoices);
  }
};
