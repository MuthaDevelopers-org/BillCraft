/**
 * BillCraft - Main Application Controller
 * Optimized for Mobile-First & Desktop Split-Screen UX
 */

import { Product, Invoice, InvoiceItem, BusinessSettings, formatCurrency, numberToWords } from './models.js';
import { StorageService } from './storage.js';
import { renderInvoice } from './templates.js';
import { generateQRCodeURL, buildUPIString } from './qrHelper.js';
import { ExporterService } from './exporter.js';

class BillCraftApp {
  constructor() {
    this.settings = StorageService.getSettings();
    this.catalog = StorageService.getCatalog();
    this.invoices = StorageService.getInvoices();
    this.currentInvoice = StorageService.getActiveDraft() || this.createNewInvoice();
    this.activeTemplate = this.currentInvoice.template || this.settings.defaultTemplate || 'modern';
    this.currentView = 'builder';
    this.activeMobileTab = 'editor';
    this.qrDataUrl = '';

    this.editingProductId = null;

    this.init();
  }

  init() {
    this.applyThemeAccent(this.settings.themeAccent);
    this.bindNavigation();
    this.bindBuilderEvents();
    this.bindCatalogEvents();
    this.bindHistoryEvents();
    this.bindSettingsEvents();
    this.bindModalEvents();

    this.refreshQR();
    this.renderActiveView();
    this.renderActiveInvoicePreview();
    this.updateSidebarBrand();
  }

  // --- Theme & Brand ---
  applyThemeAccent(accent) {
    document.documentElement.setAttribute('data-accent', accent || 'emerald');
  }

  updateSidebarBrand() {
    const brandNameEl = document.getElementById('sidebar-brand-name');
    const brandAvatarEl = document.getElementById('sidebar-brand-avatar');
    if (brandNameEl) brandNameEl.textContent = this.settings.brandName || 'BillCraft';
    if (brandAvatarEl) {
      const initial = (this.settings.brandName || 'B').trim().charAt(0).toUpperCase();
      brandAvatarEl.textContent = initial;
    }
  }

  // --- View Navigation ---
  bindNavigation() {
    const navButtons = document.querySelectorAll('.nav-btn');
    navButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        this.switchView(view);
      });
    });

    // Mobile tabs for bill builder (Editor vs Preview)
    const tabBtns = document.querySelectorAll('.view-tab-btn');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        this.switchMobileTab(tab);
      });
    });

    const jumpToPreviewBtn = document.getElementById('btn-jump-to-preview');
    if (jumpToPreviewBtn) {
      jumpToPreviewBtn.addEventListener('click', () => {
        this.switchMobileTab('preview');
        const previewPanel = document.querySelector('.bill-preview-panel');
        if (previewPanel) {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      });
    }
  }

  switchView(viewName) {
    this.currentView = viewName;

    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === viewName);
    });

    document.querySelectorAll('.view-section').forEach(section => {
      section.classList.toggle('active', section.id === `view-${viewName}`);
    });

    const titleMap = {
      builder: 'New Sales Bill',
      catalog: 'Product Catalog',
      history: 'Bills & History',
      settings: 'Settings & Profile'
    };
    const titleEl = document.getElementById('topbar-page-title');
    if (titleEl) titleEl.textContent = titleMap[viewName] || 'BillCraft';

    if (viewName === 'catalog') this.renderCatalogView();
    if (viewName === 'history') this.renderHistoryView();
    if (viewName === 'settings') this.renderSettingsView();
    if (viewName === 'builder') this.renderBuilderForm();

    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  switchMobileTab(tabName) {
    this.activeMobileTab = tabName;
    const layout = document.querySelector('.bill-builder-layout');
    if (layout) {
      layout.classList.remove('tab-mode-editor', 'tab-mode-preview');
      layout.classList.add(`tab-mode-${tabName}`);
    }

    document.querySelectorAll('.view-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    if (tabName === 'preview') {
      this.renderActiveInvoicePreview();
    }
  }

  // --- Bill Builder Logic ---
  createNewInvoice() {
    const nextNum = StorageService.getNextInvoiceNumber();
    return new Invoice({
      invoiceNumber: nextNum,
      date: new Date().toISOString().split('T')[0],
      template: this.settings.defaultTemplate || 'modern',
      notes: this.settings.defaultNotes,
      status: 'Paid',
      items: [
        new InvoiceItem({
          name: 'Handcrafted Soy Wax Candle (Lavender & Vanilla)',
          description: 'Eco-friendly 200g jar',
          quantity: 1,
          unit: 'pcs',
          unitPrice: 450
        })
      ]
    });
  }

  bindBuilderEvents() {
    const btnNewBill = document.getElementById('btn-new-bill');
    if (btnNewBill) {
      btnNewBill.addEventListener('click', () => {
        if (confirm('Create a new blank bill?')) {
          this.currentInvoice = this.createNewInvoice();
          StorageService.saveActiveDraft(this.currentInvoice);
          this.switchView('builder');
          this.switchMobileTab('editor');
          this.renderBuilderForm();
          this.renderActiveInvoicePreview();
          this.showToast('Created new blank bill', 'info');
        }
      });
    }

    const btnSaveBill = document.getElementById('btn-save-bill');
    if (btnSaveBill) {
      btnSaveBill.addEventListener('click', () => {
        this.saveCurrentInvoiceToHistory();
      });
    }

    const inputs = [
      'inv-number', 'inv-date', 'inv-status',
      'cust-name', 'cust-phone', 'cust-address', 'cust-notes',
      'inv-shipping', 'inv-discount', 'inv-footer-notes'
    ];

    inputs.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', () => this.syncFormToInvoice());
      }
    });

    const btnAddCustom = document.getElementById('btn-add-custom-item');
    if (btnAddCustom) {
      btnAddCustom.addEventListener('click', () => {
        this.currentInvoice.items.push(new InvoiceItem({
          name: '',
          quantity: 1,
          unit: 'pcs',
          unitPrice: 0
        }));
        this.renderAllItemsViews();
        this.syncFormToInvoice();
        this.showToast('Added new item row', 'info');
      });
    }

    const btnPickCatalog = document.getElementById('btn-pick-from-catalog');
    if (btnPickCatalog) {
      btnPickCatalog.addEventListener('click', () => {
        this.openCatalogPickerModal();
      });
    }

    const templateSelect = document.getElementById('preview-template-select');
    if (templateSelect) {
      templateSelect.addEventListener('change', (e) => {
        this.activeTemplate = e.target.value;
        this.currentInvoice.template = this.activeTemplate;
        this.renderActiveInvoicePreview();
      });
    }

    // Export Handlers
    const btnExportPDF = document.getElementById('btn-export-pdf');
    if (btnExportPDF) {
      btnExportPDF.addEventListener('click', async () => {
        this.showToast('Preparing PDF download...', 'info');
        const filename = `${this.currentInvoice.invoiceNumber || 'bill'}.pdf`;
        await ExporterService.exportPDF('active-invoice-doc', filename);
        this.showToast('PDF ready!', 'success');
      });
    }

    const btnExportImage = document.getElementById('btn-export-image');
    if (btnExportImage) {
      btnExportImage.addEventListener('click', async () => {
        this.showToast('Generating PNG image...', 'info');
        const filename = `${this.currentInvoice.invoiceNumber || 'bill'}.png`;
        await ExporterService.exportImage('active-invoice-doc', filename);
        this.showToast('Image downloaded!', 'success');
      });
    }

    const btnShareWhatsApp = document.getElementById('btn-share-whatsapp');
    if (btnShareWhatsApp) {
      btnShareWhatsApp.addEventListener('click', () => {
        ExporterService.shareWhatsApp(this.currentInvoice, this.settings);
      });
    }

    const btnPrintBill = document.getElementById('btn-print-bill');
    if (btnPrintBill) {
      btnPrintBill.addEventListener('click', () => {
        ExporterService.triggerPrint();
      });
    }
  }

  syncFormToInvoice() {
    this.currentInvoice.invoiceNumber = document.getElementById('inv-number')?.value || '';
    this.currentInvoice.date = document.getElementById('inv-date')?.value || '';
    this.currentInvoice.status = document.getElementById('inv-status')?.value || 'Paid';

    this.currentInvoice.customer = {
      name: document.getElementById('cust-name')?.value || '',
      phone: document.getElementById('cust-phone')?.value || '',
      address: document.getElementById('cust-address')?.value || '',
      note: document.getElementById('cust-notes')?.value || ''
    };

    this.currentInvoice.shippingFee = parseFloat(document.getElementById('inv-shipping')?.value) || 0;
    this.currentInvoice.billDiscount = parseFloat(document.getElementById('inv-discount')?.value) || 0;
    this.currentInvoice.notes = document.getElementById('inv-footer-notes')?.value || '';

    this.updateTotalsCard();
    this.refreshQR();
    this.renderActiveInvoicePreview();

    StorageService.saveActiveDraft(this.currentInvoice);
  }

  renderBuilderForm() {
    document.getElementById('inv-number').value = this.currentInvoice.invoiceNumber || '';
    document.getElementById('inv-date').value = this.currentInvoice.date || '';
    document.getElementById('inv-status').value = this.currentInvoice.status || 'Paid';

    document.getElementById('cust-name').value = this.currentInvoice.customer.name || '';
    document.getElementById('cust-phone').value = this.currentInvoice.customer.phone || '';
    document.getElementById('cust-address').value = this.currentInvoice.customer.address || '';
    document.getElementById('cust-notes').value = this.currentInvoice.customer.note || '';

    document.getElementById('inv-shipping').value = this.currentInvoice.shippingFee || '';
    document.getElementById('inv-discount').value = this.currentInvoice.billDiscount || '';
    document.getElementById('inv-footer-notes').value = this.currentInvoice.notes || '';

    const templateSelect = document.getElementById('preview-template-select');
    if (templateSelect) {
      templateSelect.value = this.currentInvoice.template || this.settings.defaultTemplate || 'modern';
      this.activeTemplate = templateSelect.value;
    }

    this.renderAllItemsViews();
    this.updateTotalsCard();
  }

  renderAllItemsViews() {
    this.renderDesktopItemsTable();
    this.renderMobileItemsCards();
  }

  renderDesktopItemsTable() {
    const tbody = document.getElementById('items-table-body');
    if (!tbody) return;

    tbody.innerHTML = '';
    const curr = this.settings.currency || '₹';

    if (this.currentInvoice.items.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align:center; padding: 1.5rem; color: #94a3b8;">
            No items added yet. Click <strong>"+ From Catalog"</strong> or <strong>"+ Custom Item"</strong>.
          </td>
        </tr>
      `;
      return;
    }

    this.currentInvoice.items.forEach((item, index) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="min-width: 170px;">
          <input type="text" class="form-control item-row-title-input" placeholder="Item name" value="${this.escape(item.name)}" data-index="${index}" data-field="name" />
          <input type="text" class="form-control item-row-desc-input" placeholder="Optional description" value="${this.escape(item.description)}" data-index="${index}" data-field="description" />
        </td>
        <td style="width: 100px;">
          <input type="number" step="any" min="0" class="form-control" value="${item.unitPrice}" data-index="${index}" data-field="unitPrice" />
        </td>
        <td style="width: 120px;">
          <div style="display: flex; gap: 4px;">
            <input type="number" step="any" min="0.01" class="form-control" style="width: 60px;" value="${item.quantity}" data-index="${index}" data-field="quantity" />
            <input type="text" class="form-control" style="width: 50px;" placeholder="pcs" value="${this.escape(item.unit)}" data-index="${index}" data-field="unit" />
          </div>
        </td>
        <td style="width: 75px;">
          <input type="number" min="0" max="100" class="form-control" placeholder="0" value="${item.discount || ''}" data-index="${index}" data-field="discount" />
        </td>
        <td style="width: 90px; text-align: right;">
          <div class="item-total-badge">${formatCurrency(item.total, curr)}</div>
        </td>
        <td style="width: 40px; text-align: center;">
          <button type="button" class="btn btn-ghost btn-icon btn-remove-item" data-index="${index}" title="Remove item" style="color: var(--danger);">
            <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll('input').forEach(input => {
      input.addEventListener('input', (e) => {
        const idx = parseInt(e.target.dataset.index, 10);
        const field = e.target.dataset.field;
        let val = e.target.value;

        if (field === 'unitPrice' || field === 'quantity' || field === 'discount') {
          val = parseFloat(val) || 0;
        }

        this.currentInvoice.items[idx][field] = val;
        this.renderMobileItemsCards(); // Sync to mobile view
        this.updateTotalsCard();
        this.renderActiveInvoicePreview();
        StorageService.saveActiveDraft(this.currentInvoice);
      });
    });

    tbody.querySelectorAll('.btn-remove-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.index, 10);
        this.currentInvoice.items.splice(idx, 1);
        this.renderAllItemsViews();
        this.updateTotalsCard();
        this.renderActiveInvoicePreview();
        StorageService.saveActiveDraft(this.currentInvoice);
      });
    });
  }

  renderMobileItemsCards() {
    const container = document.getElementById('mobile-items-list');
    if (!container) return;

    container.innerHTML = '';
    const curr = this.settings.currency || '₹';

    if (this.currentInvoice.items.length === 0) {
      container.innerHTML = `
        <div style="text-align:center; padding: 1.5rem; color: #94a3b8; background: var(--bg-surface); border-radius: var(--radius-md); border: 1px dashed var(--border-light);">
          No items in bill yet.
        </div>
      `;
      return;
    }

    this.currentInvoice.items.forEach((item, index) => {
      const card = document.createElement('div');
      card.className = 'mobile-item-card';
      card.innerHTML = `
        <div class="mobile-item-header">
          <div class="mobile-item-title-wrap">
            <input type="text" class="form-control" style="font-weight: 700; margin-bottom: 4px;" placeholder="Product / Item name" value="${this.escape(item.name)}" data-index="${index}" data-field="name" />
            <input type="text" class="form-control" style="font-size: 0.8rem;" placeholder="Description / notes (optional)" value="${this.escape(item.description)}" data-index="${index}" data-field="description" />
          </div>
          <button type="button" class="btn btn-ghost btn-icon btn-del-mob-item" data-index="${index}" style="color: var(--danger); margin-left: 4px;" title="Delete">
            <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
          </button>
        </div>

        <div class="mobile-item-inputs-grid">
          <div>
            <label class="form-label" style="font-size: 0.7rem; margin-bottom: 2px;">Rate (${curr})</label>
            <input type="number" step="any" min="0" class="form-control" value="${item.unitPrice}" data-index="${index}" data-field="unitPrice" />
          </div>

          <div>
            <label class="form-label" style="font-size: 0.7rem; margin-bottom: 2px;">Quantity</label>
            <div class="qty-stepper">
              <button type="button" class="qty-step-btn btn-mob-qty-minus" data-index="${index}">&minus;</button>
              <input type="number" step="any" min="0.01" class="qty-stepper-input" value="${item.quantity}" data-index="${index}" data-field="quantity" />
              <button type="button" class="qty-step-btn btn-mob-qty-plus" data-index="${index}">&#43;</button>
            </div>
          </div>

          <div>
            <label class="form-label" style="font-size: 0.7rem; margin-bottom: 2px;">Unit</label>
            <input type="text" class="form-control" placeholder="pcs" value="${this.escape(item.unit)}" data-index="${index}" data-field="unit" />
          </div>
        </div>

        <div class="mobile-item-footer">
          <div style="display: flex; align-items: center; gap: 4px; font-size: 0.8rem; color: var(--text-muted);">
            <span>Disc %:</span>
            <input type="number" min="0" max="100" class="form-control" style="width: 55px; height: 32px; padding: 2px 6px;" placeholder="0" value="${item.discount || ''}" data-index="${index}" data-field="discount" />
          </div>
          <div>
            <span style="font-size: 0.75rem; color: var(--text-muted); margin-right: 4px;">Total:</span>
            <span class="item-total-badge" style="color: var(--theme-accent, #4f46e5); font-size: 1.05rem;">${formatCurrency(item.total, curr)}</span>
          </div>
        </div>
      `;
      container.appendChild(card);
    });

    // Mobile inputs binding
    container.querySelectorAll('input').forEach(input => {
      input.addEventListener('input', (e) => {
        const idx = parseInt(e.target.dataset.index, 10);
        const field = e.target.dataset.field;
        let val = e.target.value;

        if (field === 'unitPrice' || field === 'quantity' || field === 'discount') {
          val = parseFloat(val) || 0;
        }

        this.currentInvoice.items[idx][field] = val;
        this.renderDesktopItemsTable(); // Sync to desktop view
        this.updateTotalsCard();
        this.renderActiveInvoicePreview();
        StorageService.saveActiveDraft(this.currentInvoice);
      });
    });

    // Mobile Quantity Steppers (+ and -)
    container.querySelectorAll('.btn-mob-qty-minus').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.index, 10);
        const cur = this.currentInvoice.items[idx].quantity;
        if (cur > 1) {
          this.currentInvoice.items[idx].quantity = Math.max(1, cur - 1);
          this.renderAllItemsViews();
          this.updateTotalsCard();
          this.renderActiveInvoicePreview();
          StorageService.saveActiveDraft(this.currentInvoice);
        }
      });
    });

    container.querySelectorAll('.btn-mob-qty-plus').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.index, 10);
        this.currentInvoice.items[idx].quantity += 1;
        this.renderAllItemsViews();
        this.updateTotalsCard();
        this.renderActiveInvoicePreview();
        StorageService.saveActiveDraft(this.currentInvoice);
      });
    });

    // Mobile delete button
    container.querySelectorAll('.btn-del-mob-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.index, 10);
        this.currentInvoice.items.splice(idx, 1);
        this.renderAllItemsViews();
        this.updateTotalsCard();
        this.renderActiveInvoicePreview();
        StorageService.saveActiveDraft(this.currentInvoice);
      });
    });
  }

  updateTotalsCard() {
    const curr = this.settings.currency || '₹';
    const subtotalEl = document.getElementById('summary-subtotal');
    const grandTotalEl = document.getElementById('summary-grand-total');
    const wordsEl = document.getElementById('summary-words');

    if (subtotalEl) subtotalEl.textContent = formatCurrency(this.currentInvoice.subtotal, curr);
    if (grandTotalEl) grandTotalEl.textContent = formatCurrency(this.currentInvoice.grandTotal, curr);
    if (wordsEl) wordsEl.textContent = numberToWords(this.currentInvoice.grandTotal);
  }

  refreshQR() {
    if (this.settings.upiId) {
      const upiUri = buildUPIString({
        upiId: this.settings.upiId,
        brandName: this.settings.brandName,
        amount: this.currentInvoice.grandTotal,
        invoiceNumber: this.currentInvoice.invoiceNumber
      });
      this.qrDataUrl = generateQRCodeURL(upiUri, 3);
    } else {
      this.qrDataUrl = '';
    }
  }

  renderActiveInvoicePreview() {
    const container = document.getElementById('invoice-render-target');
    if (!container) return;

    const html = renderInvoice(
      this.activeTemplate,
      this.currentInvoice,
      this.settings,
      this.qrDataUrl
    );
    container.innerHTML = html;
  }

  saveCurrentInvoiceToHistory() {
    this.syncFormToInvoice();

    if (!this.currentInvoice.invoiceNumber) {
      this.showToast('Please enter an Invoice / Bill number', 'warning');
      return;
    }

    if (this.currentInvoice.items.length === 0) {
      this.showToast('Please add at least one item to the bill', 'warning');
      return;
    }

    StorageService.saveInvoice(this.currentInvoice);
    this.invoices = StorageService.getInvoices();
    this.showToast(`Bill #${this.currentInvoice.invoiceNumber} saved!`, 'success');
    this.updateBadges();
  }

  // --- Catalog Modal & Catalog View ---
  bindCatalogEvents() {
    const btnNewProduct = document.getElementById('btn-new-product');
    if (btnNewProduct) {
      btnNewProduct.addEventListener('click', () => {
        this.openProductModal();
      });
    }

    const catalogSearch = document.getElementById('catalog-search');
    if (catalogSearch) {
      catalogSearch.addEventListener('input', (e) => {
        this.renderCatalogView(e.target.value);
      });
    }

    const formProduct = document.getElementById('form-product-edit');
    if (formProduct) {
      formProduct.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveProductFromModal();
      });
    }
  }

  renderCatalogView(searchQuery = '') {
    const container = document.getElementById('products-catalog-grid');
    if (!container) return;

    let items = StorageService.getCatalog();
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.description && p.description.toLowerCase().includes(q)) ||
        (p.category && p.category.toLowerCase().includes(q))
      );
    }

    const curr = this.settings.currency || '₹';

    if (items.length === 0) {
      container.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 2.5rem; background: var(--bg-surface); border-radius: var(--radius-lg); border: 1px dashed var(--border-light);">
          <p style="color: var(--text-muted); font-size: 0.95rem; margin-bottom: 0.85rem;">No products found</p>
          <button class="btn btn-primary" id="btn-empty-add-prod">+ Add First Product</button>
        </div>
      `;
      const emptyAdd = document.getElementById('btn-empty-add-prod');
      if (emptyAdd) emptyAdd.addEventListener('click', () => this.openProductModal());
      return;
    }

    container.innerHTML = items.map(p => `
      <div class="product-card">
        <div>
          <div class="product-card-top">
            <div class="product-card-title">${this.escape(p.name)}</div>
            <span class="product-card-tag">${this.escape(p.category || 'General')}</span>
          </div>
          <div class="product-card-desc">${this.escape(p.description || 'No description')}</div>
        </div>
        <div class="product-card-bottom">
          <div>
            <span class="product-card-price">${formatCurrency(p.unitPrice, curr)}</span>
            <span class="product-card-unit">/${this.escape(p.unit || 'pcs')}</span>
          </div>
          <div style="display: flex; gap: 0.4rem;">
            <button class="btn btn-secondary btn-sm btn-add-prod-to-bill" data-id="${p.id}" title="Add to active bill">
              <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4"/></svg>
              Add
            </button>
            <button class="btn btn-ghost btn-sm btn-icon btn-edit-product" data-id="${p.id}" title="Edit product">
              <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
            </button>
            <button class="btn btn-ghost btn-sm btn-icon btn-delete-product" data-id="${p.id}" title="Delete" style="color: var(--danger);">
              <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button>
          </div>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.btn-add-prod-to-bill').forEach(btn => {
      btn.addEventListener('click', () => {
        const prod = items.find(p => p.id === btn.dataset.id);
        if (prod) {
          this.addProductToBill(prod);
          this.showToast(`Added "${prod.name}" to bill!`, 'success');
        }
      });
    });

    container.querySelectorAll('.btn-edit-product').forEach(btn => {
      btn.addEventListener('click', () => {
        const prod = items.find(p => p.id === btn.dataset.id);
        if (prod) this.openProductModal(prod);
      });
    });

    container.querySelectorAll('.btn-delete-product').forEach(btn => {
      btn.addEventListener('click', () => {
        if (confirm('Delete this product from catalog?')) {
          StorageService.deleteProduct(btn.dataset.id);
          this.renderCatalogView();
          this.showToast('Product deleted', 'info');
        }
      });
    });
  }

  addProductToBill(product) {
    const existing = this.currentInvoice.items.find(it => it.productId === product.id);
    if (existing) {
      existing.quantity += 1;
    } else {
      this.currentInvoice.items.push(new InvoiceItem({
        productId: product.id,
        name: product.name,
        description: product.description,
        unitPrice: product.unitPrice,
        unit: product.unit,
        quantity: 1
      }));
    }

    this.renderAllItemsViews();
    this.syncFormToInvoice();
  }

  openProductModal(product = null) {
    this.editingProductId = product ? product.id : null;
    const modal = document.getElementById('modal-product');
    const title = document.getElementById('modal-product-title');

    title.textContent = product ? 'Edit Product' : 'Add New Product';
    document.getElementById('modal-prod-name').value = product ? product.name : '';
    document.getElementById('modal-prod-category').value = product ? (product.category || 'General') : 'General';
    document.getElementById('modal-prod-desc').value = product ? (product.description || '') : '';
    document.getElementById('modal-prod-price').value = product ? product.unitPrice : '';
    document.getElementById('modal-prod-unit').value = product ? (product.unit || 'pcs') : 'pcs';
    document.getElementById('modal-prod-sku').value = product ? (product.sku || '') : '';

    modal.classList.add('active');
  }

  saveProductFromModal() {
    const name = document.getElementById('modal-prod-name').value.trim();
    const category = document.getElementById('modal-prod-category').value.trim();
    const description = document.getElementById('modal-prod-desc').value.trim();
    const unitPrice = parseFloat(document.getElementById('modal-prod-price').value) || 0;
    const unit = document.getElementById('modal-prod-unit').value.trim() || 'pcs';
    const sku = document.getElementById('modal-prod-sku').value.trim();

    if (!name) {
      this.showToast('Product name is required', 'warning');
      return;
    }

    if (this.editingProductId) {
      const updated = new Product({
        id: this.editingProductId,
        name, category, description, unitPrice, unit, sku
      });
      StorageService.updateProduct(updated);
      this.showToast('Product updated successfully', 'success');
    } else {
      const created = new Product({
        name, category, description, unitPrice, unit, sku
      });
      StorageService.addProduct(created);
      this.showToast('Product added to catalog', 'success');
    }

    this.closeModal('modal-product');
    this.renderCatalogView();
  }

  openCatalogPickerModal() {
    const modal = document.getElementById('modal-catalog-picker');
    const listContainer = document.getElementById('catalog-picker-list');
    const searchInput = document.getElementById('catalog-picker-search');

    const renderPickerItems = (q = '') => {
      let prods = StorageService.getCatalog();
      if (q.trim()) {
        const query = q.toLowerCase();
        prods = prods.filter(p => p.name.toLowerCase().includes(query) || (p.description && p.description.toLowerCase().includes(query)));
      }

      const curr = this.settings.currency || '₹';

      if (prods.length === 0) {
        listContainer.innerHTML = `<div style="text-align:center; padding: 2rem; color: #94a3b8;">No matching products found</div>`;
        return;
      }

      listContainer.innerHTML = prods.map(p => `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 0.5rem; border-bottom: 1px solid var(--border-light); gap: 0.5rem;">
          <div style="flex: 1; min-width: 0;">
            <div style="font-weight: 700; color: var(--text-main); font-size: 0.92rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${this.escape(p.name)}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">${this.escape(p.description || '')}</div>
            <div style="font-size: 0.85rem; font-weight: 700; color: var(--theme-accent, #4f46e5); margin-top: 2px;">
              ${formatCurrency(p.unitPrice, curr)} <small style="color: #94a3b8;">/${this.escape(p.unit || 'pcs')}</small>
            </div>
          </div>
          <button class="btn btn-primary btn-sm btn-pick-item" data-id="${p.id}" style="flex-shrink: 0;">
            + Add
          </button>
        </div>
      `).join('');

      listContainer.querySelectorAll('.btn-pick-item').forEach(btn => {
        btn.addEventListener('click', () => {
          const prod = prods.find(p => p.id === btn.dataset.id);
          if (prod) {
            this.addProductToBill(prod);
            this.showToast(`Added ${prod.name}`, 'success');
            this.closeModal('modal-catalog-picker');
          }
        });
      });
    };

    renderPickerItems('');
    searchInput.value = '';
    searchInput.oninput = (e) => renderPickerItems(e.target.value);

    modal.classList.add('active');
  }

  // --- Invoices History View ---
  bindHistoryEvents() {
    const searchInput = document.getElementById('history-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.renderHistoryView(e.target.value);
      });
    }

    const filterStatus = document.getElementById('history-filter-status');
    if (filterStatus) {
      filterStatus.addEventListener('change', () => {
        this.renderHistoryView(searchInput ? searchInput.value : '');
      });
    }
  }

  renderHistoryView(searchQuery = '') {
    const tableBody = document.getElementById('history-table-body');
    const mobileContainer = document.getElementById('mobile-history-list');
    const filterStatusEl = document.getElementById('history-filter-status');
    const selectedFilter = filterStatusEl ? filterStatusEl.value : 'all';

    let list = StorageService.getInvoices();

    // Stats
    const totalSales = list.reduce((sum, inv) => sum + (inv.status === 'Paid' ? inv.grandTotal : 0), 0);
    const totalInvoices = list.length;
    const pendingAmount = list.reduce((sum, inv) => sum + (inv.status === 'Due' ? inv.grandTotal : 0), 0);

    const curr = this.settings.currency || '₹';
    document.getElementById('stat-total-sales').textContent = formatCurrency(totalSales, curr);
    document.getElementById('stat-total-count').textContent = totalInvoices;
    document.getElementById('stat-pending-amount').textContent = formatCurrency(pendingAmount, curr);

    if (selectedFilter !== 'all') {
      list = list.filter(inv => inv.status.toLowerCase() === selectedFilter.toLowerCase());
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(inv =>
        (inv.invoiceNumber && inv.invoiceNumber.toLowerCase().includes(q)) ||
        (inv.customer.name && inv.customer.name.toLowerCase().includes(q)) ||
        (inv.customer.phone && inv.customer.phone.toLowerCase().includes(q))
      );
    }

    // Render Desktop Table
    if (tableBody) {
      if (list.length === 0) {
        tableBody.innerHTML = `
          <tr>
            <td colspan="7" style="text-align: center; padding: 2.5rem; color: #94a3b8;">
              No bills found in records.
            </td>
          </tr>
        `;
      } else {
        tableBody.innerHTML = list.map(inv => `
          <tr>
            <td style="font-weight: 700; color: #0f172a;">${this.escape(inv.invoiceNumber)}</td>
            <td style="font-size: 0.85rem; color: #475569;">${this.escape(inv.date)}</td>
            <td>
              <div style="font-weight: 600;">${this.escape(inv.customer.name || 'Walk-in Customer')}</div>
              ${inv.customer.phone ? `<small style="color: #64748b;">${this.escape(inv.customer.phone)}</small>` : ''}
            </td>
            <td style="text-align: center;">${inv.items.length} items (${inv.totalItemsCount})</td>
            <td style="font-weight: 800; color: #0f172a;">${formatCurrency(inv.grandTotal, curr)}</td>
            <td>
              <span class="badge ${inv.status === 'Paid' ? 'badge-paid' : 'badge-unpaid'}">${this.escape(inv.status)}</span>
            </td>
            <td style="text-align: right;">
              <div style="display: flex; gap: 0.4rem; justify-content: flex-end;">
                <button class="btn btn-secondary btn-sm btn-open-inv" data-id="${inv.id}" title="Open / Edit">
                  Open
                </button>
                <button class="btn btn-ghost btn-sm btn-icon btn-dup-inv" data-id="${inv.id}" title="Duplicate">
                  <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                </button>
                <button class="btn btn-ghost btn-sm btn-icon btn-del-inv" data-id="${inv.id}" title="Delete" style="color: var(--danger);">
                  <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                </button>
              </div>
            </td>
          </tr>
        `).join('');
      }
    }

    // Render Mobile Cards
    if (mobileContainer) {
      if (list.length === 0) {
        mobileContainer.innerHTML = `
          <div style="text-align: center; padding: 2rem; color: #94a3b8;">No bills found</div>
        `;
      } else {
        mobileContainer.innerHTML = list.map(inv => `
          <div class="history-bill-card">
            <div class="history-bill-card-top">
              <span class="history-bill-number">${this.escape(inv.invoiceNumber)}</span>
              <span class="badge ${inv.status === 'Paid' ? 'badge-paid' : 'badge-unpaid'}">${this.escape(inv.status)}</span>
            </div>
            <div class="history-bill-customer">${this.escape(inv.customer.name || 'Walk-in Customer')}</div>
            <div style="font-size: 0.8rem; color: var(--text-muted);">${this.escape(inv.date)} &bull; ${inv.items.length} items</div>
            
            <div class="history-bill-details-row">
              <span style="font-size: 0.82rem; color: var(--text-muted);">Grand Total</span>
              <span class="history-bill-amount">${formatCurrency(inv.grandTotal, curr)}</span>
            </div>

            <div class="history-bill-actions">
              <button class="btn btn-primary btn-sm btn-open-inv" data-id="${inv.id}" style="flex: 1;">
                Open Bill
              </button>
              <button class="btn btn-secondary btn-sm btn-dup-inv" data-id="${inv.id}">
                Duplicate
              </button>
              <button class="btn btn-ghost btn-sm btn-icon btn-del-inv" data-id="${inv.id}" style="color: var(--danger);">
                <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
              </button>
            </div>
          </div>
        `).join('');
      }
    }

    // Attach Action Handlers (Both Table and Cards)
    document.querySelectorAll('.btn-open-inv').forEach(btn => {
      btn.addEventListener('click', () => {
        const inv = StorageService.getInvoiceById(btn.dataset.id);
        if (inv) {
          this.currentInvoice = new Invoice(inv);
          this.activeTemplate = this.currentInvoice.template || this.settings.defaultTemplate;
          this.switchView('builder');
          this.switchMobileTab('preview');
          this.renderBuilderForm();
          this.renderActiveInvoicePreview();
          this.showToast(`Opened Bill #${inv.invoiceNumber}`, 'info');
        }
      });
    });

    document.querySelectorAll('.btn-dup-inv').forEach(btn => {
      btn.addEventListener('click', () => {
        const inv = StorageService.getInvoiceById(btn.dataset.id);
        if (inv) {
          const nextNum = StorageService.getNextInvoiceNumber();
          const dup = new Invoice({
            ...inv,
            id: 'inv_' + Date.now(),
            invoiceNumber: nextNum,
            date: new Date().toISOString().split('T')[0],
            status: 'Paid'
          });
          this.currentInvoice = dup;
          this.switchView('builder');
          this.switchMobileTab('editor');
          this.renderBuilderForm();
          this.renderActiveInvoicePreview();
          this.showToast(`Duplicated into new Bill #${nextNum}`, 'success');
        }
      });
    });

    document.querySelectorAll('.btn-del-inv').forEach(btn => {
      btn.addEventListener('click', () => {
        if (confirm('Delete this invoice permanently from records?')) {
          StorageService.deleteInvoice(btn.dataset.id);
          this.renderHistoryView();
          this.updateBadges();
          this.showToast('Bill deleted from records', 'info');
        }
      });
    });
  }

  // --- Settings View ---
  bindSettingsEvents() {
    const formSettings = document.getElementById('form-settings');
    if (formSettings) {
      formSettings.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveSettingsFromForm();
      });
    }

    const swatches = document.querySelectorAll('.color-swatch');
    swatches.forEach(sw => {
      sw.addEventListener('click', () => {
        swatches.forEach(s => s.classList.remove('active'));
        sw.classList.add('active');
        const accent = sw.dataset.color;
        this.settings.themeAccent = accent;
        this.applyThemeAccent(accent);
      });
    });

    const templateCards = document.querySelectorAll('.template-card-choice');
    templateCards.forEach(card => {
      card.addEventListener('click', () => {
        templateCards.forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        this.settings.defaultTemplate = card.dataset.template;
      });
    });

    const qrUploadInput = document.getElementById('settings-qr-upload');
    if (qrUploadInput) {
      qrUploadInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (re) => {
            this.settings.qrCustomImage = re.target.result;
            const previewBox = document.getElementById('settings-qr-preview');
            if (previewBox) {
              previewBox.innerHTML = `<img src="${re.target.result}" alt="Custom QR" style="width: 100%; height: 100%; object-fit: contain;" />`;
            }
          };
          reader.readAsDataURL(file);
        }
      });
    }

    const btnClearQR = document.getElementById('btn-clear-custom-qr');
    if (btnClearQR) {
      btnClearQR.addEventListener('click', () => {
        this.settings.qrCustomImage = '';
        const previewBox = document.getElementById('settings-qr-preview');
        if (previewBox) previewBox.innerHTML = '<span style="font-size: 0.75rem; color: #94a3b8;">Auto-generated UPI QR</span>';
        this.showToast('Custom QR cleared. Default UPI QR will be used.', 'info');
      });
    }

    const btnExportJSON = document.getElementById('btn-export-backup');
    if (btnExportJSON) {
      btnExportJSON.addEventListener('click', () => {
        const json = StorageService.exportBackupJSON();
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `billcraft_backup_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        this.showToast('Backup JSON downloaded!', 'success');
      });
    }

    const fileImportJSON = document.getElementById('input-import-backup');
    if (fileImportJSON) {
      fileImportJSON.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (re) => {
            try {
              StorageService.importBackupJSON(re.target.result);
              this.settings = StorageService.getSettings();
              this.catalog = StorageService.getCatalog();
              this.invoices = StorageService.getInvoices();
              this.init();
              this.showToast('Backup restored successfully!', 'success');
            } catch (err) {
              this.showToast('Failed to import backup: Invalid JSON', 'danger');
            }
          };
          reader.readAsText(file);
        }
      });
    }
  }

  renderSettingsView() {
    document.getElementById('settings-seller-name').value = this.settings.sellerName || '';
    document.getElementById('settings-brand-name').value = this.settings.brandName || '';
    document.getElementById('settings-tagline').value = this.settings.tagline || '';
    document.getElementById('settings-phone').value = this.settings.phone || '';
    document.getElementById('settings-email').value = this.settings.email || '';
    document.getElementById('settings-address').value = this.settings.address || '';
    document.getElementById('settings-currency').value = this.settings.currency || '₹';
    document.getElementById('settings-upi').value = this.settings.upiId || '';
    document.getElementById('settings-payment-note').value = this.settings.paymentNotes || '';
    document.getElementById('settings-default-notes').value = this.settings.defaultNotes || '';

    document.querySelectorAll('.color-swatch').forEach(sw => {
      sw.classList.toggle('active', sw.dataset.color === this.settings.themeAccent);
    });

    document.querySelectorAll('.template-card-choice').forEach(card => {
      card.classList.toggle('selected', card.dataset.template === (this.settings.defaultTemplate || 'modern'));
    });

    const previewBox = document.getElementById('settings-qr-preview');
    if (previewBox) {
      if (this.settings.qrCustomImage) {
        previewBox.innerHTML = `<img src="${this.settings.qrCustomImage}" alt="Custom QR" style="width: 100%; height: 100%; object-fit: contain;" />`;
      } else if (this.settings.upiId) {
        const upiUri = buildUPIString({
          upiId: this.settings.upiId,
          brandName: this.settings.brandName,
          amount: 0,
          invoiceNumber: ''
        });
        const url = generateQRCodeURL(upiUri, 3);
        previewBox.innerHTML = url ? `<img src="${url}" alt="UPI QR" style="width: 100%; height: 100%; object-fit: contain;" />` : '<span style="font-size: 0.75rem; color: #94a3b8;">Enter UPI ID</span>';
      } else {
        previewBox.innerHTML = '<span style="font-size: 0.75rem; color: #94a3b8;">No QR set</span>';
      }
    }
  }

  saveSettingsFromForm() {
    this.settings.sellerName = document.getElementById('settings-seller-name').value.trim();
    this.settings.brandName = document.getElementById('settings-brand-name').value.trim();
    this.settings.tagline = document.getElementById('settings-tagline').value.trim();
    this.settings.phone = document.getElementById('settings-phone').value.trim();
    this.settings.email = document.getElementById('settings-email').value.trim();
    this.settings.address = document.getElementById('settings-address').value.trim();
    this.settings.currency = document.getElementById('settings-currency').value.trim() || '₹';
    this.settings.upiId = document.getElementById('settings-upi').value.trim();
    this.settings.paymentNotes = document.getElementById('settings-payment-note').value.trim();
    this.settings.defaultNotes = document.getElementById('settings-default-notes').value.trim();

    StorageService.saveSettings(this.settings);
    this.updateSidebarBrand();
    this.refreshQR();
    this.renderActiveInvoicePreview();
    this.showToast('Settings saved successfully!', 'success');
  }

  bindModalEvents() {
    document.querySelectorAll('.btn-close-modal').forEach(btn => {
      btn.addEventListener('click', () => {
        const modal = btn.closest('.modal-overlay');
        if (modal) modal.classList.remove('active');
      });
    });

    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.classList.remove('active');
      });
    });
  }

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
  }

  updateBadges() {
    const badge = document.getElementById('nav-history-badge');
    if (badge) {
      badge.textContent = StorageService.getInvoices().length;
    }
  }

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${this.escape(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.transition = 'all 200ms ease';
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px) scale(0.95)';
      setTimeout(() => toast.remove(), 220);
    }, 3000);
  }

  escape(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  renderActiveView() {
    this.switchView('builder');
    this.updateBadges();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.app = new BillCraftApp();
});
