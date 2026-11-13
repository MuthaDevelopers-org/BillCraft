import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { StorageService, SCHEMA_VERSION, StorageFullError } from '../js/storage.js';
import { clearOldDemoSettings } from '../js/backup.js';
import { Invoice } from '../js/models.js';

// A stand-in for the browser's localStorage, emptied before each test
class MemoryStorage {
  constructor() { this.map = new Map(); this.full = false; }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) {
    if (this.full) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    this.map.set(key, String(value));
  }
  removeItem(key) { this.map.delete(key); }
  clear() { this.map.clear(); }
}

beforeEach(() => {
  globalThis.localStorage = new MemoryStorage();
});

const stored = key => JSON.parse(localStorage.getItem(key));

// What versions before 1.0 saved for a shop whose owner had changed only the language
const OLD_SETTINGS = {
  sellerName: 'Aarav Sharma',
  brandName: 'Craftisan Studio',
  tagline: 'Handmade Domestic Goods & Curations',
  phone: '+91 98765 43210',
  email: 'contact@craftisan.store',
  address: '12 Green Avenue, Gandhi Nagar, Bengaluru, KA',
  currency: '₹',
  upiId: 'craftisan@upi',
  paymentNotes: 'Scan QR code or pay to UPI ID for quick settlement.',
  defaultTemplate: 'classic',
  themeAccent: 'rose',
  defaultNotes: 'Thank you for supporting our domestic venture! Please retain this bill for your reference.',
  appLanguage: 'hi'
};

test('a new install starts with no products, no bills and empty shop details', () => {
  assert.deepEqual(StorageService.getCatalog(), []);
  assert.deepEqual(StorageService.getInvoices(), []);
  const settings = StorageService.getSettings();
  assert.equal(settings.brandName, '');
  assert.equal(settings.upiId, '');
  assert.equal(settings.setupDone, false);
  // Reading must not write sample data
  assert.equal(localStorage.getItem('billcraft_catalog'), null);
  assert.equal(localStorage.getItem('billcraft_invoices'), null);
});

test('migration clears the made-up shop, including its UPI ID, and keeps real choices', () => {
  localStorage.setItem('billcraft_settings', JSON.stringify(OLD_SETTINGS));
  StorageService.migrate();
  const settings = stored('billcraft_settings');
  for (const field of ['sellerName', 'brandName', 'tagline', 'phone', 'email', 'address', 'upiId', 'paymentNotes', 'defaultNotes']) {
    assert.equal(settings[field], '', field);
  }
  assert.equal(settings.defaultTemplate, 'classic');
  assert.equal(settings.themeAccent, 'rose');
  assert.equal(settings.appLanguage, 'hi');
  assert.equal(settings.setupDone, false, 'the shop setup is offered, since the shop has no name now');
  assert.equal(localStorage.getItem('billcraft_schema'), String(SCHEMA_VERSION));
});

test('migration keeps details the owner typed, and skips the setup for a named shop', () => {
  localStorage.setItem('billcraft_settings', JSON.stringify({ ...OLD_SETTINGS, brandName: 'Asha Candles', upiId: 'asha@okaxis' }));
  StorageService.migrate();
  const settings = stored('billcraft_settings');
  assert.equal(settings.brandName, 'Asha Candles');
  assert.equal(settings.upiId, 'asha@okaxis');
  assert.equal(settings.phone, '', 'the made-up phone number is still cleared');
  assert.equal(settings.setupDone, true);
});

test('migration runs once and leaves products and bills alone', () => {
  localStorage.setItem('billcraft_settings', JSON.stringify(OLD_SETTINGS));
  localStorage.setItem('billcraft_catalog', JSON.stringify([{ id: 'p1', name: 'Soap', unitPrice: 40 }]));
  localStorage.setItem('billcraft_invoices', JSON.stringify([{ id: 'inv_1', invoiceNumber: 'BILL-001', items: [] }]));
  StorageService.migrate();
  // The owner now types the old demo phone number on purpose; a second run must keep it
  const settings = stored('billcraft_settings');
  settings.phone = '+91 98765 43210';
  localStorage.setItem('billcraft_settings', JSON.stringify(settings));
  StorageService.migrate();
  assert.equal(stored('billcraft_settings').phone, '+91 98765 43210');
  assert.equal(StorageService.getCatalog()[0].name, 'Soap');
  assert.equal(StorageService.getInvoices()[0].invoiceNumber, 'BILL-001');
});

test('migration without saved settings only records the schema version', () => {
  StorageService.migrate();
  assert.equal(localStorage.getItem('billcraft_settings'), null);
  assert.equal(localStorage.getItem('billcraft_schema'), String(SCHEMA_VERSION));
});

test('a backup from before 1.0 is restored without the made-up shop', () => {
  StorageService.importBackupJSON(JSON.stringify({ version: '1.0', settings: OLD_SETTINGS, catalog: [], invoices: [] }));
  const settings = stored('billcraft_settings');
  assert.equal(settings.upiId, '');
  assert.equal(settings.brandName, '');
  assert.equal(settings.defaultTemplate, 'classic');
});

test('clearing old demo settings does not change the object passed in', () => {
  const original = { ...OLD_SETTINGS };
  clearOldDemoSettings(original);
  assert.equal(original.upiId, 'craftisan@upi');
});

test('a full storage is reported, and nothing is half written', () => {
  StorageService.saveInvoice(new Invoice({ id: 'inv_1', invoiceNumber: 'BILL-001' }));
  localStorage.full = true;
  assert.throws(() => StorageService.saveInvoice(new Invoice({ id: 'inv_2', invoiceNumber: 'BILL-002' })), StorageFullError);
  localStorage.full = false;
  assert.deepEqual(StorageService.getInvoices().map(inv => inv.id), ['inv_1']);
});

test('bill numbers count up within their period, even after the latest bill is deleted', () => {
  assert.equal(StorageService.nextBillNumber('month', 'AC', '2026-11-04'), 'AC-2611-001');
  StorageService.saveInvoice(new Invoice({ id: 'inv_5', invoiceNumber: 'AC-2611-005' }));
  assert.equal(StorageService.nextBillNumber('month', 'AC', '2026-11-20'), 'AC-2611-006');
  StorageService.deleteInvoice('inv_5');
  assert.equal(StorageService.nextBillNumber('month', 'AC', '2026-11-20'), 'AC-2611-006', 'a deleted number is not given out again');
  assert.equal(StorageService.nextBillNumber('month', 'AC', '2026-12-01'), 'AC-2612-001', 'a new month starts again');
  assert.equal(StorageService.nextBillNumber('day', 'AC', '2026-11-04'), 'AC-261104-01');
  assert.equal(StorageService.nextBillNumber('fy', 'AC', '2026-11-04'), 'AC/26-27/0001');
});

test('migration 3: the old prefix becomes the shop code, and its counter stays with old numbers', () => {
  localStorage.setItem('billcraft_schema', '2');
  localStorage.setItem('billcraft_settings', JSON.stringify({ brandName: 'Asha Candles', billPrefix: 'INV/', setupDone: true }));
  localStorage.setItem('billcraft_inv_counter', '17');
  StorageService.migrate();
  const settings = stored('billcraft_settings');
  assert.equal(settings.billCode, 'INV');
  assert.equal('billPrefix' in settings, false);
  assert.equal(StorageService.getSettings().billFormat, 'month');
  assert.equal(StorageService.getCounters()['INV/'], 17);
  assert.equal(localStorage.getItem('billcraft_schema'), String(SCHEMA_VERSION));
});

test('migration 3: the default BILL- prefix gives way to the shop initials', () => {
  localStorage.setItem('billcraft_schema', '2');
  localStorage.setItem('billcraft_settings', JSON.stringify({ brandName: 'Asha Candles', billPrefix: 'BILL-', setupDone: true }));
  StorageService.migrate();
  assert.equal(stored('billcraft_settings').billCode, '');
});

test('a bill number already used by another bill is found, ignoring case and spaces', () => {
  StorageService.saveInvoice(new Invoice({ id: 'inv_1', invoiceNumber: 'BILL-007' }));
  assert.equal(StorageService.findInvoiceByNumber(' bill-007 ', 'inv_2').id, 'inv_1');
  assert.equal(StorageService.findInvoiceByNumber('BILL-007', 'inv_1'), null, 'the bill itself does not count');
  assert.equal(StorageService.findInvoiceByNumber('BILL-008', 'inv_2'), null);
});

test('a restore can be undone exactly', () => {
  StorageService.saveSettings({ brandName: 'Asha Candles' });
  StorageService.saveInvoice(new Invoice({ id: 'inv_1', invoiceNumber: 'BILL-001' }));
  const before = StorageService.snapshot();
  StorageService.importBackupJSON(JSON.stringify({ app: 'BillCraft', format: 2, settings: { brandName: 'Other' }, catalog: [], invoices: [] }));
  assert.equal(StorageService.getSettings().brandName, 'Other');
  StorageService.restoreSnapshot(before);
  assert.equal(StorageService.getSettings().brandName, 'Asha Candles');
  assert.equal(StorageService.getInvoices()[0].id, 'inv_1');
  assert.equal(localStorage.getItem('billcraft_catalog'), null, 'a section that did not exist is removed again');
});

test('a backup without a section leaves that section as it is', () => {
  StorageService.saveInvoice(new Invoice({ id: 'inv_1', invoiceNumber: 'BILL-001' }));
  StorageService.importBackupJSON(JSON.stringify({ app: 'BillCraft', format: 2, catalog: [{ name: 'Soap', unitPrice: 40 }] }));
  assert.equal(StorageService.getInvoices().length, 1);
  assert.equal(StorageService.getCatalog()[0].name, 'Soap');
});

test('a backup round trip keeps everything', () => {
  StorageService.saveSettings({ brandName: 'Asha Candles', upiId: 'asha@okaxis', setupDone: true });
  StorageService.addProduct({ id: 'prod_1', name: 'Soap', unitPrice: 40, unit: 'pcs', category: 'General', sku: '', description: '' });
  StorageService.saveInvoice(new Invoice({ id: 'inv_1', invoiceNumber: 'AC-2611-009', items: [{ id: 'item_1', name: 'Soap', quantity: 2, unitPrice: 40 }] }));
  StorageService.saveInvoice(new Invoice({ id: 'inv_2', invoiceNumber: 'AC-2611-012' }));
  StorageService.deleteInvoice('inv_2');
  const json = StorageService.exportBackupJSON('1.1.0');
  globalThis.localStorage = new MemoryStorage();
  StorageService.importBackupJSON(json);
  assert.equal(StorageService.getSettings().upiId, 'asha@okaxis');
  assert.equal(StorageService.getCatalog()[0].id, 'prod_1');
  const [bill] = StorageService.getInvoices();
  assert.equal(bill.grandTotal, 80);
  assert.equal(StorageService.nextBillNumber('month', 'AC', '2026-11-30'), 'AC-2611-013', 'the counters travel with the backup');
});
