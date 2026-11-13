/**
 * Export & sharing: PDF, PNG image, print and WhatsApp.
 *
 * Files are drawn by html2canvas from a copy of the bill laid out on a fixed paper
 * width (A4, or a receipt roll for the thermal design), so a file made on a phone
 * matches one made on a computer. The copy carries the page's styles inline, with
 * the fonts embedded: html2canvas puts it in a frame that the service worker does
 * not serve, so anything fetched there would fail offline.
 */

import { formatCurrency, formatDate } from './models.js';
import { createTranslator, discountLabel, statusLabel } from './i18n/i18n.js';
import { unitLabel } from './units.js';

// Served with the app (vendor/, byte-identical to the npm releases; see
// THIRD_PARTY_NOTICES.md). They load on first use, so starting never waits for them.
const LIBRARIES = {
  html2canvas: 'vendor/html2canvas-1.4.1.min.js',
  jspdf: 'vendor/jspdf-2.5.1.umd.min.js'
};
const loading = new Map();

/** Paper widths in CSS pixels: A4 at 96 dpi, and a receipt for the thermal design */
const PAPER_WIDTH = { a4: 794, receipt: 420 };
const A4_MM = { width: 210, height: 297 };
const RECEIPT_WIDTH_MM = 80;
const PAGE_MARGIN_MM = 10; // above and below the cut on a bill longer than a page
const SCALE = 2; // canvas pixels per CSS pixel, for sharp text
const JPEG_QUALITY = 0.92;

/** An export that could not be made: 'library' (not loaded), 'no-bill' or 'image' */
export class ExportError extends Error {
  constructor(reason) {
    super(`Export failed: ${reason}`);
    this.name = 'ExportError';
    this.reason = reason;
  }
}

/** Loads a script once. Resolves to false if it cannot load. */
function loadScript(src) {
  if (!loading.has(src)) {
    loading.set(src, new Promise(resolve => {
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => {
        loading.delete(src); // try again next time
        script.remove();
        resolve(false);
      };
      document.head.appendChild(script);
    }));
  }
  return loading.get(src);
}

/** A file as a data URL; the main page fetches it (through the service worker when offline) */
async function embed(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) return url;
    const blob = await response.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return url;
  }
}

let pageStyles = null;

/** The page's stylesheets as one block of CSS, with the files they refer to (fonts) embedded */
function inlinePageStyles() {
  pageStyles ??= (async () => {
    const parts = [];
    for (const sheet of document.styleSheets) {
      let css;
      try {
        css = [...sheet.cssRules].map(rule => rule.cssText).join('\n');
      } catch {
        continue; // a sheet from another site; the app has none
      }
      const base = sheet.href || document.baseURI;
      const found = [...css.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)].map(match => match[2]);
      const embedded = new Map();
      for (const url of new Set(found.filter(url => !url.startsWith('data:')))) {
        embedded.set(url, await embed(new URL(url, base).href));
      }
      parts.push(css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (match, quote, url) =>
        (embedded.has(url) ? `url("${embedded.get(url)}")` : match)));
    }
    return parts.join('\n');
  })().catch((error) => {
    pageStyles = null;
    throw error;
  });
  return pageStyles;
}

/**
 * Where to cut a bill `totalHeight` tall into pages: the first page holds `pageHeight`,
 * the others `nextPageHeight`. Each cut is at the lowest allowed break on the page
 * (below a row or a block), or at the page's end when a block is taller than half a
 * page. Returns [start, end] pairs.
 */
export function pageSlices(totalHeight, pageHeight, breaks = [], nextPageHeight = pageHeight) {
  const allowed = [...new Set(breaks)].filter(y => y > 0 && y < totalHeight).sort((a, b) => a - b);
  const slices = [];
  let start = 0;
  let room = pageHeight;
  while (totalHeight - start > room) {
    const limit = start + room;
    const fits = allowed.filter(y => y > start + room / 2 && y <= limit);
    const end = fits.length ? fits[fits.length - 1] : limit;
    slices.push([start, end]);
    start = end;
    room = nextPageHeight;
  }
  slices.push([start, totalHeight]);
  return slices;
}

/**
 * Draws the bill on a canvas at the export width. Also returns where pages may
 * break, in canvas pixels.
 */
async function renderBill(element) {
  if (!(await loadScript(LIBRARIES.html2canvas)) || typeof window.html2canvas !== 'function') {
    throw new ExportError('library');
  }
  const styles = await inlinePageStyles();
  const receipt = element.classList.contains('template-thermal');
  const width = receipt ? PAPER_WIDTH.receipt : PAPER_WIDTH.a4;
  let breaks = [];

  const canvas = await window.html2canvas(element, {
    scale: SCALE,
    backgroundColor: '#ffffff',
    logging: false,
    scrollX: 0,
    scrollY: 0,
    windowWidth: Math.max(window.innerWidth, width + 40),
    // The copy gets the styles inline below, instead of fetching the stylesheets
    ignoreElements: node => node.nodeName === 'LINK',
    onclone: async (doc, copy) => {
      const style = doc.createElement('style');
      style.textContent = styles;
      doc.head.appendChild(style);
      // The bill on its own sheet of paper, at the export width
      const sheet = doc.createElement('div');
      sheet.className = 'invoice-render-wrapper';
      sheet.style.cssText = `position: absolute; left: 0; top: 0; width: ${width}px; max-width: none; margin: 0; border: 0; border-radius: 0; box-shadow: none; min-height: 0;`;
      doc.body.appendChild(sheet);
      sheet.appendChild(copy);
      await doc.fonts.ready;
      const top = copy.getBoundingClientRect().top;
      breaks = [...copy.children, ...copy.querySelectorAll('tr, .boutique-body > *, .pos-item-math, .tot-row')]
        .map(node => Math.round((node.getBoundingClientRect().bottom - top) * SCALE));
    }
  });
  return { canvas, breaks, receipt };
}

/** A4 pages for a tall bill, cut between rows; one long page for a receipt */
async function billPDF(element) {
  const [{ canvas, breaks, receipt }] = await Promise.all([renderBill(element), loadScript(LIBRARIES.jspdf)]);
  if (!window.jspdf) throw new ExportError('library');
  const { jsPDF } = window.jspdf;

  if (receipt) {
    const heightMm = (canvas.height * RECEIPT_WIDTH_MM) / canvas.width;
    const pdf = new jsPDF({ unit: 'mm', format: [RECEIPT_WIDTH_MM, heightMm], orientation: heightMm >= RECEIPT_WIDTH_MM ? 'portrait' : 'landscape' });
    pdf.addImage(canvas.toDataURL('image/jpeg', JPEG_QUALITY), 'JPEG', 0, 0, RECEIPT_WIDTH_MM, heightMm);
    return pdf.output('blob');
  }

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pxPerMm = canvas.width / A4_MM.width;
  const fullPage = Math.floor(A4_MM.height * pxPerMm);
  // A bill that fits on one sheet fills it; a longer one gets margins around each cut
  const slices = canvas.height <= fullPage
    ? [[0, canvas.height]]
    : pageSlices(canvas.height, Math.floor((A4_MM.height - PAGE_MARGIN_MM) * pxPerMm), breaks,
      Math.floor((A4_MM.height - 2 * PAGE_MARGIN_MM) * pxPerMm));
  slices.forEach(([start, end], index) => {
    const page = document.createElement('canvas');
    page.width = canvas.width;
    page.height = end - start;
    const ctx = page.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, page.width, page.height);
    ctx.drawImage(canvas, 0, start, canvas.width, end - start, 0, 0, page.width, page.height);
    if (index > 0) pdf.addPage('a4', 'portrait');
    // JPEG keeps a page near 200 KB; the white background has no transparency to lose
    pdf.addImage(page.toDataURL('image/jpeg', JPEG_QUALITY), 'JPEG', 0, index > 0 ? PAGE_MARGIN_MM : 0, A4_MM.width, page.height / pxPerMm);
  });
  return pdf.output('blob');
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Some browsers cancel the download if the address is revoked at once
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/**
 * Hands a finished file over: on phones the share sheet, straight into WhatsApp or
 * Drive; elsewhere a download. Resolves to { status }: 'shared', 'downloaded',
 * 'cancelled', or 'needs-tap' with share(), when the browser no longer counts the
 * original tap (iPhone, after a slow export) and wants a fresh one.
 */
async function deliver(blob, filename) {
  const file = new File([blob], filename, { type: blob.type });
  const phone = window.matchMedia('(pointer: coarse)').matches;
  if (phone && navigator.canShare?.({ files: [file] })) {
    const share = () => navigator.share({ files: [file], title: filename });
    try {
      await share();
      return { status: 'shared' };
    } catch (error) {
      if (error.name === 'AbortError') return { status: 'cancelled' };
      if (error.name === 'NotAllowedError') return { status: 'needs-tap', share };
      // Anything else: fall back to a download
    }
  }
  downloadBlob(blob, filename);
  return { status: 'downloaded' };
}

/** A file name from a bill number: characters that file systems refuse become "-" */
export function fileNameFor(invoiceNumber, extension) {
  const base = String(invoiceNumber || 'bill').trim().replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '') || 'bill';
  return `${base}.${extension}`;
}

/**
 * The number for a WhatsApp link: digits only, with India's 91 added to a 10-digit
 * number (or one written with a leading 0). '' when there is no usable number.
 */
export function whatsappNumber(phone) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 10) return `91${digits}`;
  return digits.length > 10 ? digits : '';
}

/** "Asha (98765 43210)", "Asha" or "98765 43210", from whichever is set */
function contactLine(settings) {
  const { sellerName = '', phone = '' } = settings;
  if (sellerName && phone) return `${sellerName} (${phone})`;
  return sellerName || phone;
}

function openWhatsApp(phone, text) {
  const number = whatsappNumber(phone);
  window.open(`https://wa.me/${number}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
}

export const ExporterService = {
  /** Starts loading the export libraries in the background, before they are needed */
  preload() {
    loadScript(LIBRARIES.html2canvas);
    loadScript(LIBRARIES.jspdf);
  },

  /** The bill as a PNG image, shared or downloaded (see deliver) */
  async exportImage(elementId, filename) {
    const element = document.getElementById(elementId);
    if (!element) throw new ExportError('no-bill');
    const { canvas } = await renderBill(element);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new ExportError('image');
    return deliver(blob, filename);
  },

  /** The bill as a PDF, shared or downloaded (see deliver) */
  async exportPDF(elementId, filename) {
    const element = document.getElementById(elementId);
    if (!element) throw new ExportError('no-bill');
    return deliver(await billPDF(element), filename);
  },

  /** Any finished file: the share sheet on phones, a download elsewhere (see deliver) */
  deliverFile(blob, filename) {
    return deliver(blob, filename);
  },

  triggerPrint() {
    window.print();
  },

  /** The WhatsApp text for a bill, in the bill language `tb` */
  formatInvoiceText(invoice, settings, tb = createTranslator()) {
    const { t, language } = tb;
    const curr = settings.currency || '₹';
    const lines = [
      `🧾 *${t('wa.billFrom', { name: settings.brandName || t('wa.defaultShop') })}*`,
      `${t('wa.billNo')}: ${invoice.invoiceNumber}`,
      `${t('wa.date')}: ${formatDate(invoice.date, language)}`,
      `${t('wa.customer')}: ${invoice.customer.name || t('wa.defaultCustomer')}`
    ];

    if (invoice.customer.phone) lines.push(`${t('wa.phone')}: ${invoice.customer.phone}`);
    lines.push('--------------------------------');

    invoice.items.forEach(it => {
      lines.push(t('wa.item', {
        name: it.name || t('item.default'),
        qty: it.quantity,
        unit: unitLabel(it.unit || 'pcs', t),
        rate: formatCurrency(it.unitPrice, curr),
        total: formatCurrency(it.total, curr)
      }));
    });

    lines.push('--------------------------------');
    lines.push(`${t('wa.subtotal')}: ${formatCurrency(invoice.subtotal, curr)}`);
    if (invoice.discountAmount > 0) {
      lines.push(`${discountLabel(t('wa.discount'), invoice)}: -${formatCurrency(invoice.discountAmount, curr)}`);
    }
    if (invoice.shippingFee > 0) lines.push(`${t('wa.delivery')}: +${formatCurrency(invoice.shippingFee, curr)}`);
    lines.push(`*${t('wa.grandTotal')}: ${formatCurrency(invoice.grandTotal, curr)}*`);
    lines.push(`${t('wa.status')}: ${statusLabel(t, invoice.status)}`);
    if (invoice.status === 'Due' && invoice.dueDate) lines.push(t('wa.payBy', { date: formatDate(invoice.dueDate, language) }));

    if (settings.upiId) lines.push(`\n💳 ${t('wa.payUpi')}: ${settings.upiId}`);
    const contact = contactLine(settings);
    if (contact) lines.push(`${t('wa.contact')}: ${contact}`);
    lines.push(`\n${t('wa.thanks')}`);
    return lines.join('\n');
  },

  /** A short, polite reminder for a bill that is still due, in the bill language */
  formatReminderText(invoice, settings, tb = createTranslator()) {
    const { t, language } = tb;
    const lines = [
      `🔔 *${t('wa.reminderTitle', { name: settings.brandName || t('wa.defaultShop') })}*`,
      t('wa.reminderBill', { number: invoice.invoiceNumber, date: formatDate(invoice.date, language) }),
      `*${t('wa.amountDue')}: ${formatCurrency(invoice.grandTotal, settings.currency || '₹')}*`
    ];
    if (invoice.dueDate) lines.push(t('wa.payBy', { date: formatDate(invoice.dueDate, language) }));
    if (settings.upiId) lines.push(`\n💳 ${t('wa.payUpi')}: ${settings.upiId}`);
    const contact = contactLine(settings);
    if (contact) lines.push(`${t('wa.contact')}: ${contact}`);
    lines.push(`\n${t('wa.thanks')}`);
    return lines.join('\n');
  },

  /** Opens WhatsApp with the bill: straight to the customer's chat when the phone is known */
  shareWhatsApp(invoice, settings, tb = createTranslator()) {
    openWhatsApp(invoice.customer.phone, this.formatInvoiceText(invoice, settings, tb));
  },

  sendReminder(invoice, settings, tb = createTranslator()) {
    openWhatsApp(invoice.customer.phone, this.formatReminderText(invoice, settings, tb));
  }
};
