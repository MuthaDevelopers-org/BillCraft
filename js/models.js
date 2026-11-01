/**
 * BillCraft Data Models & Utilities
 */

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
    this.unitPrice = Number(unitPrice) || 0;
    this.discount = Number(discount) || 0;
  }

  get total() {
    const gross = this.quantity * this.unitPrice;
    const discountAmount = (gross * this.discount) / 100;
    return Math.max(0, gross - discountAmount);
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
    this.shippingFee = Number(shippingFee) || 0;
    this.billDiscount = Number(billDiscount) || 0;
    this.notes = notes;
    this.template = template;
    this.status = status;
    this.createdAt = createdAt;
  }

  get subtotal() {
    return this.items.reduce((sum, item) => sum + item.total, 0);
  }

  get grandTotal() {
    const sub = this.subtotal;
    const afterDiscount = Math.max(0, sub - this.billDiscount);
    return afterDiscount + this.shippingFee;
  }

  get totalItemsCount() {
    return this.items.reduce((count, item) => count + item.quantity, 0);
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
    qrCustomImage = ''
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
  }
}

/**
 * Converts a numeric amount to English Words (e.g. ₹ 1,520 => One Thousand Five Hundred Twenty Only)
 */
export function numberToWords(num) {
  const n = Math.floor(Math.abs(num));
  if (n === 0) return 'Zero Only';

  const a = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen'
  ];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function inWords(n) {
    if (n < 20) return a[n];
    if (n < 100) return b[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + a[n % 10] : '');
    if (n < 1000) return a[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' and ' + inWords(n % 100) : '');
    if (n < 100000) return inWords(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 !== 0 ? ' ' + inWords(n % 1000) : '');
    if (n < 10000000) return inWords(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 !== 0 ? ' ' + inWords(n % 100000) : '');
    return inWords(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 !== 0 ? ' ' + inWords(n % 10000000) : '');
  }

  return inWords(n) + ' Only';
}

/**
 * Currency Formatter
 */
export function formatCurrency(amount, currency = '₹') {
  const num = Number(amount) || 0;
  return `${currency} ${num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}
