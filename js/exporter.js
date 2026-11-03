/**
 * Export & Sharing Service
 * Generates PNG Image, PDF, Print, and WhatsApp Summary
 */

import { formatCurrency } from './models.js';
import { createTranslator, statusLabel } from './i18n/i18n.js';

// The export libraries are served with the app (vendor/, byte-identical to the npm
// releases; see THIRD_PARTY_NOTICES.md) and load on first use, so starting the app
// never waits for them and exports work offline.
const LIBRARIES = {
  html2canvas: 'vendor/html2canvas-1.4.1.min.js',
  jspdf: 'vendor/jspdf-2.5.1.umd.min.js'
};
const loading = new Map();

/** Loads a script once. Resolves to false if it cannot load, so the fallbacks run instead. */
function loadScript(src) {
  if (!loading.has(src)) {
    loading.set(src, new Promise(resolve => {
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => {
        loading.delete(src); // try again next time, for example once back online
        script.remove();
        resolve(false);
      };
      document.head.appendChild(script);
    }));
  }
  return loading.get(src);
}

export const ExporterService = {
  /** Starts loading the export libraries in the background, before they are needed */
  preload() {
    loadScript(LIBRARIES.html2canvas);
    loadScript(LIBRARIES.jspdf);
  },

  /**
   * Export invoice element as high-resolution PNG image
   */
  async exportImage(elementId = 'active-invoice-doc', filename = 'invoice.png') {
    const el = document.getElementById(elementId);
    if (!el) {
      throw new Error('Invoice container element not found');
    }

    await loadScript(LIBRARIES.html2canvas);
    if (typeof window.html2canvas === 'function') {
      try {
        const canvas = await window.html2canvas(el, {
          scale: 2, // High resolution for crisp text
          useCORS: true,
          backgroundColor: '#ffffff',
          logging: false
        });
        const dataUrl = canvas.toDataURL('image/png');
        this.downloadDataURL(dataUrl, filename);
        return true;
      } catch (err) {
        console.warn('html2canvas export failed, using SVG fallback:', err);
      }
    }

    // Pure Browser Fallback using SVG ForeignObject to Canvas
    return this.renderDOMToImageFallback(el, filename);
  },

  /**
   * Export invoice element as PDF
   */
  async exportPDF(elementId = 'active-invoice-doc', filename = 'invoice.pdf') {
    const el = document.getElementById(elementId);
    if (!el) {
      throw new Error('Invoice container element not found');
    }

    await Promise.all([loadScript(LIBRARIES.html2canvas), loadScript(LIBRARIES.jspdf)]);
    if (window.jspdf && typeof window.html2canvas === 'function') {
      try {
        const { jsPDF } = window.jspdf;
        const canvas = await window.html2canvas(el, {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff'
        });

        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF({
          orientation: 'portrait',
          unit: 'mm',
          format: 'a4'
        });

        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        pdf.save(filename);
        return true;
      } catch (err) {
        console.warn('jsPDF export error, falling back to print dialog:', err);
      }
    }

    // Native Browser Print to PDF Fallback
    window.print();
    return true;
  },

  /**
   * SVG ForeignObject to Canvas fallback for offline image export
   */
  async renderDOMToImageFallback(element, filename) {
    try {
      const rect = element.getBoundingClientRect();
      const width = Math.max(rect.width, 700);
      const height = Math.max(rect.height, 800);

      // Clone HTML and inline styles
      const clone = element.cloneNode(true);
      const xml = new XMLSerializer().serializeToString(clone);

      const svgString = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
          <foreignObject width="100%" height="100%">
            <div xmlns="http://www.w3.org/1999/xhtml" style="background:#ffffff; font-family:sans-serif; width:${width}px;">
              ${xml}
            </div>
          </foreignObject>
        </svg>
      `;

      const img = new Image();
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const URL = window.URL || window.webkitURL || window;
      const blobUrl = URL.createObjectURL(svgBlob);

      return new Promise((resolve, reject) => {
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = width * 1.5;
          canvas.height = height * 1.5;
          const ctx = canvas.getContext('2d');
          ctx.scale(1.5, 1.5);
          ctx.drawImage(img, 0, 0);
          URL.revokeObjectURL(blobUrl);

          const pngUrl = canvas.toDataURL('image/png');
          ExporterService.downloadDataURL(pngUrl, filename);
          resolve(true);
        };
        img.onerror = () => {
          // If foreignObject fails due to tainted canvas or security restrictions, trigger print
          window.print();
          resolve(true);
        };
        img.src = blobUrl;
      });
    } catch (e) {
      window.print();
      return true;
    }
  },

  /**
   * Helper to trigger download of a dataURL
   */
  downloadDataURL(dataUrl, filename) {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  },

  /**
   * Trigger native browser print
   */
  triggerPrint() {
    window.print();
  },

  /**
   * Build the WhatsApp text for a bill, in the bill language `tb`
   */
  formatInvoiceText(invoice, settings, tb = createTranslator()) {
    const { t } = tb;
    const curr = settings.currency || '₹';
    const lines = [
      `🧾 *${t('wa.billFrom', { name: settings.brandName || t('wa.defaultShop') })}*`,
      `${t('wa.billNo')}: ${invoice.invoiceNumber}`,
      `${t('wa.date')}: ${invoice.date}`,
      `${t('wa.customer')}: ${invoice.customer.name || t('wa.defaultCustomer')}`
    ];

    if (invoice.customer.phone) lines.push(`${t('wa.phone')}: ${invoice.customer.phone}`);
    lines.push('--------------------------------');

    invoice.items.forEach(it => {
      lines.push(t('wa.item', {
        name: it.name,
        qty: it.quantity,
        unit: it.unit,
        rate: formatCurrency(it.unitPrice, curr),
        total: formatCurrency(it.total, curr)
      }));
    });

    lines.push('--------------------------------');
    lines.push(`${t('wa.subtotal')}: ${formatCurrency(invoice.subtotal, curr)}`);
    if (invoice.billDiscount > 0) lines.push(`${t('wa.discount')}: -${formatCurrency(invoice.billDiscount, curr)}`);
    if (invoice.shippingFee > 0) lines.push(`${t('wa.delivery')}: +${formatCurrency(invoice.shippingFee, curr)}`);
    lines.push(`*${t('wa.grandTotal')}: ${formatCurrency(invoice.grandTotal, curr)}*`);
    lines.push(`${t('wa.status')}: ${statusLabel(t, invoice.status)}`);

    if (settings.upiId) {
      lines.push(`\n💳 ${t('wa.payUpi')}: ${settings.upiId}`);
    }
    if (settings.sellerName || settings.phone) {
      lines.push(`${t('wa.contact')}: ${settings.sellerName || ''} (${settings.phone || ''})`);
    }
    lines.push(`\n${t('wa.thanks')}`);
    return lines.join('\n');
  },

  /**
   * Share via WhatsApp link
   */
  shareWhatsApp(invoice, settings, tb = createTranslator()) {
    const text = this.formatInvoiceText(invoice, settings, tb);
    let targetPhone = (invoice.customer.phone || '').replace(/[^0-9]/g, '');
    let url = '';
    if (targetPhone.length >= 10) {
      if (targetPhone.length === 10) targetPhone = '91' + targetPhone; // default India prefix if 10 digits
      url = `https://wa.me/${targetPhone}?text=${encodeURIComponent(text)}`;
    } else {
      url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    }
    window.open(url, '_blank');
  },

  /**
   * Copy invoice text to clipboard
   */
  async copyInvoiceText(invoice, settings, tb = createTranslator()) {
    const text = this.formatInvoiceText(invoice, settings, tb);
    await navigator.clipboard.writeText(text);
    return true;
  }
};
