/**
 * BillCraft - Main Application Controller
 * Mobile-first: a two-step bill on phones (Items, Send), a split-screen editor on larger screens.
 */

import { Product, Invoice, InvoiceItem, formatCurrency } from './models.js';
import {
  addProductLine, customerKey, isMeasuredUnit, presetsFor, rankProducts,
  recentCustomers, roundQty, setLineQuantity, stepQuantity
} from './quickBill.js';
import { StorageService } from './storage.js';
import { renderInvoice } from './templates.js';
import { generateQRCodeURL, buildUPIString } from './qrHelper.js';
import { ExporterService } from './exporter.js';
import { DEFAULT_LANGUAGE, availableLanguages, getLanguage } from './i18n/languages.js';
import { applyTranslations, createTranslator, loadLocale, setDocumentLanguage, statusLabel } from './i18n/i18n.js';
import { canListen, canSpeak, listenOnce, normalizeSpokenNumber, speak } from './voice.js';

const DESKTOP_QUERY = window.matchMedia('(min-width: 1024px)');
const COARSE_POINTER = window.matchMedia('(pointer: coarse)');
const STEP_COUNT = 2;

// A steady colour and initial per product, so a tile can be found without reading it
const tileHue = name => [...String(name)].reduce((hash, char) => (hash * 31 + char.codePointAt(0)) % 360, 7);
const initialOf = name => (Array.from(String(name).trim())[0] || '?').toUpperCase();

const MIC_ICON = '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4"/></svg>';
const SPEAK_ICON = '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 010 7.07M19.07 4.93a10 10 0 010 14.14"/></svg>';
const TRASH_ICON = '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>';

class BillCraftApp {
  constructor() {
    this.settings = StorageService.getSettings();
    // A draft that was already saved (and not changed since) gives way to a fresh bill
    const draft = StorageService.getActiveDraft();
    this.currentInvoice = draft && !this.isSaved(draft) ? draft : this.createNewInvoice();
    this.activeTemplate = this.currentInvoice.template || this.settings.defaultTemplate || 'modern';
    this.currentView = 'builder';
    this.step = 1;
    this.qrDataUrl = '';
    this.qrKey = '';
    this.previewFrame = 0;
    this.editingProductId = null;
    this.expandedItemIds = new Set();
    this.customerMode = null; // 'new' while a new customer is being typed
    this.searchQuery = '';
    this.qtyTarget = null; // what the quantity sheet is for
    this.refreshHistoryData();

    // Replaced by loadTranslators() before anything is rendered
    this.ui = createTranslator();
    this.bill = this.ui;
  }

  async start() {
    await this.loadTranslators();
    this.bindNavigation();
    this.bindBuilderEvents();
    this.bindCatalogEvents();
    this.bindHistoryEvents();
    this.bindSettingsEvents();
    this.bindModalEvents();
    this.bindLanguageEvents();
    this.bindVoiceEvents();
    this.bindMoreOptions();
    this.populateLanguageSelects();
    this.setupSpeechButtons();
    this.decorateVoiceFields(document);
    this.refreshAll();
    if (!this.settings.appLanguage) this.openLanguagePicker(true);
    // Wide screens show the export buttons from the start, so load their libraries once idle
    if (DESKTOP_QUERY.matches) setTimeout(() => ExporterService.preload(), 1500);
  }

  populateLanguageSelects() {
    const labelFor = language => (language.nativeName === language.name
      ? language.name
      : `${language.nativeName} (${language.name})`);
    const options = availableLanguages()
      .map(language => `<option value="${language.code}">${this.escape(labelFor(language))}</option>`)
      .join('');

    document.getElementById('settings-app-language').innerHTML = options;
    document.getElementById('settings-bill-language').innerHTML =
      `<option value="" data-i18n="settings.billLanguageSame">Same as app language</option>${options}`;
  }

  // --- Translation ---
  async loadTranslators() {
    const appCode = this.settings.appLanguage || DEFAULT_LANGUAGE;
    this.ui = createTranslator(await loadLocale(appCode));
    this.bill = createTranslator(await loadLocale(this.settings.billLanguage || appCode));
    setDocumentLanguage(appCode);
  }

  async applyLanguageChange() {
    await this.loadTranslators();
    this.refreshAll();
  }

  t(key, params) {
    return this.ui.t(key, params);
  }

  speechTag() {
    return getLanguage(this.settings.appLanguage)?.speech || 'en-IN';
  }

  // --- Language picker ---
  bindLanguageEvents() {
    document.getElementById('btn-change-language').addEventListener('click', () => this.openLanguagePicker(false));
  }

  openLanguagePicker(firstRun) {
    const grid = document.getElementById('lang-grid');
    grid.innerHTML = availableLanguages().map(language => `
      <button type="button" class="lang-option${language.code === this.settings.appLanguage ? ' active' : ''}" data-lang="${language.code}" lang="${language.code}">
        <span class="lang-native">${this.escape(language.nativeName)}</span>
        <span class="lang-english">${this.escape(language.name)}</span>
      </button>
    `).join('');

    grid.querySelectorAll('.lang-option').forEach(btn => {
      btn.addEventListener('click', () => this.chooseAppLanguage(btn.dataset.lang));
    });

    // On the first visit the language must be chosen, so there is no close button
    document.getElementById('btn-close-language').hidden = firstRun;
    this.openModal('modal-language');
  }

  async chooseAppLanguage(code) {
    this.settings.appLanguage = code;
    StorageService.saveSettings(this.settings);
    await this.applyLanguageChange();
    this.closeModal('modal-language');
    this.showToast(this.t('toast.languageChanged'), 'success');
  }

  // --- Theme & Brand ---
  applyThemeAccent(accent) {
    document.documentElement.setAttribute('data-accent', accent || 'emerald');
  }

  updateSidebarBrand() {
    const brandNameEl = document.getElementById('sidebar-brand-name');
    const brandAvatarEl = document.getElementById('sidebar-brand-avatar');
    if (brandNameEl) brandNameEl.textContent = this.settings.brandName || this.t('app.name');
    if (brandAvatarEl) {
      const initial = (this.settings.brandName || 'B').trim().charAt(0).toUpperCase();
      brandAvatarEl.textContent = initial;
    }
  }

  // --- Navigation ---
  bindNavigation() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => this.switchView(btn.dataset.view));
    });

    document.querySelectorAll('[data-step-go]').forEach(btn => {
      btn.addEventListener('click', () => this.setStep(Number(btn.dataset.stepGo)));
    });

    // Widening to the desktop layout shows the preview beside the editor
    DESKTOP_QUERY.addEventListener('change', () => this.schedulePreview());

    document.getElementById('btn-step-back').addEventListener('click', () => this.setStep(this.step - 1));
    document.getElementById('btn-step-next').addEventListener('click', () => this.setStep(this.step + 1));
  }

  switchView(viewName) {
    this.showView(viewName);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  showView(viewName) {
    this.currentView = viewName;

    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === viewName);
    });

    document.querySelectorAll('.view-section').forEach(section => {
      section.classList.toggle('active', section.id === `view-${viewName}`);
    });

    const titleEl = document.getElementById('topbar-page-title');
    if (titleEl) titleEl.textContent = this.t(`title.${viewName}`);

    if (viewName === 'catalog') this.renderCatalogView();
    if (viewName === 'history') this.renderHistoryView();
    if (viewName === 'settings') this.renderSettingsView();
    if (viewName === 'builder') this.renderBuilderForm();
  }

  /**
   * Phone flow: 1 Items, 2 Send (customer, preview and sharing).
   * On desktop the CSS shows every panel at once and ignores the step.
   */
  setStep(step) {
    const previous = this.step;
    this.step = Math.min(STEP_COUNT, Math.max(1, step));

    const layout = document.getElementById('bill-layout');
    layout.classList.remove(...Array.from({ length: STEP_COUNT }, (_, i) => `step-${i + 1}`));
    layout.classList.add(`step-${this.step}`);

    document.querySelectorAll('[data-step-go]').forEach(btn => {
      const active = Number(btn.dataset.stepGo) === this.step;
      btn.classList.toggle('active', active);
      if (active) {
        btn.setAttribute('aria-current', 'step');
      } else {
        btn.removeAttribute('aria-current');
      }
    });

    document.querySelector('.step-bar').style.setProperty('--step-index', this.step - 1);

    // The phone bar shows only this step's controls
    document.querySelectorAll('[data-bar-step]').forEach(el => {
      el.hidden = Number(el.dataset.barStep) !== this.step;
    });

    if (this.step !== previous && !DESKTOP_QUERY.matches) window.scrollTo({ top: 0, behavior: 'instant' });

    if (this.step === STEP_COUNT) {
      this.renderCustomerChips();
      this.renderActiveInvoicePreview();
      ExporterService.preload();
    }
  }

  refreshAll() {
    applyTranslations(this.ui.t);
    this.updateSidebarBrand();
    this.applyThemeAccent(this.settings.themeAccent);
    this.showView(this.currentView);
    this.schedulePreview();
    this.updateBadges();
    this.setStep(this.step);
    this.decorateVoiceFields(document);
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
      items: []
    });
  }

  /** True when history holds this exact bill, so nothing is lost by leaving it */
  isSaved(invoice) {
    const saved = StorageService.getInvoiceById(invoice.id);
    return Boolean(saved) && JSON.stringify(saved) === JSON.stringify(invoice);
  }

  /** Starts an empty bill at once. If the old bill had unsaved items, the toast offers Undo. */
  startNewBill() {
    const previous = this.currentInvoice;
    const unsaved = previous.items.length > 0 && !this.isSaved(previous);
    this.openBill(this.createNewInvoice(), 1);
    this.showToast(this.t('toast.newBill'), 'info', unsaved
      ? { label: this.t('common.undo'), onClick: () => this.openBill(previous, 1) }
      : null);
  }

  /** Makes `invoice` the bill being edited and shows it at `step` */
  openBill(invoice, step) {
    this.currentInvoice = invoice;
    this.activeTemplate = invoice.template || this.settings.defaultTemplate || 'modern';
    this.expandedItemIds.clear();
    this.customerMode = null;
    StorageService.saveActiveDraft(invoice);
    this.switchView('builder');
    this.setStep(step);
  }

  /** The preview is drawn only where it can be seen: the last step, or beside the editor on wide screens */
  previewVisible() {
    return DESKTOP_QUERY.matches || this.step === STEP_COUNT;
  }

  /** Redraws the preview at most once per frame, and only when it can be seen */
  schedulePreview() {
    if (this.previewFrame) return;
    this.previewFrame = requestAnimationFrame(() => {
      this.previewFrame = 0;
      if (this.previewVisible()) this.renderActiveInvoicePreview();
    });
  }

  /** Draws the preview now, before it is printed or exported */
  flushPreview() {
    cancelAnimationFrame(this.previewFrame);
    this.previewFrame = 0;
    this.renderActiveInvoicePreview();
  }

  bindBuilderEvents() {
    document.getElementById('btn-new-bill').addEventListener('click', () => this.startNewBill());

    document.querySelectorAll('.btn-save-bill').forEach(btn => {
      btn.addEventListener('click', () => {
        if (this.saveBill()) this.afterSave();
      });
    });

    const inputs = [
      'inv-number', 'inv-date',
      'cust-name', 'cust-phone', 'cust-address', 'cust-notes',
      'inv-shipping', 'inv-discount', 'inv-footer-notes'
    ];
    inputs.forEach(id => {
      document.getElementById(id).addEventListener('input', () => this.syncFormToInvoice());
    });

    const search = document.getElementById('product-search');
    search.addEventListener('input', () => {
      this.searchQuery = search.value;
      this.renderProductGrid();
    });
    // With a keyboard, Enter adds the first product that matches
    search.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      const first = document.querySelector('#product-grid [data-product-id]');
      if (first) this.tapProduct(first.dataset.productId, first);
    });

    document.getElementById('product-grid').addEventListener('click', (event) => {
      const tile = event.target.closest('.product-tile');
      if (!tile) return;
      if (tile.hasAttribute('data-other-item')) this.addOtherItem();
      else this.tapProduct(tile.dataset.productId, tile);
    });

    const lines = document.getElementById('mobile-items-list');
    lines.addEventListener('click', (event) => {
      const button = event.target.closest('[data-action]');
      if (button) this.onLineAction(button.closest('.bill-line'), button.dataset.action);
    });
    lines.addEventListener('input', (event) => {
      if (event.target.dataset.field) this.onLineInput(event.target);
    });
    // "toggle" does not bubble, so it is caught on the way down
    lines.addEventListener('toggle', (event) => {
      const row = event.target.closest('.bill-line');
      if (!row) return;
      if (event.target.open) {
        this.expandedItemIds.add(row.dataset.itemId);
      } else {
        this.expandedItemIds.delete(row.dataset.itemId);
      }
    }, true);

    document.getElementById('qty-presets').addEventListener('click', (event) => {
      const preset = event.target.closest('[data-qty]');
      if (preset) this.applyQty(preset.dataset.qty);
    });
    document.getElementById('qty-input').addEventListener('input', () => this.updateQtyPreview());
    document.getElementById('form-qty').addEventListener('submit', (event) => {
      event.preventDefault();
      this.applyQty(document.getElementById('qty-input').value);
    });

    document.getElementById('preview-template-select').addEventListener('change', (e) => {
      this.activeTemplate = e.target.value;
      this.currentInvoice.template = this.activeTemplate;
      StorageService.saveActiveDraft(this.currentInvoice);
      this.renderActiveInvoicePreview();
    });

    // Every way out of the app saves the bill to history first
    document.getElementById('btn-export-pdf').addEventListener('click', async () => {
      if (!this.saveBill()) return;
      this.flushPreview();
      this.showToast(this.t('toast.pdfPreparing'), 'info');
      await ExporterService.exportPDF('active-invoice-doc', `${this.currentInvoice.invoiceNumber || 'bill'}.pdf`);
      this.afterSave(this.t('toast.pdfReady'));
    });

    document.getElementById('btn-export-image').addEventListener('click', async () => {
      if (!this.saveBill()) return;
      this.flushPreview();
      this.showToast(this.t('toast.imagePreparing'), 'info');
      await ExporterService.exportImage('active-invoice-doc', `${this.currentInvoice.invoiceNumber || 'bill'}.png`);
      this.afterSave(this.t('toast.imageReady'));
    });

    document.getElementById('btn-share-whatsapp').addEventListener('click', () => this.sendWhatsApp());
    document.getElementById('btn-send-whatsapp').addEventListener('click', () => this.sendWhatsApp());

    document.getElementById('btn-print-bill').addEventListener('click', () => {
      if (!this.saveBill()) return;
      this.flushPreview();
      ExporterService.triggerPrint();
      this.afterSave();
    });

    document.getElementById('customer-chips').addEventListener('click', (event) => {
      const chip = event.target.closest('[data-chip]');
      if (chip) this.chooseCustomer(chip.dataset.chip);
    });

    document.getElementById('status-toggle').addEventListener('click', (event) => {
      const option = event.target.closest('[data-status]');
      if (!option) return;
      this.currentInvoice.status = option.dataset.status;
      this.renderStatusToggle();
      this.schedulePreview();
      StorageService.saveActiveDraft(this.currentInvoice);
    });

    document.querySelectorAll('.btn-speak').forEach(btn => {
      btn.addEventListener('click', () => this.speakTotal());
    });
  }

  syncFormToInvoice() {
    this.currentInvoice.invoiceNumber = document.getElementById('inv-number').value || '';
    this.currentInvoice.date = document.getElementById('inv-date').value || '';

    this.currentInvoice.customer = {
      name: document.getElementById('cust-name').value || '',
      phone: document.getElementById('cust-phone').value || '',
      address: document.getElementById('cust-address').value || '',
      note: document.getElementById('cust-notes').value || ''
    };

    this.currentInvoice.shippingFee = parseFloat(document.getElementById('inv-shipping').value) || 0;
    this.currentInvoice.billDiscount = parseFloat(document.getElementById('inv-discount').value) || 0;
    this.currentInvoice.notes = document.getElementById('inv-footer-notes').value || '';

    this.updateTotalsCard();
    this.schedulePreview();

    StorageService.saveActiveDraft(this.currentInvoice);
  }

  renderBuilderForm() {
    document.getElementById('inv-number').value = this.currentInvoice.invoiceNumber || '';
    document.getElementById('inv-date').value = this.currentInvoice.date || '';

    document.getElementById('cust-name').value = this.currentInvoice.customer.name || '';
    document.getElementById('cust-phone').value = this.currentInvoice.customer.phone || '';
    document.getElementById('cust-address').value = this.currentInvoice.customer.address || '';
    document.getElementById('cust-notes').value = this.currentInvoice.customer.note || '';

    document.getElementById('inv-shipping').value = this.currentInvoice.shippingFee || '';
    document.getElementById('inv-discount').value = this.currentInvoice.billDiscount || '';
    document.getElementById('inv-footer-notes').value = this.currentInvoice.notes || '';

    const templateSelect = document.getElementById('preview-template-select');
    templateSelect.value = this.currentInvoice.template || this.settings.defaultTemplate || 'modern';
    this.activeTemplate = templateSelect.value;

    this.renderProductGrid();
    this.renderBillLines({ fresh: true });
    this.updateTotalsCard();
    this.renderStatusToggle();
    this.renderCustomerChips();
    this.schedulePreview();
  }

  // --- Items: product tiles, bill lines and the quantity sheet ---

  /** Product tiles, most used first, filtered by the search box. "+ Other item" comes last. */
  renderProductGrid() {
    const query = this.searchQuery.trim().toLowerCase();
    const products = query
      ? this.rankedProducts.filter(product => [product.name, product.description, product.category]
        .some(text => String(text || '').toLowerCase().includes(query)))
      : this.rankedProducts;
    const curr = this.settings.currency || '₹';

    const tiles = products.map(product => `
      <button type="button" class="product-tile" data-product-id="${this.escape(product.id)}" style="--tile-hue: ${tileHue(product.name)}">
        <span class="tile-initial" aria-hidden="true">${this.escape(initialOf(product.name))}</span>
        <span class="tile-name">${this.escape(product.name)}</span>
        <span class="tile-price">${formatCurrency(product.unitPrice, curr)}<small>/${this.escape(product.unit || 'pcs')}</small></span>
        <span class="tile-badge" hidden></span>
      </button>
    `).join('');
    const noMatch = query && !products.length ? `<p class="tile-none">${this.escape(this.t('grid.noMatch'))}</p>` : '';

    document.getElementById('product-grid').innerHTML = `${noMatch}${tiles}
      <button type="button" class="product-tile product-tile-other" data-other-item>
        <span class="tile-plus" aria-hidden="true">+</span>
        <span class="tile-name">${this.escape(this.t('grid.other'))}</span>
      </button>`;
    this.updateTileBadges();
  }

  /** The count on each tile, from the quantities in the bill */
  updateTileBadges() {
    const quantities = new Map();
    for (const item of this.currentInvoice.items) {
      if (item.productId) quantities.set(item.productId, roundQty((quantities.get(item.productId) || 0) + item.quantity));
    }
    document.querySelectorAll('#product-grid [data-product-id]').forEach(tile => {
      const qty = quantities.get(tile.dataset.productId) || 0;
      const badge = tile.querySelector('.tile-badge');
      const text = qty ? String(qty) : '';
      tile.classList.toggle('in-bill', qty > 0);
      if (badge.textContent === text) return;
      badge.textContent = text;
      badge.hidden = !text;
    });
  }

  /** A tap adds one. Products sold by weight or length ask how much instead. */
  tapProduct(productId, tile) {
    const product = this.rankedProducts.find(p => p.id === productId);
    if (!product) return;
    if (isMeasuredUnit(product.unit)) {
      const line = this.currentInvoice.items.find(item => item.productId === product.id);
      this.openQtySheet({ product, line, tile });
      return;
    }
    addProductLine(this.currentInvoice.items, product, 1);
    this.afterItemsChange();
  }

  /** "+ Other item": an empty line, with its name field ready for typing */
  addOtherItem() {
    const line = new InvoiceItem({ name: '', quantity: 1, unit: 'pcs', unitPrice: 0 });
    this.currentInvoice.items.push(line);
    this.expandedItemIds.add(line.id);
    this.afterItemsChange();
    this.lineRow(line.id)?.querySelector('[data-field="name"]')?.focus();
  }

  /** After any change to the items: lines, tile counts, totals, bar, preview and draft */
  afterItemsChange() {
    this.renderBillLines();
    this.updateTileBadges();
    this.updateTotalsCard();
    this.schedulePreview();
    StorageService.saveActiveDraft(this.currentInvoice);
  }

  lineRow(itemId) {
    return document.querySelector(`#mobile-items-list .bill-line[data-item-id="${CSS.escape(itemId)}"]`);
  }

  /**
   * One line per item. Lines are kept and updated by item id, so typing keeps its
   * focus and only real changes move on screen. `fresh` rebuilds them, for another
   * bill or another language.
   */
  renderBillLines({ fresh = false } = {}) {
    const container = document.getElementById('mobile-items-list');
    if (fresh) container.textContent = '';
    const items = this.currentInvoice.items;
    const ids = new Set(items.map(item => item.id));

    container.querySelectorAll('.bill-line').forEach(row => {
      if (!ids.has(row.dataset.itemId)) row.remove();
    });

    const empty = container.querySelector('.empty-box');
    if (!items.length) {
      if (!empty) container.innerHTML = `<div class="empty-box">${this.escape(this.t('items.emptyHint'))}</div>`;
      return;
    }
    empty?.remove();

    items.forEach(item => {
      let row = this.lineRow(item.id);
      if (!row) {
        row = this.createBillLine(item);
        container.appendChild(row);
      }
      this.updateBillLine(row, item);
    });
    this.decorateVoiceFields(container);
  }

  createBillLine(item) {
    const curr = this.settings.currency || '₹';
    const row = document.createElement('div');
    row.className = 'bill-line';
    row.dataset.itemId = item.id;
    row.innerHTML = `
      <div class="bill-line-top">
        <span class="line-name"></span>
        <span class="line-total"></span>
      </div>
      <div class="bill-line-bottom">
        <div class="line-qty-group">
          <button type="button" class="line-step" data-action="minus" aria-label="${this.escape(this.t('item.decrease'))}">&minus;</button>
          <button type="button" class="line-qty" data-action="qty"></button>
          <button type="button" class="line-step" data-action="plus" aria-label="${this.escape(this.t('item.increase'))}">&#43;</button>
        </div>
        <span class="line-rate"></span>
      </div>
      <details class="item-more"${this.expandedItemIds.has(item.id) ? ' open' : ''}>
        <summary>${this.escape(this.t('item.edit'))}</summary>
        <div class="item-more-body">
          <div class="field-stack field-wide">
            <span class="form-label">${this.escape(this.t('item.namePh'))}</span>
            <input type="text" class="form-control" placeholder="${this.escape(this.t('item.namePh'))}" value="${this.escape(item.name)}" data-field="name" data-voice="text" />
          </div>
          <div class="field-stack">
            <span class="form-label">${this.escape(this.t('item.rate', { currency: curr }))}</span>
            <input type="number" inputmode="decimal" step="any" min="0" class="form-control" value="${item.unitPrice}" data-field="unitPrice" data-voice="number" />
          </div>
          <div class="field-stack">
            <span class="form-label">${this.escape(this.t('item.unit'))}</span>
            <input type="text" class="form-control" placeholder="${this.escape(this.t('item.unitPh'))}" value="${this.escape(item.unit)}" data-field="unit" />
          </div>
          <div class="field-stack">
            <span class="form-label">${this.escape(this.t('item.discPct'))}</span>
            <input type="number" inputmode="decimal" min="0" max="100" class="form-control" placeholder="0" value="${item.discount || ''}" data-field="discount" />
          </div>
          <div class="field-stack field-wide">
            <span class="form-label">${this.escape(this.t('product.desc'))}</span>
            <input type="text" class="form-control" placeholder="${this.escape(this.t('item.descPh'))}" value="${this.escape(item.description)}" data-field="description" />
          </div>
          <div class="line-actions field-wide">
            <button type="button" class="btn btn-secondary btn-sm" data-action="save-product">${this.escape(this.t('item.saveProduct'))}</button>
            <button type="button" class="btn btn-ghost btn-sm line-remove" data-action="remove">${TRASH_ICON}<span>${this.escape(this.t('item.remove'))}</span></button>
          </div>
        </div>
      </details>
    `;
    return row;
  }

  updateBillLine(row, item) {
    const curr = this.settings.currency || '₹';
    const qty = roundQty(item.quantity);
    const name = row.querySelector('.line-name');
    name.textContent = item.name || this.t('item.namePh');
    name.classList.toggle('is-placeholder', !item.name);
    row.querySelector('.line-total').textContent = formatCurrency(item.total, curr);
    const qtyButton = row.querySelector('.line-qty');
    qtyButton.innerHTML = `${qty} <small>${this.escape(item.unit)}</small>`;
    qtyButton.setAttribute('aria-label', `${this.t('item.qty')}: ${qty} ${item.unit}`);
    row.querySelector('.line-rate').textContent = `× ${formatCurrency(item.unitPrice, curr)}`;
    // Only typed items can be saved as products; catalog items already are
    row.querySelector('[data-action="save-product"]').hidden = Boolean(item.productId);
  }

  onLineAction(row, action) {
    const item = row && this.currentInvoice.items.find(line => line.id === row.dataset.itemId);
    if (!item) return;
    if (action === 'qty') {
      this.openQtySheet({ line: item });
      return;
    }
    if (action === 'save-product') {
      this.saveLineAsProduct(item);
      return;
    }
    // Minus below 1 takes the line off the bill
    const qty = action === 'remove' ? 0 : stepQuantity(item.quantity, action === 'plus' ? 1 : -1);
    setLineQuantity(this.currentInvoice.items, item.id, qty);
    this.afterItemsChange();
  }

  /** Typing in a line's Edit fields updates that line, the totals and the preview */
  onLineInput(input) {
    const row = input.closest('.bill-line');
    const item = row && this.currentInvoice.items.find(line => line.id === row.dataset.itemId);
    if (!item) return;
    const field = input.dataset.field;
    item[field] = field === 'unitPrice' || field === 'discount' ? parseFloat(input.value) || 0 : input.value;
    this.updateBillLine(row, item);
    this.updateTotalsCard();
    this.schedulePreview();
    StorageService.saveActiveDraft(this.currentInvoice);
  }

  /** "Save to my products": a typed item becomes a tile for the next bill */
  saveLineAsProduct(item) {
    const name = item.name.trim();
    if (!name) {
      this.showToast(this.t('toast.productNameRequired'), 'warning');
      return;
    }
    const product = new Product({ name, unitPrice: item.unitPrice, unit: item.unit, description: item.description });
    StorageService.addProduct(product);
    item.productId = product.id;
    this.refreshHistoryData();
    this.renderProductGrid();
    this.afterItemsChange();
    this.showToast(this.t('toast.catalogAdded'), 'success');
  }

  /**
   * How much: presets in one tap, or any amount typed or spoken. For a product not on
   * the bill yet it adds a line; for a line it sets the quantity.
   */
  openQtySheet({ product = null, line = null, tile = null }) {
    const source = line || product;
    this.qtyTarget = { product, lineId: line ? line.id : null, tile };
    document.getElementById('qty-title').textContent = source.name || this.t('item.namePh');
    document.getElementById('qty-unit').textContent = source.unit || '';
    document.getElementById('qty-presets').innerHTML = presetsFor(source.unit).map(qty => `
      <button type="button" class="qty-preset" data-qty="${qty}">${qty} <small>${this.escape(source.unit || '')}</small></button>
    `).join('');
    const input = document.getElementById('qty-input');
    input.value = line ? roundQty(line.quantity) : '';
    this.updateQtyPreview();
    this.openModal('modal-qty');
    // On touch screens the keypad would cover the presets, so it opens only when the field is tapped
    if (!COARSE_POINTER.matches) input.focus();
  }

  updateQtyPreview() {
    const { product, lineId } = this.qtyTarget;
    const source = (lineId && this.currentInvoice.items.find(item => item.id === lineId)) || product;
    const output = document.getElementById('qty-line-total');
    const qty = roundQty(document.getElementById('qty-input').value);
    if (!source || !(qty > 0)) {
      output.textContent = '';
      return;
    }
    const curr = this.settings.currency || '₹';
    const total = new InvoiceItem({ ...source, quantity: qty }).total;
    output.textContent = `${qty} ${source.unit || ''} × ${formatCurrency(source.unitPrice, curr)} = ${formatCurrency(total, curr)}`;
  }

  applyQty(value) {
    this.closeModal('modal-qty');
    // An empty field changes nothing
    if (String(value).trim() === '') return;
    const qty = roundQty(value);
    const { product, lineId } = this.qtyTarget;
    if (lineId) {
      setLineQuantity(this.currentInvoice.items, lineId, qty);
    } else if (qty > 0) {
      addProductLine(this.currentInvoice.items, product, qty);
    }
    this.afterItemsChange();
  }

  /** Collapsed "More options" sections are always open on desktop. */
  bindMoreOptions() {
    const openOnDesktop = () => {
      if (!DESKTOP_QUERY.matches) return;
      document.querySelectorAll('details.more-options').forEach(details => {
        details.open = true;
      });
    };
    openOnDesktop();
    DESKTOP_QUERY.addEventListener('change', openOnDesktop);
  }

  updateTotalsCard() {
    const curr = this.settings.currency || '₹';
    document.getElementById('summary-subtotal').textContent = formatCurrency(this.currentInvoice.subtotal, curr);
    document.getElementById('summary-grand-total').textContent = formatCurrency(this.currentInvoice.grandTotal, curr);
    document.getElementById('summary-words').textContent = this.ui.words(this.currentInvoice.grandTotal);
    this.updateBar();
  }

  /** The phone bar: how many items, the running total, and Next once the bill has an item */
  updateBar() {
    const count = this.currentInvoice.items.length;
    document.getElementById('bar-count').textContent = this.t(count === 1 ? 'bar.item' : 'bar.items', { count });
    document.getElementById('bar-total').textContent = formatCurrency(this.currentInvoice.grandTotal, this.settings.currency || '₹');
    document.getElementById('btn-step-next').disabled = count === 0;
  }

  /** Paid, Due or Draft, with the pill behind the chosen one */
  renderStatusToggle() {
    const toggle = document.getElementById('status-toggle');
    const options = [...toggle.querySelectorAll('[data-status]')];
    const index = Math.max(0, options.findIndex(option => option.dataset.status === this.currentInvoice.status));
    options.forEach((option, i) => option.setAttribute('aria-checked', String(i === index)));
    toggle.style.setProperty('--active', index);
  }

  /** Product order and recent customers come from saved bills, so they are refreshed after each save */
  refreshHistoryData() {
    const invoices = StorageService.getInvoices();
    this.recent = recentCustomers(invoices);
    this.rankedProducts = rankProducts(StorageService.getCatalog(), invoices);
  }

  /** Which customer chip matches the bill: 'walkin', 'recent-N', or 'new' for anyone else */
  activeCustomerChip() {
    const { name = '', phone = '' } = this.currentInvoice.customer;
    if (this.customerMode === 'new') return 'new';
    if (!name.trim() && !phone.trim()) return 'walkin';
    const index = this.recent.findIndex(customer => customerKey(customer) === customerKey({ name, phone }));
    return index === -1 ? 'new' : `recent-${index}`;
  }

  /** Walk-in, recent customers, and "+ New", which shows the name and phone fields */
  renderCustomerChips() {
    const active = this.activeCustomerChip();
    const chips = [
      { key: 'walkin', label: this.t('common.walkIn') },
      ...this.recent.map((customer, index) => ({ key: `recent-${index}`, label: customer.name })),
      { key: 'new', label: this.t('customer.new') }
    ];
    document.getElementById('customer-chips').innerHTML = chips.map(chip => `
      <button type="button" class="chip${chip.key === active ? ' active' : ''}" data-chip="${chip.key}" aria-pressed="${chip.key === active}">${this.escape(chip.label)}</button>
    `).join('');
    document.getElementById('customer-fields').hidden = active !== 'new';
  }

  chooseCustomer(key) {
    const note = this.currentInvoice.customer.note || '';
    if (key === 'new') {
      // Tapping "+ New" again keeps what was typed
      if (this.activeCustomerChip() !== 'new') this.setCustomer({ note });
      this.customerMode = 'new';
      this.renderCustomerChips();
      document.getElementById('cust-name').focus();
      return;
    }
    this.customerMode = null;
    this.setCustomer({ ...(key === 'walkin' ? {} : this.recent[Number(key.replace('recent-', ''))]), note });
  }

  /** Puts `customer` on the bill and in the fields */
  setCustomer({ name = '', phone = '', address = '', note = '' }) {
    this.currentInvoice.customer = { name, phone, address, note };
    document.getElementById('cust-name').value = name;
    document.getElementById('cust-phone').value = phone;
    document.getElementById('cust-address').value = address;
    document.getElementById('cust-notes').value = note;
    this.renderCustomerChips();
    this.schedulePreview();
    StorageService.saveActiveDraft(this.currentInvoice);
  }

  refreshQR() {
    const { upiId, brandName } = this.settings;
    const { grandTotal, invoiceNumber } = this.currentInvoice;
    // Only a new payee, amount or bill number needs a new code
    const key = upiId ? [upiId, brandName, grandTotal, invoiceNumber].join('|') : '';
    if (key === this.qrKey) return;
    this.qrKey = key;
    this.qrDataUrl = upiId
      ? generateQRCodeURL(buildUPIString({ upiId, brandName, amount: grandTotal, invoiceNumber }), 3)
      : '';
  }

  renderActiveInvoicePreview() {
    this.refreshQR();
    const container = document.getElementById('invoice-render-target');
    container.innerHTML = renderInvoice(
      this.activeTemplate,
      this.currentInvoice,
      this.settings,
      this.qrDataUrl,
      this.bill
    );
  }

  /**
   * Puts the bill into history before it leaves the app (sent, printed, exported or
   * saved). Saving again updates the same entry. Returns false, with a notice, when
   * the bill cannot be saved yet.
   */
  saveBill() {
    this.syncFormToInvoice();

    if (!this.currentInvoice.invoiceNumber) {
      this.showToast(this.t('toast.needNumber'), 'warning');
      this.setStep(STEP_COUNT);
      const field = document.getElementById('inv-number');
      field.closest('details').open = true;
      field.focus();
      return false;
    }

    if (this.currentInvoice.items.length === 0) {
      this.showToast(this.t('toast.needItem'), 'warning');
      this.setStep(1);
      return false;
    }

    StorageService.saveInvoice(this.currentInvoice);
    this.refreshHistoryData();
    this.customerMode = null;
    this.renderCustomerChips();
    this.updateBadges();
    return true;
  }

  /** The saved notice, with the next bill one tap away */
  afterSave(message = this.t('toast.billSaved', { number: this.currentInvoice.invoiceNumber })) {
    this.showToast(message, 'success', { label: this.t('nav.newBill'), onClick: () => this.startNewBill() });
  }

  /** Saves the bill, then opens WhatsApp with it: straight to the customer's chat when the phone is known */
  sendWhatsApp() {
    if (!this.saveBill()) return;
    ExporterService.shareWhatsApp(this.currentInvoice, this.settings, this.bill);
    this.afterSave();
  }

  // --- Voice ---
  bindVoiceEvents() {
    document.addEventListener('click', (event) => {
      const mic = event.target.closest('.btn-mic');
      if (mic) this.startVoiceInput(mic);
    });
  }

  setupSpeechButtons() {
    const supported = canSpeak();
    document.querySelectorAll('.btn-speak').forEach(btn => {
      btn.hidden = !supported;
    });
  }

  /**
   * Adds a microphone button beside every input marked data-voice. Runs after
   * each render, and skips inputs that already have one.
   */
  decorateVoiceFields(root) {
    if (!canListen()) return;

    root.querySelectorAll('input[data-voice]').forEach(input => {
      const anchor = input.closest('.qty-stepper') || input;
      if (anchor.parentElement.classList.contains('voice-field')) return;

      const wrap = document.createElement('div');
      wrap.className = 'voice-field';
      anchor.parentElement.insertBefore(wrap, anchor);
      wrap.appendChild(anchor);

      const mic = document.createElement('button');
      mic.type = 'button';
      mic.className = 'btn btn-secondary btn-icon btn-mic';
      mic.title = this.t('voice.speak');
      mic.setAttribute('aria-label', this.t('voice.speak'));
      mic.innerHTML = MIC_ICON;
      wrap.appendChild(mic);
    });
  }

  async startVoiceInput(mic) {
    if (!this.settings.voiceConsent) {
      if (!confirm(this.t('voice.consent'))) return;
      this.settings.voiceConsent = true;
      StorageService.saveSettings(this.settings);
    }

    const input = mic.closest('.voice-field').querySelector('[data-voice]');
    const numeric = input.dataset.voice === 'number';
    const idleTitle = this.t('voice.speak');

    mic.classList.add('listening');
    mic.title = this.t('voice.listening');
    try {
      listenOnce(this.speechTag(), {
        onText: (text) => {
          const value = numeric ? normalizeSpokenNumber(text) : text.trim();
          if (!value) {
            this.showToast(this.t('voice.noSpeech'), 'warning');
            return;
          }
          input.value = value;
          input.dispatchEvent(new Event('input', { bubbles: true }));
        },
        onError: (error) => {
          const key = error === 'no-speech' ? 'voice.noSpeech' : 'voice.failed';
          this.showToast(this.t(key), 'warning');
        },
        onEnd: () => {
          mic.classList.remove('listening');
          mic.title = idleTitle;
        }
      });
    } catch (error) {
      mic.classList.remove('listening');
      mic.title = idleTitle;
      this.showToast(this.t('voice.failed'), 'warning');
    }
  }

  speakTotal() {
    const words = this.ui.words(this.currentInvoice.grandTotal);
    speak(this.t('voice.totalSpoken', { words }), this.speechTag());
  }

  // --- Catalog Modal & Catalog View ---
  bindCatalogEvents() {
    document.getElementById('btn-new-product').addEventListener('click', () => {
      this.openProductModal();
    });

    document.getElementById('catalog-search').addEventListener('input', (e) => {
      this.renderCatalogView(e.target.value);
    });

    document.getElementById('form-product-edit').addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveProductFromModal();
    });
  }

  renderCatalogView(searchQuery = '') {
    const container = document.getElementById('products-catalog-grid');

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
        <div class="empty-box empty-box-wide">
          <p>${this.escape(this.t('catalog.empty'))}</p>
          <button class="btn btn-primary" id="btn-empty-add-prod">${this.escape(this.t('catalog.addFirst'))}</button>
        </div>
      `;
      document.getElementById('btn-empty-add-prod').addEventListener('click', () => this.openProductModal());
      return;
    }

    container.innerHTML = items.map(p => `
      <div class="product-card">
        <div>
          <div class="product-card-top">
            <div class="product-card-title">${this.escape(p.name)}</div>
            <span class="product-card-tag">${this.escape(p.category || 'General')}</span>
          </div>
          <div class="product-card-desc">${this.escape(p.description || this.t('catalog.noDesc'))}</div>
        </div>
        <div class="product-card-bottom">
          <div>
            <span class="product-card-price">${formatCurrency(p.unitPrice, curr)}</span>
            <span class="product-card-unit">/${this.escape(p.unit || 'pcs')}</span>
          </div>
          <div class="product-card-actions">
            <button class="btn btn-secondary btn-sm btn-add-prod-to-bill" data-id="${p.id}" title="${this.escape(this.t('catalog.addToBill'))}">
              ${this.t('common.add')}
            </button>
            <button class="btn btn-ghost btn-sm btn-icon btn-edit-product" data-id="${p.id}" title="${this.escape(this.t('catalog.editTitle'))}" aria-label="${this.escape(this.t('catalog.editTitle'))}">
              <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
            </button>
            <button class="btn btn-ghost btn-sm btn-icon btn-delete-product" data-id="${p.id}" title="${this.escape(this.t('catalog.deleteTitle'))}" aria-label="${this.escape(this.t('catalog.deleteTitle'))}" style="color: var(--danger);">
              ${TRASH_ICON}
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
          this.showToast(this.t('toast.productAdded', { name: prod.name }), 'success');
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
        if (confirm(this.t('confirm.deleteProduct'))) {
          StorageService.deleteProduct(btn.dataset.id);
          this.refreshHistoryData();
          this.renderProductGrid();
          this.renderCatalogView();
          this.showToast(this.t('toast.productDeleted'), 'info');
        }
      });
    });
  }

  addProductToBill(product) {
    addProductLine(this.currentInvoice.items, product, 1);
    this.afterItemsChange();
  }

  openProductModal(product = null) {
    this.editingProductId = product ? product.id : null;

    document.getElementById('modal-product-title').textContent = this.t(product ? 'product.editTitle' : 'product.addTitle');
    document.getElementById('modal-prod-name').value = product ? product.name : '';
    document.getElementById('modal-prod-category').value = product ? (product.category || 'General') : 'General';
    document.getElementById('modal-prod-desc').value = product ? (product.description || '') : '';
    document.getElementById('modal-prod-price').value = product ? product.unitPrice : '';
    document.getElementById('modal-prod-unit').value = product ? (product.unit || 'pcs') : 'pcs';
    document.getElementById('modal-prod-sku').value = product ? (product.sku || '') : '';

    this.openModal('modal-product');
  }

  saveProductFromModal() {
    const name = document.getElementById('modal-prod-name').value.trim();
    const category = document.getElementById('modal-prod-category').value.trim();
    const description = document.getElementById('modal-prod-desc').value.trim();
    const unitPrice = parseFloat(document.getElementById('modal-prod-price').value) || 0;
    const unit = document.getElementById('modal-prod-unit').value.trim() || 'pcs';
    const sku = document.getElementById('modal-prod-sku').value.trim();

    if (!name) {
      this.showToast(this.t('toast.productNameRequired'), 'warning');
      return;
    }

    if (this.editingProductId) {
      StorageService.updateProduct(new Product({
        id: this.editingProductId,
        name, category, description, unitPrice, unit, sku
      }));
      this.showToast(this.t('toast.productUpdated'), 'success');
    } else {
      StorageService.addProduct(new Product({
        name, category, description, unitPrice, unit, sku
      }));
      this.showToast(this.t('toast.catalogAdded'), 'success');
    }

    this.closeModal('modal-product');
    this.refreshHistoryData();
    this.renderProductGrid();
    this.renderCatalogView();
  }

  // --- Invoices History View ---
  bindHistoryEvents() {
    const searchInput = document.getElementById('history-search-input');
    searchInput.addEventListener('input', (e) => {
      this.renderHistoryView(e.target.value);
    });

    document.getElementById('history-filter-status').addEventListener('change', () => {
      this.renderHistoryView(searchInput.value);
    });
  }

  renderHistoryView(searchQuery = '') {
    const tableBody = document.getElementById('history-table-body');
    const mobileContainer = document.getElementById('mobile-history-list');
    const selectedFilter = document.getElementById('history-filter-status').value;

    let list = StorageService.getInvoices();

    // Stats
    const totalSales = list.reduce((sum, inv) => sum + (inv.status === 'Paid' ? inv.grandTotal : 0), 0);
    const pendingAmount = list.reduce((sum, inv) => sum + (inv.status === 'Due' ? inv.grandTotal : 0), 0);

    const curr = this.settings.currency || '₹';
    document.getElementById('stat-total-sales').textContent = formatCurrency(totalSales, curr);
    document.getElementById('stat-total-count').textContent = list.length;
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

    const badgeClass = inv => (inv.status === 'Paid' ? 'badge-paid' : 'badge-unpaid');
    const customerName = inv => this.escape(inv.customer.name || this.t('common.walkIn'));

    if (list.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 2.5rem; color: var(--text-muted);">
            ${this.escape(this.t('history.empty'))}
          </td>
        </tr>
      `;
      mobileContainer.innerHTML = `<div class="empty-box">${this.escape(this.t('history.empty'))}</div>`;
    } else {
      tableBody.innerHTML = list.map(inv => `
        <tr>
          <td style="font-weight: 700; color: var(--text-main);">${this.escape(inv.invoiceNumber)}</td>
          <td style="font-size: 0.85rem; color: var(--text-muted);">${this.escape(inv.date)}</td>
          <td>
            <div style="font-weight: 600;">${customerName(inv)}</div>
            ${inv.customer.phone ? `<small style="color: var(--text-muted);">${this.escape(inv.customer.phone)}</small>` : ''}
          </td>
          <td style="text-align: center;">${this.escape(this.t('history.itemsCount', { lines: inv.items.length, qty: inv.totalItemsCount }))}</td>
          <td style="font-weight: 800; color: var(--text-main);">${formatCurrency(inv.grandTotal, curr)}</td>
          <td>
            <span class="badge ${badgeClass(inv)}">${this.escape(statusLabel(this.ui.t, inv.status))}</span>
          </td>
          <td style="text-align: right;">
            <div style="display: flex; gap: 0.4rem; justify-content: flex-end;">
              <button class="btn btn-secondary btn-sm btn-open-inv" data-id="${inv.id}">${this.escape(this.t('history.open'))}</button>
              <button class="btn btn-ghost btn-sm btn-dup-inv" data-id="${inv.id}">${this.escape(this.t('history.repeat'))}</button>
              <button class="btn btn-ghost btn-sm btn-icon btn-del-inv" data-id="${inv.id}" title="${this.escape(this.t('history.delete'))}" aria-label="${this.escape(this.t('history.delete'))}" style="color: var(--danger);">
                ${TRASH_ICON}
              </button>
            </div>
          </td>
        </tr>
      `).join('');

      mobileContainer.innerHTML = list.map(inv => `
        <div class="history-bill-card">
          <div class="history-bill-card-top">
            <span class="history-bill-number">${this.escape(inv.invoiceNumber)}</span>
            <span class="badge ${badgeClass(inv)}">${this.escape(statusLabel(this.ui.t, inv.status))}</span>
          </div>
          <div class="history-bill-customer">${customerName(inv)}</div>
          <div class="history-bill-meta">${this.escape(inv.date)} &bull; ${this.escape(this.t('history.itemsShort', { lines: inv.items.length }))}</div>

          <div class="history-bill-details-row">
            <span class="history-bill-meta">${this.escape(this.t('history.grandTotal'))}</span>
            <span class="history-bill-amount">${formatCurrency(inv.grandTotal, curr)}</span>
          </div>

          <div class="history-bill-actions">
            <button class="btn btn-primary btn-sm btn-open-inv" data-id="${inv.id}" style="flex: 1;">
              ${this.escape(this.t('history.openBill'))}
            </button>
            <button class="btn btn-secondary btn-sm btn-dup-inv" data-id="${inv.id}">
              ${this.escape(this.t('history.repeat'))}
            </button>
            <button class="btn btn-ghost btn-sm btn-icon btn-del-inv" data-id="${inv.id}" title="${this.escape(this.t('history.delete'))}" aria-label="${this.escape(this.t('history.delete'))}" style="color: var(--danger);">
              ${TRASH_ICON}
            </button>
          </div>
        </div>
      `).join('');
    }

    document.querySelectorAll('.btn-open-inv').forEach(btn => {
      btn.addEventListener('click', () => {
        const inv = StorageService.getInvoiceById(btn.dataset.id);
        if (inv) {
          this.openBill(new Invoice(inv), STEP_COUNT);
          this.showToast(this.t('toast.billOpened', { number: inv.invoiceNumber }), 'info');
        }
      });
    });

    document.querySelectorAll('.btn-dup-inv').forEach(btn => {
      btn.addEventListener('click', () => {
        const inv = StorageService.getInvoiceById(btn.dataset.id);
        if (inv) {
          const nextNum = StorageService.getNextInvoiceNumber();
          this.openBill(new Invoice({
            ...inv,
            id: 'inv_' + Date.now(),
            invoiceNumber: nextNum,
            date: new Date().toISOString().split('T')[0],
            status: 'Paid',
            createdAt: new Date().toISOString()
          }), STEP_COUNT);
          this.showToast(this.t('toast.repeated', { number: nextNum }), 'success');
        }
      });
    });

    document.querySelectorAll('.btn-del-inv').forEach(btn => {
      btn.addEventListener('click', () => {
        if (confirm(this.t('confirm.deleteBill'))) {
          StorageService.deleteInvoice(btn.dataset.id);
          this.renderHistoryView(document.getElementById('history-search-input').value);
          this.updateBadges();
          this.showToast(this.t('toast.billDeleted'), 'info');
        }
      });
    });
  }

  // --- Settings View ---
  bindSettingsEvents() {
    document.getElementById('form-settings').addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveSettingsFromForm();
    });

    const swatches = document.querySelectorAll('.color-swatch');
    swatches.forEach(sw => {
      sw.addEventListener('click', () => {
        swatches.forEach(s => s.classList.remove('active'));
        sw.classList.add('active');
        this.settings.themeAccent = sw.dataset.color;
        this.applyThemeAccent(sw.dataset.color);
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

    document.getElementById('settings-qr-upload').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (re) => {
        this.settings.qrCustomImage = re.target.result;
        this.renderSettingsQrPreview();
      };
      reader.readAsDataURL(file);
    });

    document.getElementById('btn-clear-custom-qr').addEventListener('click', () => {
      this.settings.qrCustomImage = '';
      this.renderSettingsQrPreview();
      this.showToast(this.t('toast.qrReset'), 'info');
    });

    document.getElementById('btn-export-backup').addEventListener('click', () => {
      const json = StorageService.exportBackupJSON();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `billcraft_backup_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      this.showToast(this.t('toast.backupDone'), 'success');
    });

    document.getElementById('input-import-backup').addEventListener('change', (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (re) => {
        try {
          StorageService.importBackupJSON(re.target.result);
          this.settings = StorageService.getSettings();
          this.currentInvoice = StorageService.getActiveDraft() || this.createNewInvoice();
          this.refreshHistoryData();
          await this.loadTranslators();
          this.refreshAll();
          this.showToast(this.t('toast.restoreDone'), 'success');
        } catch (err) {
          this.showToast(this.t('toast.restoreFailed'), 'danger');
        }
      };
      reader.readAsText(file);
    });
  }

  renderSettingsQrPreview() {
    const previewBox = document.getElementById('settings-qr-preview');
    if (this.settings.qrCustomImage) {
      previewBox.innerHTML = `<img src="${this.settings.qrCustomImage}" alt="" style="width: 100%; height: 100%; object-fit: contain;" />`;
    } else if (this.settings.upiId) {
      const upiUri = buildUPIString({
        upiId: this.settings.upiId,
        brandName: this.settings.brandName,
        amount: 0,
        invoiceNumber: ''
      });
      const url = generateQRCodeURL(upiUri, 3);
      previewBox.innerHTML = url
        ? `<img src="${url}" alt="" style="width: 100%; height: 100%; object-fit: contain;" />`
        : `<span class="muted-note">${this.escape(this.t('settings.enterUpi'))}</span>`;
    } else {
      previewBox.innerHTML = `<span class="muted-note">${this.escape(this.t('settings.noQr'))}</span>`;
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
    document.getElementById('settings-app-language').value = this.settings.appLanguage || DEFAULT_LANGUAGE;
    document.getElementById('settings-bill-language').value = this.settings.billLanguage || '';

    document.querySelectorAll('.color-swatch').forEach(sw => {
      sw.classList.toggle('active', sw.dataset.color === this.settings.themeAccent);
    });

    document.querySelectorAll('.template-card-choice').forEach(card => {
      card.classList.toggle('selected', card.dataset.template === (this.settings.defaultTemplate || 'modern'));
    });

    this.renderSettingsQrPreview();
  }

  async saveSettingsFromForm() {
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
    this.settings.appLanguage = document.getElementById('settings-app-language').value;
    this.settings.billLanguage = document.getElementById('settings-bill-language').value;

    StorageService.saveSettings(this.settings);
    await this.loadTranslators();
    this.refreshAll();
    this.showToast(this.t('toast.settingsSaved'), 'success');
  }

  // --- Modals ---
  bindModalEvents() {
    document.querySelectorAll('.btn-close-modal').forEach(btn => {
      btn.addEventListener('click', () => {
        const modal = btn.closest('.modal-overlay');
        if (modal) modal.classList.remove('active');
      });
    });

    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        // The language picker can only be dismissed once a language is chosen
        if (e.target === overlay && overlay.id !== 'modal-language') overlay.classList.remove('active');
      });
    });
  }

  openModal(modalId) {
    document.getElementById(modalId).classList.add('active');
  }

  closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
  }

  updateBadges() {
    document.getElementById('nav-history-badge').textContent = StorageService.getInvoices().length;
  }

  /**
   * Shows a short notice. `action` ({ label, onClick }) adds a button and keeps the
   * notice longer. The countdown pauses while the page is hidden (for example while
   * WhatsApp is open), so the button is still there when the user comes back.
   */
  showToast(message, type = 'info', action = null) {
    const container = document.getElementById('toast-container');

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const text = document.createElement('span');
    text.textContent = message;
    toast.appendChild(text);

    let timer = 0;
    let startedAt = 0;
    let remaining = action ? 6000 : 3000;
    let dismissed = false;

    const pause = () => {
      if (!timer) return;
      clearTimeout(timer);
      timer = 0;
      remaining -= Date.now() - startedAt;
    };
    const resume = () => {
      if (timer || dismissed) return;
      startedAt = Date.now();
      timer = setTimeout(dismiss, Math.max(remaining, 1000));
    };
    const onVisibility = () => (document.hidden ? pause() : resume());
    const dismiss = () => {
      if (dismissed) return;
      dismissed = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      toast.style.transition = 'all 200ms ease';
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px) scale(0.95)';
      setTimeout(() => toast.remove(), 220);
    };

    if (action) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'toast-action';
      button.textContent = action.label;
      button.addEventListener('click', () => {
        dismiss();
        action.onClick();
      });
      toast.appendChild(button);
    }

    container.appendChild(toast);
    document.addEventListener('visibilitychange', onVisibility);
    if (!document.hidden) resume();
  }

  escape(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.app = new BillCraftApp();
  window.app.start().catch(error => console.error('BillCraft failed to start', error));
});
