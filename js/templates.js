/**
 * Invoice Templates Engine for BillCraft
 * Four distinct templates:
 * 1. 'modern': Modern Minimalist (Corporate Boutique)
 * 2. 'classic': Classic Executive (Traditional Formal Receipt)
 * 3. 'boutique': Artisan Boutique (Warm Retail & Visual Badges)
 * 4. 'thermal': Compact POS Receipt (Monospace, Mobile-friendly)
 */

import { formatCurrency, numberToWords } from './models.js';

function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderInvoice(templateId, invoice, settings, qrDataUrl = '') {
  switch (templateId) {
    case 'classic':
      return renderClassicTemplate(invoice, settings, qrDataUrl);
    case 'boutique':
      return renderBoutiqueTemplate(invoice, settings, qrDataUrl);
    case 'thermal':
      return renderThermalTemplate(invoice, settings, qrDataUrl);
    case 'modern':
    default:
      return renderModernTemplate(invoice, settings, qrDataUrl);
  }
}

// ============================================================
// TEMPLATE 1: MODERN MINIMAL
// ============================================================
export function renderModernTemplate(invoice, settings, qrDataUrl) {
  const curr = settings.currency || '₹';
  const qrImageSrc = settings.qrCustomImage || qrDataUrl;

  const itemsRows = invoice.items.map((item, idx) => `
    <tr>
      <td style="color: #64748b; font-weight: 600; width: 32px;">${idx + 1}</td>
      <td>
        <div class="item-name">${escapeHTML(item.name || 'Custom Item')}</div>
        ${item.description ? `<div class="item-sub">${escapeHTML(item.description)}</div>` : ''}
      </td>
      <td class="num">${formatCurrency(item.unitPrice, curr)}</td>
      <td class="num" style="font-weight: 600;">${item.quantity} ${escapeHTML(item.unit || 'pcs')}</td>
      <td class="num" style="color: #64748b;">${item.discount > 0 ? `${item.discount}%` : '-'}</td>
      <td class="num" style="font-weight: 700; color: #0f172a;">${formatCurrency(item.total, curr)}</td>
    </tr>
  `).join('');

  return `
    <div class="invoice-paper template-modern" id="active-invoice-doc">
      <!-- Header -->
      <div class="inv-header">
        <div>
          <div class="inv-brand-name">${escapeHTML(settings.brandName || 'My Business')}</div>
          ${settings.tagline ? `<div class="inv-brand-tagline">${escapeHTML(settings.tagline)}</div>` : ''}
          <div class="inv-seller-info">
            <strong>${escapeHTML(settings.sellerName || 'Proprietor')}</strong><br/>
            ${settings.phone ? `Phone: ${escapeHTML(settings.phone)}<br/>` : ''}
            ${settings.email ? `Email: ${escapeHTML(settings.email)}<br/>` : ''}
            ${settings.address ? `<span>${escapeHTML(settings.address)}</span>` : ''}
          </div>
        </div>

        <div class="inv-meta-block">
          <div class="inv-title-badge">Domestic Sales Bill</div>
          <div class="inv-number">${escapeHTML(invoice.invoiceNumber || 'BILL-001')}</div>
          <div class="inv-date-row"><strong>Date:</strong> ${escapeHTML(invoice.date)}</div>
          ${invoice.dueDate ? `<div class="inv-date-row"><strong>Due:</strong> ${escapeHTML(invoice.dueDate)}</div>` : ''}
          <div style="margin-top: 6px;">
            <span class="badge ${invoice.status === 'Paid' ? 'badge-paid' : (invoice.status === 'Due' ? 'badge-unpaid' : 'badge-draft')}">${escapeHTML(invoice.status)}</span>
          </div>
        </div>
      </div>

      <!-- Parties Grid -->
      <div class="inv-parties-grid">
        <div class="party-col">
          <h4>Billed To (Customer)</h4>
          <div class="customer-name">${escapeHTML(invoice.customer.name || 'Valued Customer')}</div>
          ${invoice.customer.phone ? `<p><strong>Contact:</strong> ${escapeHTML(invoice.customer.phone)}</p>` : ''}
          ${invoice.customer.address ? `<p>${escapeHTML(invoice.customer.address)}</p>` : ''}
          ${invoice.customer.note ? `<p style="font-style: italic; color: #64748b;">Note: ${escapeHTML(invoice.customer.note)}</p>` : ''}
        </div>
        <div class="party-col">
          <h4>Order Summary</h4>
          <p><strong>Total Line Items:</strong> ${invoice.items.length}</p>
          <p><strong>Total Quantity:</strong> ${invoice.totalItemsCount}</p>
          <p><strong>Payment Status:</strong> ${escapeHTML(invoice.status)}</p>
        </div>
      </div>

      <!-- Table -->
      <table class="inv-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Item & Description</th>
            <th class="num">Unit Price</th>
            <th class="num">Qty</th>
            <th class="num">Disc.</th>
            <th class="num">Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemsRows.length ? itemsRows : '<tr><td colspan="6" style="text-align:center; padding: 2rem; color: #94a3b8;">No items added yet</td></tr>'}
        </tbody>
      </table>

      <!-- Bottom: Payment & Totals -->
      <div class="inv-bottom-section">
        <!-- Left: Payment / QR -->
        <div class="inv-payment-box">
          ${qrImageSrc ? `
            <div class="payment-qr-wrap">
              <img src="${qrImageSrc}" alt="Payment QR" style="width: 100%; height: 100%; object-fit: contain;" />
            </div>
          ` : ''}
          <div class="payment-info-text">
            <div class="payment-title">Payment Information</div>
            ${settings.upiId ? `<div><strong>UPI ID:</strong> <span style="font-family: var(--font-mono);">${escapeHTML(settings.upiId)}</span></div>` : ''}
            <div>${escapeHTML(settings.paymentNotes || 'Scan to pay directly')}</div>
          </div>
        </div>

        <!-- Right: Totals -->
        <div class="inv-totals-box">
          <div class="tot-row">
            <span>Subtotal:</span>
            <span>${formatCurrency(invoice.subtotal, curr)}</span>
          </div>
          ${invoice.billDiscount > 0 ? `
            <div class="tot-row" style="color: var(--danger);">
              <span>Discount:</span>
              <span>- ${formatCurrency(invoice.billDiscount, curr)}</span>
            </div>
          ` : ''}
          ${invoice.shippingFee > 0 ? `
            <div class="tot-row">
              <span>Delivery / Shipping:</span>
              <span>+ ${formatCurrency(invoice.shippingFee, curr)}</span>
            </div>
          ` : ''}
          <div class="tot-row grand">
            <span>Total Payable:</span>
            <span class="grand-price">${formatCurrency(invoice.grandTotal, curr)}</span>
          </div>
          <div class="amount-words-badge">
            ${numberToWords(invoice.grandTotal)}
          </div>
        </div>
      </div>

      <!-- Footer Notes -->
      <div class="inv-footer-notes">
        <div>
          <strong>Note:</strong> ${escapeHTML(invoice.notes || settings.defaultNotes || 'Thank you for your business!')}
          <div style="font-size: 0.72rem; color: #94a3b8; margin-top: 4px;">* Domestic non-GST bill for customer information & record.</div>
        </div>
        <div style="text-align: right;">
          <div style="font-weight: 700; color: #1e293b;">${escapeHTML(settings.brandName || 'Authorized Signatory')}</div>
          <div style="font-size: 0.72rem; color: #94a3b8;">Issued with thanks</div>
        </div>
      </div>
    </div>
  `;
}

// ============================================================
// TEMPLATE 2: CLASSIC EXECUTIVE
// ============================================================
export function renderClassicTemplate(invoice, settings, qrDataUrl) {
  const curr = settings.currency || '₹';
  const qrImageSrc = settings.qrCustomImage || qrDataUrl;

  const rows = invoice.items.map((item, idx) => `
    <tr>
      <td style="text-align: center; width: 36px;">${idx + 1}</td>
      <td>
        <strong>${escapeHTML(item.name || 'Custom Item')}</strong>
        ${item.description ? `<br/><small style="color: #64748b;">${escapeHTML(item.description)}</small>` : ''}
      </td>
      <td class="num">${formatCurrency(item.unitPrice, curr)}</td>
      <td class="num">${item.quantity} ${escapeHTML(item.unit || 'pcs')}</td>
      <td class="num">${item.discount > 0 ? `${item.discount}%` : '-'}</td>
      <td class="num"><strong>${formatCurrency(item.total, curr)}</strong></td>
    </tr>
  `).join('');

  return `
    <div class="invoice-paper template-classic" id="active-invoice-doc">
      <div class="inv-classic-header">
        <div>
          <div class="classic-title">Retail Invoice / Bill</div>
          <div class="classic-brand">${escapeHTML(settings.brandName || 'Business Name')}</div>
          <div style="font-size: 0.85rem; color: #475569; margin-top: 4px;">
            ${escapeHTML(settings.sellerName || 'Proprietor')} &bull; ${escapeHTML(settings.phone || '')}<br/>
            ${escapeHTML(settings.address || '')}
          </div>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 1.25rem; font-weight: 800;">${escapeHTML(invoice.invoiceNumber)}</div>
          <div style="font-size: 0.85rem; color: #475569;">Date: ${escapeHTML(invoice.date)}</div>
          <div style="margin-top: 8px;">
            <span class="badge ${invoice.status === 'Paid' ? 'badge-paid' : 'badge-unpaid'}">${escapeHTML(invoice.status)}</span>
          </div>
        </div>
      </div>

      <div class="classic-grid-meta">
        <div class="meta-cell">
          <div class="meta-cell-label">Customer Name</div>
          <div class="meta-cell-value">${escapeHTML(invoice.customer.name || 'Valued Customer')}</div>
        </div>
        <div class="meta-cell">
          <div class="meta-cell-label">Contact / Phone</div>
          <div class="meta-cell-value">${escapeHTML(invoice.customer.phone || 'N/A')}</div>
        </div>
        <div class="meta-cell">
          <div class="meta-cell-label">Delivery / Address</div>
          <div class="meta-cell-value" style="font-size: 0.82rem; font-weight: normal;">${escapeHTML(invoice.customer.address || 'Local Sale')}</div>
        </div>
      </div>

      <table class="classic-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Item Details</th>
            <th class="num">Rate</th>
            <th class="num">Qty</th>
            <th class="num">Disc.</th>
            <th class="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${rows.length ? rows : '<tr><td colspan="6" style="text-align: center; padding: 2rem;">No items</td></tr>'}
        </tbody>
      </table>

      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 2rem;">
        <div style="flex: 1; font-size: 0.82rem; color: #475569;">
          <div style="display: flex; gap: 1rem; align-items: center; margin-bottom: 1rem;">
            ${qrImageSrc ? `<img src="${qrImageSrc}" alt="QR" style="width: 72px; height: 72px; border: 1px solid #cbd5e1; padding: 3px;" />` : ''}
            <div>
              <strong>Payment Settlement:</strong><br/>
              ${settings.upiId ? `UPI: ${escapeHTML(settings.upiId)}<br/>` : ''}
              ${escapeHTML(settings.paymentNotes || 'Direct Bank/UPI Transfer')}
            </div>
          </div>
          <p><strong>Terms:</strong> ${escapeHTML(invoice.notes || settings.defaultNotes || 'Thank you for your patronage.')}</p>
          <p style="font-style: italic; color: #94a3b8; margin-top: 4px;">* Domestic small business bill of supply.</p>
        </div>

        <div class="classic-summary-wrap">
          <table class="classic-summary-table">
            <tr>
              <td>Subtotal</td>
              <td class="num">${formatCurrency(invoice.subtotal, curr)}</td>
            </tr>
            ${invoice.billDiscount > 0 ? `
              <tr>
                <td>Special Discount</td>
                <td class="num" style="color: red;">-${formatCurrency(invoice.billDiscount, curr)}</td>
              </tr>
            ` : ''}
            ${invoice.shippingFee > 0 ? `
              <tr>
                <td>Delivery Charges</td>
                <td class="num">+${formatCurrency(invoice.shippingFee, curr)}</td>
              </tr>
            ` : ''}
            <tr class="total">
              <td>Total Amount</td>
              <td class="num">${formatCurrency(invoice.grandTotal, curr)}</td>
            </tr>
          </table>
        </div>
      </div>

      <div style="margin-top: 2rem; border-top: 1px solid #cbd5e1; padding-top: 0.75rem; display: flex; justify-content: space-between; font-size: 0.78rem; color: #64748b;">
        <div>Amount in words: <em>${numberToWords(invoice.grandTotal)}</em></div>
        <div style="text-align: right;">For ${escapeHTML(settings.brandName || 'Authorized Signatory')}</div>
      </div>
    </div>
  `;
}

// ============================================================
// TEMPLATE 3: ARTISAN BOUTIQUE
// ============================================================
export function renderBoutiqueTemplate(invoice, settings, qrDataUrl) {
  const curr = settings.currency || '₹';
  const qrImageSrc = settings.qrCustomImage || qrDataUrl;

  const rows = invoice.items.map((item, idx) => `
    <tr class="boutique-row">
      <td style="font-weight: 700; color: #475569;">#${idx + 1}</td>
      <td>
        <div style="font-weight: 800; color: #0f172a;">${escapeHTML(item.name || 'Artisan Item')}</div>
        ${item.description ? `<div style="font-size: 0.78rem; color: #64748b;">${escapeHTML(item.description)}</div>` : ''}
      </td>
      <td class="num" style="color: #475569;">${formatCurrency(item.unitPrice, curr)}</td>
      <td class="num" style="font-weight: 600;">${item.quantity} ${escapeHTML(item.unit || 'pcs')}</td>
      <td class="num" style="font-weight: 800; color: #0f172a;">${formatCurrency(item.total, curr)}</td>
    </tr>
  `).join('');

  return `
    <div class="invoice-paper template-boutique" id="active-invoice-doc">
      <div class="boutique-banner">
        <div>
          <div class="boutique-brand-name">${escapeHTML(settings.brandName || 'Artisan Boutique')}</div>
          <div style="opacity: 0.9; font-size: 0.88rem; margin-top: 4px;">${escapeHTML(settings.tagline || 'Curated with care')}</div>
          <div style="font-size: 0.8rem; opacity: 0.8; margin-top: 6px;">
            ${escapeHTML(settings.sellerName || '')} &bull; ${escapeHTML(settings.phone || '')}
          </div>
        </div>
        <div>
          <div class="boutique-pill">${escapeHTML(invoice.invoiceNumber)}</div>
          <div style="text-align: right; font-size: 0.82rem; margin-top: 6px; opacity: 0.9;">Date: ${escapeHTML(invoice.date)}</div>
        </div>
      </div>

      <div class="boutique-body">
        <div class="boutique-parties">
          <div>
            <div style="font-size: 0.72rem; text-transform: uppercase; font-weight: 800; color: #94a3b8; margin-bottom: 4px;">Prepared Especially For</div>
            <div style="font-size: 1.15rem; font-weight: 800; color: #0f172a;">${escapeHTML(invoice.customer.name || 'Valued Customer')}</div>
            ${invoice.customer.phone ? `<div style="font-size: 0.85rem; color: #475569;">Phone: ${escapeHTML(invoice.customer.phone)}</div>` : ''}
            ${invoice.customer.address ? `<div style="font-size: 0.85rem; color: #64748b;">${escapeHTML(invoice.customer.address)}</div>` : ''}
          </div>
          <div style="text-align: right;">
            <div style="font-size: 0.72rem; text-transform: uppercase; font-weight: 800; color: #94a3b8; margin-bottom: 4px;">Bill Status</div>
            <span class="badge ${invoice.status === 'Paid' ? 'badge-paid' : 'badge-unpaid'}" style="font-size: 0.85rem; padding: 0.35rem 0.8rem;">${escapeHTML(invoice.status)}</span>
          </div>
        </div>

        <table class="boutique-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Product / Service</th>
              <th class="num">Price</th>
              <th class="num">Quantity</th>
              <th class="num">Total</th>
            </tr>
          </thead>
          <tbody>
            ${rows.length ? rows : '<tr><td colspan="5" style="text-align: center; padding: 1.5rem;">No items</td></tr>'}
          </tbody>
        </table>

        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 1.5rem; flex-wrap: wrap; gap: 1.5rem;">
          <div style="display: flex; align-items: center; gap: 1rem; max-width: 320px;">
            ${qrImageSrc ? `<img src="${qrImageSrc}" alt="UPI QR" style="width: 76px; height: 76px; border-radius: 8px; border: 1px solid #e2e8f0; padding: 4px;" />` : ''}
            <div style="font-size: 0.82rem; color: #475569;">
              <strong>Pay via UPI:</strong><br/>
              ${settings.upiId ? `<span style="font-family: var(--font-mono); font-weight: 600;">${escapeHTML(settings.upiId)}</span><br/>` : ''}
              <span>${escapeHTML(settings.paymentNotes || 'Instant digital payment')}</span>
            </div>
          </div>

          <div class="boutique-total-card">
            <div style="display: flex; justify-content: space-between; font-size: 0.88rem; color: #64748b; margin-bottom: 0.4rem;">
              <span>Items Total:</span>
              <span>${formatCurrency(invoice.subtotal, curr)}</span>
            </div>
            ${invoice.billDiscount > 0 ? `
              <div style="display: flex; justify-content: space-between; font-size: 0.88rem; color: var(--danger); margin-bottom: 0.4rem;">
                <span>Discount:</span>
                <span>-${formatCurrency(invoice.billDiscount, curr)}</span>
              </div>
            ` : ''}
            ${invoice.shippingFee > 0 ? `
              <div style="display: flex; justify-content: space-between; font-size: 0.88rem; color: #64748b; margin-bottom: 0.4rem;">
                <span>Delivery:</span>
                <span>+${formatCurrency(invoice.shippingFee, curr)}</span>
              </div>
            ` : ''}
            <div style="display: flex; justify-content: space-between; font-size: 1.25rem; font-weight: 800; color: #0f172a; border-top: 1px solid #cbd5e1; padding-top: 0.6rem; margin-top: 0.4rem;">
              <span>Grand Total:</span>
              <span style="color: var(--theme-accent, #4f46e5);">${formatCurrency(invoice.grandTotal, curr)}</span>
            </div>
            <div style="font-size: 0.72rem; color: #64748b; text-align: right; margin-top: 4px;">
              ${numberToWords(invoice.grandTotal)}
            </div>
          </div>
        </div>

        <div style="margin-top: 2.5rem; text-align: center; border-top: 1px solid #f1f5f9; padding-top: 1rem; font-size: 0.82rem; color: #94a3b8;">
          ${escapeHTML(invoice.notes || settings.defaultNotes || 'Handcrafted with love. Thank you for your support!')}
          <div style="font-size: 0.72rem; margin-top: 4px;">* Domestic small business sale memo.</div>
        </div>
      </div>
    </div>
  `;
}

// ============================================================
// TEMPLATE 4: COMPACT THERMAL / POS RECEIPT
// ============================================================
export function renderThermalTemplate(invoice, settings, qrDataUrl) {
  const curr = settings.currency || '₹';
  const qrImageSrc = settings.qrCustomImage || qrDataUrl;

  const itemRows = invoice.items.map(item => `
    <div class="pos-item-line">
      <span>${escapeHTML(item.name || 'Item')}</span>
      <span>${formatCurrency(item.total, curr)}</span>
    </div>
    <div class="pos-item-math">
      ${item.quantity} ${escapeHTML(item.unit || 'pcs')} x ${formatCurrency(item.unitPrice, curr)} ${item.discount > 0 ? `(-${item.discount}%)` : ''}
    </div>
  `).join('<div style="height: 6px;"></div>');

  return `
    <div class="invoice-paper template-thermal" id="active-invoice-doc">
      <div class="pos-header">
        <div class="pos-store-name">${escapeHTML(settings.brandName || 'DOMESTIC STORE')}</div>
        <div class="pos-meta-line">${escapeHTML(settings.sellerName || '')}</div>
        ${settings.phone ? `<div class="pos-meta-line">Tel: ${escapeHTML(settings.phone)}</div>` : ''}
        ${settings.address ? `<div class="pos-meta-line">${escapeHTML(settings.address)}</div>` : ''}
        <div class="pos-receipt-badge">SALES MEMO / RECEIPT</div>
      </div>

      <div class="pos-customer-info">
        <div><strong>BILL NO:</strong> ${escapeHTML(invoice.invoiceNumber)}</div>
        <div><strong>DATE:</strong> ${escapeHTML(invoice.date)}</div>
        <div><strong>CUSTOMER:</strong> ${escapeHTML(invoice.customer.name || 'Walk-in / Valued')}</div>
        ${invoice.customer.phone ? `<div><strong>PHONE:</strong> ${escapeHTML(invoice.customer.phone)}</div>` : ''}
        <div><strong>STATUS:</strong> [${escapeHTML(invoice.status.toUpperCase())}]</div>
      </div>

      <div class="pos-double-divider"></div>

      <div style="font-size: 0.8rem; font-weight: 700; display: flex; justify-content: space-between; margin-bottom: 0.4rem;">
        <span>ITEMS</span>
        <span>AMOUNT</span>
      </div>

      <div class="pos-divider"></div>

      <div style="margin: 0.6rem 0;">
        ${itemRows || '<div style="text-align: center; color: #94a3b8;">No items</div>'}
      </div>

      <div class="pos-divider"></div>

      <div class="pos-total-row">
        <span>SUBTOTAL:</span>
        <span>${formatCurrency(invoice.subtotal, curr)}</span>
      </div>
      ${invoice.billDiscount > 0 ? `
        <div class="pos-total-row" style="color: #ef4444;">
          <span>DISCOUNT:</span>
          <span>-${formatCurrency(invoice.billDiscount, curr)}</span>
        </div>
      ` : ''}
      ${invoice.shippingFee > 0 ? `
        <div class="pos-total-row">
          <span>DELIVERY:</span>
          <span>+${formatCurrency(invoice.shippingFee, curr)}</span>
        </div>
      ` : ''}

      <div class="pos-double-divider"></div>

      <div class="pos-total-row grand">
        <span>NET PAYABLE:</span>
        <span>${formatCurrency(invoice.grandTotal, curr)}</span>
      </div>
      <div style="font-size: 0.72rem; text-align: right; color: #64748b; margin-top: 2px;">
        ${numberToWords(invoice.grandTotal)}
      </div>

      ${qrImageSrc ? `
        <div style="text-align: center; margin-top: 1rem;">
          <img src="${qrImageSrc}" alt="QR" class="pos-qr" />
          <div style="font-size: 0.75rem; font-weight: 700;">SCAN TO PAY VIA UPI</div>
          ${settings.upiId ? `<div style="font-size: 0.7rem;">${escapeHTML(settings.upiId)}</div>` : ''}
        </div>
      ` : ''}

      <div class="pos-footer">
        <div>*** THANK YOU! VISIT AGAIN ***</div>
        <div style="margin-top: 4px;">${escapeHTML(invoice.notes || settings.defaultNotes || 'Please retain this bill.')}</div>
        <div style="font-size: 0.65rem; margin-top: 6px; color: #94a3b8;">* Non-GST domestic retail record.</div>
      </div>
    </div>
  `;
}
