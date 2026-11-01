/**
 * Storage Service for LocalStorage Persistence
 */
import { Product, Invoice, InvoiceItem, BusinessSettings } from './models.js';

const STORAGE_KEYS = {
  SETTINGS: 'billcraft_settings',
  CATALOG: 'billcraft_catalog',
  INVOICES: 'billcraft_invoices',
  ACTIVE_DRAFT: 'billcraft_active_draft',
  COUNTER: 'billcraft_inv_counter'
};

const DEFAULT_SAMPLE_PRODUCTS = [
  new Product({
    name: 'Handcrafted Soy Wax Candle (Lavender & Vanilla)',
    description: 'Eco-friendly 200g jar with 40+ hours burn time',
    unitPrice: 450,
    unit: 'pcs',
    category: 'Home & Decor',
    sku: 'DEC-01'
  }),
  new Product({
    name: 'Raw Organic Forest Honey (500g)',
    description: 'Unprocessed, wild flower nectar from Western Ghats',
    unitPrice: 380,
    unit: 'jar',
    category: 'Organic Pantry',
    sku: 'PAN-02'
  }),
  new Product({
    name: 'Handmade Ceramic Coffee Mug (Teal Glaze)',
    description: 'Microwave and dishwasher safe artisan pottery',
    unitPrice: 320,
    unit: 'pcs',
    category: 'Kitchenware',
    sku: 'KIT-03'
  }),
  new Product({
    name: 'Pure Cotton Hand-block Printed Tote Bag',
    description: 'Double-stitched durable daily shoulder bag',
    unitPrice: 280,
    unit: 'pcs',
    category: 'Apparel & Bags',
    sku: 'APP-04'
  }),
  new Product({
    name: 'Artisan Cold-Pressed Almond Oil (100ml)',
    description: '100% pure sweet almond skin & hair oil',
    unitPrice: 350,
    unit: 'bottle',
    category: 'Wellness',
    sku: 'WEL-05'
  })
];

export const StorageService = {
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
      if (!data) {
        this.saveCatalog(DEFAULT_SAMPLE_PRODUCTS);
        return DEFAULT_SAMPLE_PRODUCTS;
      }
      const parsed = JSON.parse(data);
      return parsed.map(p => new Product(p));
    } catch (e) {
      console.error('Error loading catalog:', e);
      return DEFAULT_SAMPLE_PRODUCTS;
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
      if (!data) {
        const sampleInvoice = this.createInitialSampleInvoice();
        this.saveInvoices([sampleInvoice]);
        return [sampleInvoice];
      }
      const parsed = JSON.parse(data);
      return parsed.map(inv => new Invoice(inv));
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

  createInitialSampleInvoice() {
    return new Invoice({
      id: 'inv_sample_001',
      invoiceNumber: 'BILL-001',
      date: new Date().toISOString().split('T')[0],
      customer: {
        name: 'Meera Deshmukh',
        phone: '+91 99123 45678',
        address: 'B-402, Lotus Residency, Indiranagar',
        note: 'Customer requested evening delivery'
      },
      items: [
        new InvoiceItem({
          name: 'Handcrafted Soy Wax Candle (Lavender & Vanilla)',
          description: 'Eco-friendly 200g jar with 40+ hours burn time',
          quantity: 2,
          unit: 'pcs',
          unitPrice: 450,
          discount: 0
        }),
        new InvoiceItem({
          name: 'Pure Cotton Hand-block Printed Tote Bag',
          description: 'Double-stitched durable daily shoulder bag',
          quantity: 1,
          unit: 'pcs',
          unitPrice: 280,
          discount: 10
        })
      ],
      shippingFee: 50,
      billDiscount: 30,
      notes: 'Thank you for supporting our domestic venture! Please retain this bill for your reference.',
      template: 'modern',
      status: 'Paid'
    });
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
    if (data.settings) this.saveSettings(data.settings);
    if (data.catalog) this.saveCatalog(data.catalog);
    if (data.invoices) this.saveInvoices(data.invoices);
  }
};
