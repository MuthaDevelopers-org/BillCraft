import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { StorageService, SCHEMA_VERSION, clearOldDemoSettings } from '../js/storage.js';

// A stand-in for the browser's localStorage, emptied before each test
class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
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
