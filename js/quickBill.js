/**
 * Fast-bill helpers: product order, recent customers, weight and length units,
 * and quantity changes. Pure functions with no DOM, so they are unit-tested.
 */

import { InvoiceItem } from './models.js';

// Units sold by weight, volume or length. Tapping such a product asks how much.
const MEASURED_UNITS = new Set([
  'kg', 'kgs', 'kilo', 'kilos', 'kilogram', 'kilograms',
  'g', 'gm', 'gms', 'gram', 'grams',
  'l', 'lt', 'ltr', 'litre', 'litres', 'liter', 'liters', 'ml',
  'm', 'mtr', 'metre', 'metres', 'meter', 'meters', 'cm',
  'ft', 'feet', 'inch', 'inches', 'yard', 'yards',
  'किलो', 'किग्रा', 'ग्राम', 'लीटर', 'मीटर'
]);

const MEASURED_PRESETS = [0.25, 0.5, 1, 1.5, 2, 5];
const COUNT_PRESETS = [1, 2, 3, 5, 10, 12];

export function isMeasuredUnit(unit) {
  return MEASURED_UNITS.has(String(unit || '').trim().toLowerCase().replace(/\.$/, ''));
}

/** Quick choices for the quantity sheet */
export function presetsFor(unit) {
  return isMeasuredUnit(unit) ? MEASURED_PRESETS : COUNT_PRESETS;
}

/** Rounds to 3 decimals, so 0.1 + 0.2 is 0.3 */
export function roundQty(qty) {
  return Math.round((Number(qty) || 0) * 1000) / 1000;
}

/** The quantity after a minus or plus tap. 0 means the line should go. */
export function stepQuantity(qty, delta) {
  return Math.max(0, roundQty((Number(qty) || 0) + delta));
}

/**
 * Adds `qty` of a catalog product to the bill lines and returns its line.
 * A product already on the bill gets the quantity added to its line.
 */
export function addProductLine(items, product, qty = 1) {
  const existing = items.find(item => item.productId === product.id);
  if (existing) {
    existing.quantity = roundQty(existing.quantity + qty);
    return existing;
  }
  const line = new InvoiceItem({
    productId: product.id,
    name: product.name,
    description: product.description,
    unitPrice: product.unitPrice,
    unit: product.unit,
    quantity: roundQty(qty)
  });
  items.push(line);
  return line;
}

/** Sets a line's quantity and returns the line. Zero or less removes it and returns null. */
export function setLineQuantity(items, lineId, qty) {
  const index = items.findIndex(item => item.id === lineId);
  if (index === -1) return null;
  const value = roundQty(qty);
  if (!(value > 0)) {
    items.splice(index, 1);
    return null;
  }
  items[index].quantity = value;
  return items[index];
}

const nameKey = name => String(name || '').trim().toLowerCase();

/**
 * Catalog products, most used first. A use is a saved bill containing the product,
 * matched by productId, or by name for older bills without one. Ties keep the
 * catalog order, so newly added products stay first among the unused ones.
 */
export function rankProducts(catalog, invoices) {
  const ids = new Set(catalog.map(product => product.id));
  const idByName = new Map(catalog.map(product => [nameKey(product.name), product.id]));
  const uses = new Map();

  for (const invoice of invoices) {
    const counted = new Set();
    for (const item of invoice.items || []) {
      const id = ids.has(item.productId) ? item.productId : idByName.get(nameKey(item.name));
      if (id && !counted.has(id)) {
        counted.add(id);
        uses.set(id, (uses.get(id) || 0) + 1);
      }
    }
  }

  return catalog
    .map((product, index) => ({ product, index, uses: uses.get(product.id) || 0 }))
    .sort((a, b) => b.uses - a.uses || a.index - b.index)
    .map(entry => entry.product);
}

/** What identifies a customer: the last 10 digits of the phone, or else the name */
export function customerKey({ name = '', phone = '' }) {
  const digits = String(phone || '').replace(/\D/g, '').slice(-10);
  return digits ? `phone:${digits}` : `name:${nameKey(name)}`;
}

/**
 * Customers from saved bills, newest bill first (the order StorageService keeps),
 * each listed once. Bills without a customer name are skipped.
 */
export function recentCustomers(invoices, limit = 8) {
  const seen = new Set();
  const customers = [];
  for (const invoice of invoices) {
    const customer = invoice.customer || {};
    const name = String(customer.name || '').trim();
    if (!name) continue;
    const phone = String(customer.phone || '').trim();
    const key = customerKey({ name, phone });
    if (seen.has(key)) continue;
    seen.add(key);
    customers.push({ name, phone, address: String(customer.address || '').trim() });
    if (customers.length >= limit) break;
  }
  return customers;
}
