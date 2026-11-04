/**
 * Invoice Templates Engine for BillCraft
 * Four distinct templates:
 * 1. 'modern': Modern Minimalist (Corporate Boutique)
 * 2. 'classic': Classic Executive (Traditional Formal Receipt)
 * 3. 'boutique': Artisan Boutique (Warm Retail & Visual Badges)
 * 4. 'thermal': Compact POS Receipt (Monospace, Mobile-friendly)
 *
 * Every label comes from `tb`, the translator for the bill language
 * (see createTranslator in i18n/i18n.js), standard units too (kg → किलो on a
 * Hindi bill). Only that language is used here.
 */

import { formatCurrency, formatDate } from './models.js';
import { createTranslator, discountLabel, statusBadgeClass, statusLabel } from './i18n/i18n.js';
import { escapeHTML, safeImageSrc } from './safe.js';
import { unitLabel } from './units.js';

/** The "Pay by" line of a Due bill that has a due date, built by `line(date)`; '' for any other bill */
function payBy(invoice, language, line) {
  return invoice.status === 'Due' && invoice.dueDate ? line(escapeHTML(formatDate(invoice.dueDate, language))) : '';
}

/** The parts that are set, escaped and joined with a bullet, e.g. "Asha &bull; 98765 43210" */
function joinParts(parts) {
  return parts.filter(Boolean).map(escapeHTML).join(' &bull; ');
}

export function renderInvoice(templateId, invoice, settings, qrDataUrl = '', tb = createTranslator()) {
  switch (templateId) {
    case 'classic':
      return renderClassicTemplate(invoice, settings, qrDataUrl, tb);
    case 'boutique':
      return renderBoutiqueTemplate(invoice, settings, qrDataUrl, tb);
    case 'thermal':
      return renderThermalTemplate(invoice, settings, qrDataUrl, tb);
    case 'modern':
    default:
      return renderModernTemplate(invoice, settings, qrDataUrl, tb);
  }
}

// ============================================================
// TEMPLATE 1: MODERN MINIMAL
// ============================================================
export function renderModernTemplate(invoice, settings, qrDataUrl, tb = createTranslator()) {
  const { t, words, language } = tb;
  const curr = settings.currency || '₹';
  const qrImageSrc = escapeHTML(safeImageSrc(settings.qrCustomImage) || safeImageSrc(qrDataUrl));
  // The discount column appears only when an item has a discount
  const hasDiscount = invoice.items.some(item => item.discount > 0);

  const itemsRows = invoice.items.map((item, idx) => `
    <tr>
      <td style="color: #64748b; font-weight: 600; width: 32px;">${idx + 1}</td>
      <td>
        <div class="item-name">${escapeHTML(item.name || t('item.default'))}</div>
        ${item.description ? `<div class="item-sub">${escapeHTML(item.description)}</div>` : ''}
      </td>
      <td class="num">${formatCurrency(item.unitPrice, curr)}</td>
      <td class="num" style="font-weight: 600;">${item.quantity} ${escapeHTML(unitLabel(item.unit || 'pcs', t))}</td>
      ${hasDiscount ? `<td class="num" style="color: #64748b;">${item.discount > 0 ? `${item.discount}%` : '-'}</td>` : ''}
      <td class="num" style="font-weight: 700; color: #0f172a;">${formatCurrency(item.total, curr)}</td>
    </tr>
  `).join('');

  return `
    <div class="invoice-paper template-modern" id="active-invoice-doc">
      <!-- Header -->
      <div class="inv-header">
        <div>
          <div class="inv-brand-name">${escapeHTML(settings.brandName || t('bill.brandFallback'))}</div>
          ${settings.tagline ? `<div class="inv-brand-tagline">${escapeHTML(settings.tagline)}</div>` : ''}
          <div class="inv-seller-info">
            ${settings.sellerName ? `<strong>${escapeHTML(settings.sellerName)}</strong><br/>` : ''}
            ${settings.phone ? `${escapeHTML(t('bill.phone'))}: ${escapeHTML(settings.phone)}<br/>` : ''}
            ${settings.email ? `${escapeHTML(t('bill.email'))}: ${escapeHTML(settings.email)}<br/>` : ''}
            ${settings.address ? `<span>${escapeHTML(settings.address)}</span>` : ''}
          </div>
        </div>

        <div class="inv-meta-block">
          <div class="inv-title-badge">${escapeHTML(t('bill.title'))}</div>
          <div class="inv-number">${escapeHTML(invoice.invoiceNumber || 'BILL-001')}</div>
          <div class="inv-date-row"><strong>${escapeHTML(t('bill.date'))}:</strong> ${escapeHTML(formatDate(invoice.date, language))}</div>
          ${payBy(invoice, language, label => `<div class="inv-date-row"><strong>${escapeHTML(t('bill.payBy'))}:</strong> ${label}</div>`)}
          <div style="margin-top: 6px;">
            <span class="badge ${statusBadgeClass(invoice.status)}">${escapeHTML(statusLabel(t, invoice.status))}</span>
          </div>
        </div>
      </div>

      <!-- Parties Grid -->
      <div class="inv-parties-grid">
        <div class="party-col">
          <h4>${escapeHTML(t('bill.billedTo'))}</h4>
          <div class="customer-name">${escapeHTML(invoice.customer.name || t('common.valuedCustomer'))}</div>
          ${invoice.customer.phone ? `<p><strong>${escapeHTML(t('bill.contact'))}:</strong> ${escapeHTML(invoice.customer.phone)}</p>` : ''}
          ${invoice.customer.address ? `<p>${escapeHTML(invoice.customer.address)}</p>` : ''}
          ${invoice.customer.note ? `<p style="font-style: italic; color: #64748b;">${escapeHTML(t('bill.note'))}: ${escapeHTML(invoice.customer.note)}</p>` : ''}
        </div>
        <div class="party-col">
          <h4>${escapeHTML(t('bill.orderSummary'))}</h4>
          <p><strong>${escapeHTML(t('bill.lineItems'))}:</strong> ${invoice.items.length}</p>
          ${invoice.hasSingleUnit ? `<p><strong>${escapeHTML(t('bill.totalQty'))}:</strong> ${invoice.totalItemsCount}</p>` : ''}
          <p><strong>${escapeHTML(t('bill.paymentStatus'))}:</strong> ${escapeHTML(statusLabel(t, invoice.status))}</p>
        </div>
      </div>

      <!-- Table -->
      <table class="inv-table">
        <thead>
          <tr>
            <th>#</th>
            <th>${escapeHTML(t('bill.itemDescription'))}</th>
            <th class="num">${escapeHTML(t('bill.unitPrice'))}</th>
            <th class="num">${escapeHTML(t('bill.qty'))}</th>
            ${hasDiscount ? `<th class="num">${escapeHTML(t('bill.disc'))}</th>` : ''}
            <th class="num">${escapeHTML(t('bill.total'))}</th>
          </tr>
        </thead>
        <tbody>
          ${itemsRows.length ? itemsRows : `<tr><td colspan="${hasDiscount ? 6 : 5}" style="text-align:center; padding: 2rem; color: #64748b;">${escapeHTML(t('bill.noItems'))}</td></tr>`}
        </tbody>
      </table>

      <!-- Bottom: Payment & Totals -->
      <div class="inv-bottom-section">
        <!-- Left: Payment / QR -->
        <div class="inv-payment-box">
          ${qrImageSrc ? `
            <div class="payment-qr-wrap">
              <img src="${qrImageSrc}" alt="" style="width: 100%; height: 100%; object-fit: contain;" />
            </div>
          ` : ''}
          <div class="payment-info-text">
            <div class="payment-title">${escapeHTML(t('bill.payment'))}</div>
            ${settings.upiId ? `<div><strong>${escapeHTML(t('bill.upiId'))}:</strong> <span style="font-family: var(--font-mono);">${escapeHTML(settings.upiId)}</span></div>` : ''}
            <div>${escapeHTML(settings.paymentNotes || t('bill.scanToPay'))}</div>
          </div>
        </div>

        <!-- Right: Totals -->
        <div class="inv-totals-box">
          <div class="tot-row">
            <span>${escapeHTML(t('bill.subtotal'))}:</span>
            <span>${formatCurrency(invoice.subtotal, curr)}</span>
          </div>
          ${invoice.discountAmount > 0 ? `
            <div class="tot-row" style="color: var(--danger);">
              <span>${escapeHTML(discountLabel(t('bill.discount'), invoice))}:</span>
              <span>- ${formatCurrency(invoice.discountAmount, curr)}</span>
            </div>
          ` : ''}
          ${invoice.shippingFee > 0 ? `
            <div class="tot-row">
              <span>${escapeHTML(t('bill.delivery'))}:</span>
              <span>+ ${formatCurrency(invoice.shippingFee, curr)}</span>
            </div>
          ` : ''}
          <div class="tot-row grand">
            <span>${escapeHTML(t('bill.totalPayable'))}:</span>
            <span class="grand-price">${formatCurrency(invoice.grandTotal, curr)}</span>
          </div>
          <div class="amount-words-badge">
            ${escapeHTML(words(invoice.grandTotal))}
          </div>
        </div>
      </div>

      <!-- Footer Notes -->
      <div class="inv-footer-notes">
        <div>
          <strong>${escapeHTML(t('bill.note'))}:</strong> ${escapeHTML(invoice.notes || settings.defaultNotes || t('bill.thanks'))}
          <div style="font-size: 0.72rem; color: #64748b; margin-top: 4px;">${escapeHTML(t('bill.noteNonGst'))}</div>
        </div>
        <div style="text-align: right;">
          <div style="font-weight: 700; color: #1e293b;">${escapeHTML(settings.brandName || t('bill.authorised'))}</div>
          <div style="font-size: 0.72rem; color: #64748b;">${escapeHTML(t('bill.issuedThanks'))}</div>
        </div>
      </div>
    </div>
  `;
}

// ============================================================
// TEMPLATE 2: CLASSIC EXECUTIVE
// ============================================================
export function renderClassicTemplate(invoice, settings, qrDataUrl, tb = createTranslator()) {
  const { t, words, language } = tb;
  const curr = settings.currency || '₹';
  const qrImageSrc = escapeHTML(safeImageSrc(settings.qrCustomImage) || safeImageSrc(qrDataUrl));
  const hasDiscount = invoice.items.some(item => item.discount > 0);

  const rows = invoice.items.map((item, idx) => `
    <tr>
      <td style="text-align: center; width: 36px;">${idx + 1}</td>
      <td>
        <strong>${escapeHTML(item.name || t('item.default'))}</strong>
        ${item.description ? `<br/><small style="color: #64748b;">${escapeHTML(item.description)}</small>` : ''}
      </td>
      <td class="num">${formatCurrency(item.unitPrice, curr)}</td>
      <td class="num">${item.quantity} ${escapeHTML(unitLabel(item.unit || 'pcs', t))}</td>
      ${hasDiscount ? `<td class="num">${item.discount > 0 ? `${item.discount}%` : '-'}</td>` : ''}
      <td class="num"><strong>${formatCurrency(item.total, curr)}</strong></td>
    </tr>
  `).join('');

  return `
    <div class="invoice-paper template-classic" id="active-invoice-doc">
      <div class="inv-classic-header">
        <div>
          <div class="classic-title">${escapeHTML(t('bill.retailTitle'))}</div>
          <div class="classic-brand">${escapeHTML(settings.brandName || t('bill.brandFallback'))}</div>
          <div style="font-size: 0.85rem; color: #475569; margin-top: 4px;">
            ${joinParts([settings.sellerName, settings.phone])}${settings.sellerName || settings.phone ? '<br/>' : ''}
            ${escapeHTML(settings.address || '')}
          </div>
        </div>
        <div class="classic-number-block">
          <div style="font-size: 1.25rem; font-weight: 800;">${escapeHTML(invoice.invoiceNumber)}</div>
          <div style="font-size: 0.85rem; color: #475569;">${escapeHTML(t('bill.date'))}: ${escapeHTML(formatDate(invoice.date, language))}</div>
          ${payBy(invoice, language, label => `<div style="font-size: 0.85rem; color: #475569;">${escapeHTML(t('bill.payBy'))}: ${label}</div>`)}
          <div style="margin-top: 8px;">
            <span class="badge ${statusBadgeClass(invoice.status)}">${escapeHTML(statusLabel(t, invoice.status))}</span>
          </div>
        </div>
      </div>

      <div class="classic-grid-meta">
        <div class="meta-cell">
          <div class="meta-cell-label">${escapeHTML(t('bill.customerName'))}</div>
          <div class="meta-cell-value">${escapeHTML(invoice.customer.name || t('common.valuedCustomer'))}</div>
        </div>
        <div class="meta-cell">
          <div class="meta-cell-label">${escapeHTML(t('bill.contactPhone'))}</div>
          <div class="meta-cell-value">${escapeHTML(invoice.customer.phone || t('common.notAvailable'))}</div>
        </div>
        <div class="meta-cell">
          <div class="meta-cell-label">${escapeHTML(t('bill.deliveryAddress'))}</div>
          <div class="meta-cell-value" style="font-size: 0.82rem; font-weight: normal;">${escapeHTML(invoice.customer.address || t('common.localSale'))}</div>
        </div>
      </div>

      <table class="classic-table">
        <thead>
          <tr>
            <th>#</th>
            <th>${escapeHTML(t('bill.itemDetails'))}</th>
            <th class="num">${escapeHTML(t('bill.rate'))}</th>
            <th class="num">${escapeHTML(t('bill.qty'))}</th>
            ${hasDiscount ? `<th class="num">${escapeHTML(t('bill.disc'))}</th>` : ''}
            <th class="num">${escapeHTML(t('bill.amount'))}</th>
          </tr>
        </thead>
        <tbody>
          ${rows.length ? rows : `<tr><td colspan="${hasDiscount ? 6 : 5}" style="text-align: center; padding: 2rem;">${escapeHTML(t('bill.noItemsShort'))}</td></tr>`}
        </tbody>
      </table>

      <div class="classic-bottom">
        <div style="flex: 1; font-size: 0.82rem; color: #475569;">
          <div style="display: flex; gap: 1rem; align-items: center; margin-bottom: 1rem;">
            ${qrImageSrc ? `<img src="${qrImageSrc}" alt="" style="width: 112px; height: 112px; border: 1px solid #cbd5e1; flex-shrink: 0;" />` : ''}
            <div>
              <strong>${escapeHTML(t('bill.paymentSettlement'))}:</strong><br/>
              ${settings.upiId ? `${escapeHTML(t('bill.upi'))}: ${escapeHTML(settings.upiId)}<br/>` : ''}
              ${escapeHTML(settings.paymentNotes || t('bill.directTransfer'))}
            </div>
          </div>
          <p><strong>${escapeHTML(t('bill.terms'))}:</strong> ${escapeHTML(invoice.notes || settings.defaultNotes || t('bill.thanksPatronage'))}</p>
          <p style="font-style: italic; color: #64748b; margin-top: 4px;">${escapeHTML(t('bill.noteBillOfSupply'))}</p>
        </div>

        <div class="classic-summary-wrap">
          <table class="classic-summary-table">
            <tr>
              <td>${escapeHTML(t('bill.subtotal'))}</td>
              <td class="num">${formatCurrency(invoice.subtotal, curr)}</td>
            </tr>
            ${invoice.discountAmount > 0 ? `
              <tr>
                <td>${escapeHTML(discountLabel(t('bill.specialDiscount'), invoice))}</td>
                <td class="num" style="color: #b91c1c;">-${formatCurrency(invoice.discountAmount, curr)}</td>
              </tr>
            ` : ''}
            ${invoice.shippingFee > 0 ? `
              <tr>
                <td>${escapeHTML(t('bill.deliveryCharges'))}</td>
                <td class="num">+${formatCurrency(invoice.shippingFee, curr)}</td>
              </tr>
            ` : ''}
            <tr class="total">
              <td>${escapeHTML(t('bill.totalAmount'))}</td>
              <td class="num">${formatCurrency(invoice.grandTotal, curr)}</td>
            </tr>
          </table>
        </div>
      </div>

      <div style="margin-top: 2rem; border-top: 1px solid #cbd5e1; padding-top: 0.75rem; display: flex; justify-content: space-between; font-size: 0.78rem; color: #64748b;">
        <div>${escapeHTML(t('bill.amountInWords'))}: <em>${escapeHTML(words(invoice.grandTotal))}</em></div>
        <div style="text-align: right;">${escapeHTML(t('bill.forBusiness', { name: settings.brandName || t('bill.authorised') }))}</div>
      </div>
    </div>
  `;
}

// ============================================================
// TEMPLATE 3: ARTISAN BOUTIQUE
// ============================================================
export function renderBoutiqueTemplate(invoice, settings, qrDataUrl, tb = createTranslator()) {
  const { t, words, language } = tb;
  const curr = settings.currency || '₹';
  const qrImageSrc = escapeHTML(safeImageSrc(settings.qrCustomImage) || safeImageSrc(qrDataUrl));

  const rows = invoice.items.map((item, idx) => `
    <tr class="boutique-row">
      <td style="font-weight: 700; color: #475569;">#${idx + 1}</td>
      <td>
        <div style="font-weight: 800; color: #0f172a;">${escapeHTML(item.name || t('item.default'))}</div>
        ${item.description ? `<div style="font-size: 0.78rem; color: #64748b;">${escapeHTML(item.description)}</div>` : ''}
        ${item.discount > 0 ? `<div style="font-size: 0.78rem; color: #64748b;">${escapeHTML(t('bill.disc'))} ${item.discount}%</div>` : ''}
      </td>
      <td class="num" style="color: #475569;">${formatCurrency(item.unitPrice, curr)}</td>
      <td class="num" style="font-weight: 600;">${item.quantity} ${escapeHTML(unitLabel(item.unit || 'pcs', t))}</td>
      <td class="num" style="font-weight: 800; color: #0f172a;">${formatCurrency(item.total, curr)}</td>
    </tr>
  `).join('');

  return `
    <div class="invoice-paper template-boutique" id="active-invoice-doc">
      <div class="boutique-banner">
        <div>
          <div class="boutique-brand-name">${escapeHTML(settings.brandName || t('template.boutique'))}</div>
          <div style="opacity: 0.9; font-size: 0.88rem; margin-top: 4px;">${escapeHTML(settings.tagline || '')}</div>
          <div style="font-size: 0.8rem; opacity: 0.8; margin-top: 6px;">
            ${joinParts([settings.sellerName, settings.phone])}
          </div>
        </div>
        <div>
          <div class="boutique-pill">${escapeHTML(invoice.invoiceNumber)}</div>
          <div style="text-align: right; font-size: 0.82rem; margin-top: 6px; opacity: 0.9;">${escapeHTML(t('bill.date'))}: ${escapeHTML(formatDate(invoice.date, language))}</div>
          ${payBy(invoice, language, label => `<div style="text-align: right; font-size: 0.82rem; margin-top: 2px; opacity: 0.9;">${escapeHTML(t('bill.payBy'))}: ${label}</div>`)}
        </div>
      </div>

      <div class="boutique-body">
        <div class="boutique-parties">
          <div>
            <div style="font-size: 0.72rem; text-transform: uppercase; font-weight: 800; color: #64748b; margin-bottom: 4px;">${escapeHTML(t('bill.preparedFor'))}</div>
            <div style="font-size: 1.15rem; font-weight: 800; color: #0f172a;">${escapeHTML(invoice.customer.name || t('common.valuedCustomer'))}</div>
            ${invoice.customer.phone ? `<div style="font-size: 0.85rem; color: #475569;">${escapeHTML(t('bill.phone'))}: ${escapeHTML(invoice.customer.phone)}</div>` : ''}
            ${invoice.customer.address ? `<div style="font-size: 0.85rem; color: #64748b;">${escapeHTML(invoice.customer.address)}</div>` : ''}
          </div>
          <div style="text-align: right;">
            <div style="font-size: 0.72rem; text-transform: uppercase; font-weight: 800; color: #64748b; margin-bottom: 4px;">${escapeHTML(t('bill.billStatus'))}</div>
            <span class="badge ${statusBadgeClass(invoice.status)}" style="font-size: 0.85rem; padding: 0.35rem 0.8rem;">${escapeHTML(statusLabel(t, invoice.status))}</span>
          </div>
        </div>

        <table class="boutique-table">
          <thead>
            <tr>
              <th>#</th>
              <th>${escapeHTML(t('bill.product'))}</th>
              <th class="num">${escapeHTML(t('bill.price'))}</th>
              <th class="num">${escapeHTML(t('bill.quantity'))}</th>
              <th class="num">${escapeHTML(t('bill.total'))}</th>
            </tr>
          </thead>
          <tbody>
            ${rows.length ? rows : `<tr><td colspan="5" style="text-align: center; padding: 1.5rem;">${escapeHTML(t('bill.noItemsShort'))}</td></tr>`}
          </tbody>
        </table>

        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 1.5rem; flex-wrap: wrap; gap: 1.5rem;">
          <div style="display: flex; align-items: center; gap: 1rem; max-width: 320px;">
            ${qrImageSrc ? `<img src="${qrImageSrc}" alt="" style="width: 112px; height: 112px; border-radius: 8px; border: 1px solid #e2e8f0; flex-shrink: 0;" />` : ''}
            <div style="font-size: 0.82rem; color: #475569;">
              <strong>${escapeHTML(t('bill.payViaUpi'))}:</strong><br/>
              ${settings.upiId ? `<span style="font-family: var(--font-mono); font-weight: 600;">${escapeHTML(settings.upiId)}</span><br/>` : ''}
              <span>${escapeHTML(settings.paymentNotes || t('bill.instantPay'))}</span>
            </div>
          </div>

          <div class="boutique-total-card">
            <div style="display: flex; justify-content: space-between; font-size: 0.88rem; color: #475569; margin-bottom: 0.4rem;">
              <span>${escapeHTML(t('bill.itemsTotal'))}:</span>
              <span>${formatCurrency(invoice.subtotal, curr)}</span>
            </div>
            ${invoice.discountAmount > 0 ? `
              <div style="display: flex; justify-content: space-between; font-size: 0.88rem; color: var(--danger); margin-bottom: 0.4rem;">
                <span>${escapeHTML(discountLabel(t('bill.discount'), invoice))}:</span>
                <span>-${formatCurrency(invoice.discountAmount, curr)}</span>
              </div>
            ` : ''}
            ${invoice.shippingFee > 0 ? `
              <div style="display: flex; justify-content: space-between; font-size: 0.88rem; color: #475569; margin-bottom: 0.4rem;">
                <span>${escapeHTML(t('bill.delivery'))}:</span>
                <span>+${formatCurrency(invoice.shippingFee, curr)}</span>
              </div>
            ` : ''}
            <div style="display: flex; justify-content: space-between; font-size: 1.25rem; font-weight: 800; color: #0f172a; border-top: 1px solid #cbd5e1; padding-top: 0.6rem; margin-top: 0.4rem;">
              <span>${escapeHTML(t('bill.grandTotal'))}:</span>
              <span style="color: var(--theme-accent, #4f46e5);">${formatCurrency(invoice.grandTotal, curr)}</span>
            </div>
            <div style="font-size: 0.72rem; color: #475569; text-align: right; margin-top: 4px;">
              ${escapeHTML(words(invoice.grandTotal))}
            </div>
          </div>
        </div>

        <div style="margin-top: 2.5rem; text-align: center; border-top: 1px solid #f1f5f9; padding-top: 1rem; font-size: 0.82rem; color: #64748b;">
          ${escapeHTML(invoice.notes || settings.defaultNotes || t('bill.thanksSupport'))}
          <div style="font-size: 0.72rem; margin-top: 4px;">${escapeHTML(t('bill.noteMemo'))}</div>
        </div>
      </div>
    </div>
  `;
}

// ============================================================
// TEMPLATE 4: COMPACT THERMAL / POS RECEIPT
// ============================================================
export function renderThermalTemplate(invoice, settings, qrDataUrl, tb = createTranslator()) {
  const { t, words, language } = tb;
  const curr = settings.currency || '₹';
  const qrImageSrc = escapeHTML(safeImageSrc(settings.qrCustomImage) || safeImageSrc(qrDataUrl));

  const itemRows = invoice.items.map(item => `
    <div class="pos-item-line">
      <span>${escapeHTML(item.name || t('item.default'))}</span>
      <span>${formatCurrency(item.total, curr)}</span>
    </div>
    <div class="pos-item-math">
      ${item.quantity} ${escapeHTML(unitLabel(item.unit || 'pcs', t))} x ${formatCurrency(item.unitPrice, curr)} ${item.discount > 0 ? `(-${item.discount}%)` : ''}
    </div>
  `).join('<div style="height: 6px;"></div>');

  return `
    <div class="invoice-paper template-thermal" id="active-invoice-doc">
      <div class="pos-header">
        <div class="pos-store-name">${escapeHTML(settings.brandName || t('bill.brandFallback'))}</div>
        ${settings.sellerName ? `<div class="pos-meta-line">${escapeHTML(settings.sellerName)}</div>` : ''}
        ${settings.phone ? `<div class="pos-meta-line">${escapeHTML(t('bill.thermalTel'))}: ${escapeHTML(settings.phone)}</div>` : ''}
        ${settings.address ? `<div class="pos-meta-line">${escapeHTML(settings.address)}</div>` : ''}
        <div class="pos-receipt-badge">${escapeHTML(t('bill.receiptBadge'))}</div>
      </div>

      <div class="pos-customer-info">
        <div><strong>${escapeHTML(t('bill.billNoCaps'))}:</strong> ${escapeHTML(invoice.invoiceNumber)}</div>
        <div><strong>${escapeHTML(t('bill.dateCaps'))}:</strong> ${escapeHTML(formatDate(invoice.date, language))}</div>
        ${payBy(invoice, language, label => `<div><strong>${escapeHTML(t('bill.payBy').toUpperCase())}:</strong> ${label}</div>`)}
        <div><strong>${escapeHTML(t('bill.customerCaps'))}:</strong> ${escapeHTML(invoice.customer.name || t('bill.walkIn'))}</div>
        ${invoice.customer.phone ? `<div><strong>${escapeHTML(t('bill.phoneCaps'))}:</strong> ${escapeHTML(invoice.customer.phone)}</div>` : ''}
        <div><strong>${escapeHTML(t('bill.statusCaps'))}:</strong> [${escapeHTML(statusLabel(t, invoice.status).toUpperCase())}]</div>
      </div>

      <div class="pos-double-divider"></div>

      <div style="font-size: 0.8rem; font-weight: 700; display: flex; justify-content: space-between; margin-bottom: 0.4rem;">
        <span>${escapeHTML(t('bill.thermalItems'))}</span>
        <span>${escapeHTML(t('bill.thermalAmount'))}</span>
      </div>

      <div class="pos-divider"></div>

      <div style="margin: 0.6rem 0;">
        ${itemRows || `<div style="text-align: center; color: #64748b;">${escapeHTML(t('bill.noItemsShort'))}</div>`}
      </div>

      <div class="pos-divider"></div>

      <div class="pos-total-row">
        <span>${escapeHTML(t('bill.thermalSubtotal'))}:</span>
        <span>${formatCurrency(invoice.subtotal, curr)}</span>
      </div>
      ${invoice.discountAmount > 0 ? `
        <div class="pos-total-row" style="color: #b91c1c;">
          <span>${escapeHTML(discountLabel(t('bill.thermalDiscount'), invoice))}:</span>
          <span>-${formatCurrency(invoice.discountAmount, curr)}</span>
        </div>
      ` : ''}
      ${invoice.shippingFee > 0 ? `
        <div class="pos-total-row">
          <span>${escapeHTML(t('bill.thermalDelivery'))}:</span>
          <span>+${formatCurrency(invoice.shippingFee, curr)}</span>
        </div>
      ` : ''}

      <div class="pos-double-divider"></div>

      <div class="pos-total-row grand">
        <span>${escapeHTML(t('bill.netPayable'))}:</span>
        <span>${formatCurrency(invoice.grandTotal, curr)}</span>
      </div>
      <div style="font-size: 0.72rem; text-align: right; color: #64748b; margin-top: 2px;">
        ${escapeHTML(words(invoice.grandTotal))}
      </div>

      ${qrImageSrc ? `
        <div style="text-align: center; margin-top: 1rem;">
          <img src="${qrImageSrc}" alt="" class="pos-qr" />
          <div style="font-size: 0.75rem; font-weight: 700;">${escapeHTML(t('bill.scanToPayCaps'))}</div>
          ${settings.upiId ? `<div style="font-size: 0.7rem;">${escapeHTML(settings.upiId)}</div>` : ''}
        </div>
      ` : ''}

      <div class="pos-footer">
        <div>*** ${escapeHTML(t('bill.thanksVisit'))} ***</div>
        <div style="margin-top: 4px;">${escapeHTML(invoice.notes || settings.defaultNotes || t('bill.thanksRetain'))}</div>
        <div style="font-size: 0.65rem; margin-top: 6px; color: #64748b;">${escapeHTML(t('bill.noteRetail'))}</div>
      </div>
    </div>
  `;
}
