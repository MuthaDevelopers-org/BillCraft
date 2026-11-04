/**
 * BillCraft - Main Application Controller
 * Mobile-first: a two-step bill on phones (Items, Send), a split-screen editor on larger screens.
 */

import { Product, Invoice, InvoiceItem, formatCurrency, formatDate, newId, todayISO } from './models.js';
import {
  addProductLine, customerKey, deliveryPresets, discountPresets, isMeasuredUnit, presetsFor, rankProducts,
  recentCustomers, roundQty, setLineQuantity, stepQuantity
} from './quickBill.js';
import { celebrate, countTo, enter, exit, flyTo, nudge, pop, shrink, slideIn } from './motion.js';
import { StorageService, StorageFullError } from './storage.js';
import { BackupError, MAX_BACKUP_BYTES, invoicesToCSV, parseBackup } from './backup.js';
import { APP_VERSION } from './config.js';
import { escapeHTML, safeImageSrc } from './safe.js';
import { BILL_FORMATS, normalizeShopCode, readBillNumber, shopCode } from './billNumber.js';
import { UNITS, suggestForProduct, unitInfo, unitLabel } from './units.js';
import { ICON_GROUPS, NO_ICON, groupOf, pictureFor } from './icons.js';
import { renderInvoice } from './templates.js';
import { generateQRCodeURL, buildUPIString, isValidUpiId } from './qrHelper.js';
import { ExporterService, fileNameFor } from './exporter.js';
import { DEFAULT_LANGUAGE, availableLanguages, getLanguage } from './i18n/languages.js';
import { applyTranslations, createTranslator, discountLabel, loadLocale, setDocumentLanguage, statusBadgeClass, statusLabel } from './i18n/i18n.js';
import { canListen, canSpeak, listenOnce, normalizeSpokenNumber, speak } from './voice.js';

const DESKTOP_QUERY = window.matchMedia('(min-width: 1024px)');
const isInstalledApp = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isAppleMobile = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const COARSE_POINTER = window.matchMedia('(pointer: coarse)');
const STEP_COUNT = 2;

// A steady colour and initial per product, so a tile can be found without reading it
const tileHue = name => [...String(name)].reduce((hash, char) => (hash * 31 + char.codePointAt(0)) % 360, 7);
const initialOf = name => (Array.from(String(name).trim())[0] || '?').toUpperCase();

// Decorations on screens only (never on bills): hidden from screen readers, never in translations
const STATUS_ICONS = { Paid: '✅', Due: '⏳', Draft: '📝' };
const TOAST_ICONS = { success: '✅', warning: '⚠️', error: '❌', info: 'ℹ️' };

const MIC_ICON = '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4"/></svg>';
const SPEAK_ICON = '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 010 7.07M19.07 4.93a10 10 0 010 14.14"/></svg>';
const TRASH_ICON = '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>';

/**
 * A picture file made at most `maxSize` pixels on its longer side, as a PNG data URL,
 * so an uploaded QR code photo does not fill the browser's storage.
 */
async function shrinkImage(file, maxSize = 600) {
  if (!file.type.startsWith('image/') || file.size > 15 * 1024 * 1024) throw new Error('Not a picture we can use');
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; // a transparent QR would print black on black in some viewers
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

class BillCraftApp {
  constructor() {
    StorageService.migrate();
    this.settings = StorageService.getSettings();
    this.currentInvoice = this.openingBill();
    this.activeTemplate = this.currentInvoice.template || this.settings.defaultTemplate || 'modern';
    this.currentView = 'builder';
    this.step = 1;
    this.qrDataUrl = '';
    this.qrKey = '';
    this.previewFrame = 0;
    this.editingProductId = null;
    this.productUnitPicked = false; // in the product form: a unit was picked, so the name no longer sets it
    this.productIcon = ''; // in the product form: a picture, NO_ICON, or '' to follow the name
    this.expandedItemIds = new Set();
    this.unitPickedItemIds = new Set(); // lines whose unit was picked by hand, so their name no longer sets it
    this.customerMode = null; // 'new' while a new customer is being typed
    this.searchQuery = '';
    this.qtyTarget = null; // what the quantity sheet is for
    this.payTarget = null; // what the payment sheet is for: { invoice, fromBuilder }
    this.modalOpeners = new Map(); // dialog id -> the element focus returns to
    this.refreshHistoryData();

    // Replaced by loadTranslators() before anything is rendered
    this.ui = createTranslator();
    this.bill = this.ui;
  }

  async start() {
    this.motionLayer = document.getElementById('motion-layer');
    await this.loadTranslators();
    this.bindNavigation();
    this.bindBuilderEvents();
    this.bindCatalogEvents();
    this.bindHistoryEvents();
    this.bindSettingsEvents();
    this.bindModalEvents();
    this.bindLanguageEvents();
    this.bindSetupEvents();
    this.bindAppEvents();
    this.bindVoiceEvents();
    this.bindMoreOptions();
    this.populateLanguageSelects();
    this.setupSpeechButtons();
    this.decorateVoiceFields(document);
    this.refreshAll();
    // First run: the language, then the shop
    if (!this.settings.appLanguage) {
      this.openLanguagePicker(true);
    } else if (!this.settings.setupDone) {
      this.openSetup();
    }
    // Wide screens show the export buttons from the start, so load their libraries once idle
    if (DESKTOP_QUERY.matches) setTimeout(() => ExporterService.preload(), 1500);
    this.registerServiceWorker();
    this.watchForErrors();
    document.documentElement.classList.add('app-ready');
  }

  /**
   * Anything that goes wrong unexpectedly is logged to the console (nothing is sent
   * anywhere) and the person sees a short notice, at most every 10 seconds.
   */
  watchForErrors() {
    const report = (error) => {
      console.error('BillCraft:', error);
      if (Date.now() - (this.errorShownAt || 0) < 10000) return;
      this.errorShownAt = Date.now();
      this.showToast(this.t('toast.unexpected'), 'danger');
    };
    window.addEventListener('error', (event) => {
      // Only the app's own scripts, not browser extensions
      if (!event.filename || event.filename.startsWith(location.origin)) report(event.error || event.message);
    });
    window.addEventListener('unhandledrejection', event => report(event.reason));
  }

  // --- The app itself: offline use, install and updates ---

  /**
   * The service worker keeps the app's files on this device, so it opens without
   * internet. Browsers allow it on HTTPS; locally it runs only with ?sw=1, so
   * development never shows stale files.
   */
  registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    const local = ['localhost', '127.0.0.1'].includes(location.hostname);
    if (local && !new URLSearchParams(location.search).has('sw')) return;

    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((registration) => {
      this.swRegistration = registration;
      if (registration.waiting && navigator.serviceWorker.controller) this.offerUpdate(registration.waiting);
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          // "installed" while a version is running means an update waits
          if (worker.state === 'installed' && navigator.serviceWorker.controller) this.offerUpdate(worker);
        });
      });
    }).catch(error => console.warn('Offline use is not available here', error));

    // Look for a new version when the app comes back to the screen, at most hourly
    let checkedAt = Date.now();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden || !this.swRegistration || Date.now() - checkedAt < 60 * 60 * 1000) return;
      checkedAt = Date.now();
      this.swRegistration.update().catch(() => {});
    });

    // Reload only when the person asked for the update, never on the first install
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (this.updating) location.reload();
    });
  }

  /** A new version is ready: offer it, in a notice and in Settings */
  offerUpdate(worker) {
    this.updateWorker = worker;
    this.renderAppCard();
    this.showToast(this.t('update.ready'), 'info', { label: this.t('update.now'), onClick: () => this.applyUpdate() }, 15000);
  }

  applyUpdate() {
    if (!this.updateWorker) return;
    this.updating = true;
    this.updateWorker.postMessage('skip-waiting');
  }

  bindAppEvents() {
    // Browsers that can install the app offer it here instead of in their own menu
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      this.installPrompt = event;
      this.renderAppCard();
    });
    window.addEventListener('appinstalled', () => {
      this.installPrompt = null;
      this.renderAppCard();
    });
    document.getElementById('btn-install-app').addEventListener('click', () => this.promptInstall());
    document.getElementById('btn-update-app').addEventListener('click', () => this.applyUpdate());
  }

  /** The browser's own "Install app" prompt, where it offers one */
  async promptInstall() {
    const prompt = this.installPrompt;
    if (!prompt) return;
    try {
      await prompt.prompt();
    } catch {
      return; // the browser wants a real tap; the offer stays for the next one
    }
    this.installPrompt = null;
    await prompt.userChoice.catch(() => {});
    this.renderAppCard();
  }

  /**
   * Once, a little after the first saved bill on a phone: suggest adding the app to the
   * home screen (the install prompt on Android, the Share steps in Settings on iPhone)
   */
  suggestInstall() {
    if (this.settings.installTipShown || !COARSE_POINTER.matches || isInstalledApp()) return;
    if (!this.installPrompt && !isAppleMobile()) return;
    this.settings.installTipShown = true;
    this.saveSettings();
    const help = () => {
      this.switchView('settings');
      document.querySelector('.app-card').scrollIntoView({ block: 'center' });
    };
    this.showToast(this.t('install.tip'), 'info', {
      label: this.t(this.installPrompt ? 'install.button' : 'install.how'),
      onClick: () => (this.installPrompt ? this.promptInstall() : help())
    }, 12000);
  }

  /** Settings → App: install (or how to, on iPhone), a waiting update, and the version */
  renderAppCard() {
    const installed = isInstalledApp();
    document.getElementById('install-row').hidden = installed || !this.installPrompt;
    document.getElementById('install-ios').hidden = installed || !isAppleMobile();
    document.getElementById('update-row').hidden = !this.updateWorker;
    document.getElementById('app-version').textContent = this.t('settings.version', { version: APP_VERSION });
  }

  populateLanguageSelects() {
    const labelFor = language => (language.nativeName === language.name
      ? language.name
      : `${language.nativeName} (${language.name})`);
    const options = availableLanguages()
      .map(language => `<option value="${this.escape(language.code)}">${this.escape(labelFor(language))}</option>`)
      .join('');

    document.getElementById('settings-app-language').innerHTML = options;
    document.getElementById('settings-bill-language').innerHTML =
      `<option value="" data-i18n="settings.billLanguageSame">Same as app language</option>${options}`;
  }

  // --- Translation ---
  async loadTranslators() {
    const appCode = this.settings.appLanguage || DEFAULT_LANGUAGE;
    const billCode = this.settings.billLanguage || appCode;
    this.ui = createTranslator(await loadLocale(appCode), appCode);
    this.bill = createTranslator(await loadLocale(billCode), billCode);
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
      <button type="button" class="lang-option${language.code === this.settings.appLanguage ? ' active' : ''}" data-lang="${this.escape(language.code)}" lang="${this.escape(language.code)}">
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
    this.saveSettings();
    await this.applyLanguageChange();
    this.closeModal('modal-language');
    if (this.settings.setupDone) {
      this.showToast(this.t('toast.languageChanged'), 'success');
    } else {
      this.openSetup();
    }
  }

  // --- Shop setup: first run, and from the bill while the shop has no name ---
  bindSetupEvents() {
    document.getElementById('form-setup').addEventListener('submit', (event) => {
      event.preventDefault();
      this.finishSetup(true);
    });
    document.getElementById('btn-setup-skip').addEventListener('click', () => this.finishSetup(false));
    document.getElementById('setup-upi').addEventListener('input', () => this.showFieldError('setup-upi', false));
    document.getElementById('btn-nudge-setup').addEventListener('click', () => this.openSetup());
  }

  openSetup() {
    document.getElementById('setup-shop').value = this.settings.brandName || '';
    document.getElementById('setup-phone').value = this.settings.phone || '';
    document.getElementById('setup-upi').value = this.settings.upiId || '';
    this.showFieldError('setup-upi', false);
    this.openModal('modal-setup');
    if (!COARSE_POINTER.matches) document.getElementById('setup-shop').focus();
  }

  /** Saves the shop details, or only that the setup was skipped, so it is not asked again */
  finishSetup(save) {
    if (save) {
      const upiField = document.getElementById('setup-upi');
      const upiId = upiField.value.trim();
      if (upiId && !isValidUpiId(upiId)) {
        this.showFieldError('setup-upi', true);
        upiField.focus();
        return;
      }
      this.settings.brandName = document.getElementById('setup-shop').value.trim();
      this.settings.phone = document.getElementById('setup-phone').value.trim();
      this.settings.upiId = upiId;
    }
    this.settings.setupDone = true;
    if (!this.saveSettings()) return;
    this.renumberIfAutomatic();
    this.saveDraft();
    this.closeModal('modal-setup');
    this.refreshAll();
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
      const current = btn.dataset.view === viewName;
      btn.classList.toggle('active', current);
      if (current) {
        btn.setAttribute('aria-current', 'page');
      } else {
        btn.removeAttribute('aria-current');
      }
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

    if (this.step !== previous && !DESKTOP_QUERY.matches) {
      window.scrollTo({ top: 0, behavior: 'instant' });
      const panels = this.step === 1 ? '.step-items' : '.step-customer, .bill-preview-panel';
      slideIn([...layout.querySelectorAll(panels)], Math.sign(this.step - previous));
    }

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
  /**
   * The bill to show when the app opens: the draft, unless history already holds it
   * unchanged. A draft from before 1.1 gets a number in the new style.
   */
  openingBill() {
    const draft = StorageService.getActiveDraft();
    if (!draft || this.isSaved(draft)) return this.createNewInvoice();
    if (draft.numberAuto === null) {
      draft.numberAuto = true;
      draft.invoiceNumber = this.nextBillNumber(draft.date || todayISO());
    }
    return draft;
  }

  // --- Bill numbers (js/billNumber.js) ---

  /** The shop code in bill numbers: the one typed in Settings, else from the shop name */
  billCode() {
    return normalizeShopCode(this.settings.billCode) || shopCode(this.settings.brandName);
  }

  /** The next automatic number for a bill dated `date`, in the chosen format */
  nextBillNumber(date = todayISO()) {
    return StorageService.nextBillNumber(this.settings.billFormat, this.billCode(), date);
  }

  /** What a bill number says, in the app language: "Nov 2026 · bill 42 of the month"; '' for other numbers */
  describeBillNumber(number) {
    const info = readBillNumber(number);
    if (!info) return '';
    const language = this.settings.appLanguage || 'en';
    const two = n => String(n).padStart(2, '0');
    if (info.format === 'day') {
      return this.t('billno.day', { date: formatDate(`${info.year}-${two(info.month)}-${two(info.day)}`, language), count: info.count });
    }
    if (info.format === 'month') {
      const month = new Intl.DateTimeFormat(`${language}-IN`, { month: 'short', year: 'numeric', timeZone: 'UTC', numberingSystem: 'latn' })
        .format(new Date(Date.UTC(info.year, info.month - 1, 1)));
      return this.t('billno.month', { month, count: info.count });
    }
    return this.t('billno.fy', { year: `${info.fyStart}-${two((info.fyStart + 1) % 100)}`, count: info.count });
  }

  /** The line under the bill number on the Send step */
  renderBillNumberMeaning() {
    const meaning = this.describeBillNumber(this.currentInvoice.invoiceNumber);
    const hint = document.getElementById('inv-number-meaning');
    hint.textContent = meaning;
    hint.hidden = !meaning;
  }

  /** A bill not saved yet, with an automatic number, takes the next number for its date and format */
  renumberIfAutomatic() {
    const bill = this.currentInvoice;
    if (!bill.numberAuto || StorageService.getInvoiceById(bill.id)) return;
    bill.invoiceNumber = this.nextBillNumber(bill.date || todayISO());
    document.getElementById('inv-number').value = bill.invoiceNumber;
    this.renderBillNumberMeaning();
  }

  createNewInvoice() {
    const date = todayISO();
    return new Invoice({
      invoiceNumber: this.nextBillNumber(date),
      numberAuto: true,
      date,
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
    this.saveDraft();
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
    document.getElementById('btn-clear-bill').addEventListener('click', () => this.clearBill());
    document.getElementById('btn-payment-qr').addEventListener('click', () => this.openPaymentSheet(this.currentInvoice, true));
    document.getElementById('btn-payment-received').addEventListener('click', () => this.receivePayment());
    document.getElementById('btn-pay-add-upi').addEventListener('click', () => this.addUpiFromPaySheet());

    document.querySelectorAll('.btn-save-bill').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!this.saveBill()) return;
        this.celebrateButton(btn);
        this.afterSave();
      });
    });

    const inputs = [
      'inv-number', 'inv-date', 'inv-due-date',
      'cust-name', 'cust-phone', 'cust-address', 'cust-notes',
      'inv-shipping', 'inv-discount', 'inv-footer-notes'
    ];
    inputs.forEach(id => {
      document.getElementById(id).addEventListener('input', () => this.syncFormToInvoice());
    });
    document.getElementById('cust-name').addEventListener('change', () => this.fillKnownCustomer());

    // Delivery and discount: a chip sets the amount, "Other" opens its field
    [['delivery-chips', 'inv-shipping'], ['discount-chips', 'inv-discount']].forEach(([chipsId, fieldId]) => {
      const chips = document.getElementById(chipsId);
      const field = document.getElementById(fieldId);
      chips.addEventListener('click', (event) => {
        const chip = event.target.closest('.choice-chip');
        if (chip) this.pickCharge(chips, field, chip);
      });
      chips.addEventListener('keydown', (event) => this.moveChoice(event));
      field.addEventListener('input', () => this.showChoice(chips, field, String(parseFloat(field.value) || 0), true));
    });
    // A percent typed over 100 counts as 100; the field says so once the person moves on
    document.getElementById('inv-discount').addEventListener('change', (event) => {
      if (this.currentInvoice.discountType === 'percent' && parseFloat(event.target.value) > 100) event.target.value = '100';
    });
    document.getElementById('discount-type').addEventListener('click', (event) => {
      const option = event.target.closest('[data-discount-type]');
      if (option) this.setDiscountType(option.dataset.discountType);
    });
    // A number typed by hand is kept as typed, even when the date changes
    document.getElementById('inv-number').addEventListener('input', () => {
      this.currentInvoice.numberAuto = false;
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

    const grid = document.getElementById('product-grid');
    grid.addEventListener('click', (event) => {
      if (event.target.closest('[data-add-product]')) {
        this.openProductModal();
        return;
      }
      const askFor = event.target.closest('[data-qty-product]');
      if (askFor) {
        this.askQuantity(askFor.dataset.qtyProduct, askFor.closest('.product-tile-wrap').querySelector('.product-tile'));
        return;
      }
      const tile = event.target.closest('.product-tile');
      if (!tile) return;
      if (tile.hasAttribute('data-other-item')) this.addOtherItem();
      else this.tapProduct(tile.dataset.productId, tile);
    });

    // Holding a tile asks how many, like its 🔢 button; moving the finger (scrolling) cancels
    let press = null;
    const endPress = () => {
      if (press) clearTimeout(press.timer);
      press = null;
    };
    grid.addEventListener('pointerdown', (event) => {
      const tile = event.target.closest('.product-tile[data-product-id]');
      if (!tile || event.button > 0) return;
      endPress();
      press = {
        x: event.clientX,
        y: event.clientY,
        timer: setTimeout(() => {
          press = null;
          // A short buzz where the phone allows it (only after the person has touched the page)
          if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.(15);
          // The sheet opens under the finger: the click from lifting it must not press what is there now
          const swallow = (click) => {
            click.preventDefault();
            click.stopPropagation();
          };
          document.addEventListener('click', swallow, { capture: true, once: true });
          setTimeout(() => document.removeEventListener('click', swallow, { capture: true }), 1000);
          this.askQuantity(tile.dataset.productId, tile);
        }, 550)
      };
    });
    grid.addEventListener('pointermove', (event) => {
      if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 10) endPress();
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(type => grid.addEventListener(type, endPress));
    grid.addEventListener('contextmenu', (event) => {
      if (event.target.closest('.product-tile')) event.preventDefault();
    });

    const lines = document.getElementById('mobile-items-list');
    lines.addEventListener('click', (event) => {
      const chip = event.target.closest('.choice-chip');
      if (chip) {
        this.pickLineUnit(chip);
        return;
      }
      const button = event.target.closest('[data-action]');
      if (button) this.onLineAction(button.closest('.bill-line'), button.dataset.action);
    });
    lines.addEventListener('input', (event) => {
      if (event.target.dataset.field) this.onLineInput(event.target);
    });
    lines.addEventListener('keydown', (event) => this.moveChoice(event));
    // "scroll" does not bubble either: a strip of unit chips fades at its far edge until scrolled to the end
    lines.addEventListener('scroll', (event) => {
      if (event.target.classList?.contains('choices-strip')) this.markStripEnd(event.target);
    }, true);
    // "toggle" does not bubble, so it is caught on the way down
    lines.addEventListener('toggle', (event) => {
      const row = event.target.closest('.bill-line');
      if (!row) return;
      if (event.target.open) {
        this.expandedItemIds.add(row.dataset.itemId);
        this.revealChoice(row.querySelector('.choices'));
      } else {
        this.expandedItemIds.delete(row.dataset.itemId);
      }
    }, true);

    document.getElementById('qty-presets').addEventListener('click', (event) => {
      const preset = event.target.closest('[data-qty]');
      if (preset) this.applyQty(preset.dataset.qty);
    });
    document.getElementById('qty-pad').addEventListener('click', (event) => {
      const key = event.target.closest('[data-key]');
      if (key) this.pressQtyKey(key.dataset.key);
    });
    document.getElementById('qty-input').addEventListener('input', (event) => {
      // Typed, pasted or spoken: digits and one decimal point only
      const field = event.target;
      const [whole, ...rest] = field.value.replace(/[^\d.]/g, '').split('.');
      field.value = rest.length ? `${whole}.${rest.join('')}` : whole;
      this.setQtyFresh(false);
      this.updateQtyPreview();
    });
    document.getElementById('form-qty').addEventListener('submit', (event) => {
      event.preventDefault();
      this.applyQty(document.getElementById('qty-input').value);
    });

    document.getElementById('preview-template-select').addEventListener('change', (e) => {
      this.activeTemplate = e.target.value;
      this.currentInvoice.template = this.activeTemplate;
      this.saveDraft();
      this.renderActiveInvoicePreview();
    });

    // Every way out of the app saves the bill to history first
    document.getElementById('btn-export-pdf').addEventListener('click', () => this.exportBill('pdf'));
    document.getElementById('btn-export-image').addEventListener('click', () => this.exportBill('png'));

    document.getElementById('btn-share-whatsapp').addEventListener('click', (event) => this.sendWhatsApp(event.currentTarget));
    document.getElementById('btn-send-whatsapp').addEventListener('click', (event) => this.sendWhatsApp(event.currentTarget));

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
      this.saveDraft();
    });

    document.querySelectorAll('.btn-speak').forEach(btn => {
      btn.addEventListener('click', () => this.speakTotal());
    });
  }

  syncFormToInvoice() {
    const date = document.getElementById('inv-date').value || '';
    const dateChanged = date !== this.currentInvoice.date;
    this.currentInvoice.invoiceNumber = document.getElementById('inv-number').value || '';
    this.currentInvoice.date = date;
    if (dateChanged && date) this.renumberIfAutomatic();
    this.renderBillNumberMeaning();
    this.currentInvoice.dueDate = document.getElementById('inv-due-date').value || '';

    this.currentInvoice.customer = {
      name: document.getElementById('cust-name').value || '',
      phone: document.getElementById('cust-phone').value || '',
      address: document.getElementById('cust-address').value || '',
      note: document.getElementById('cust-notes').value || ''
    };

    this.currentInvoice.shippingFee = Math.max(0, parseFloat(document.getElementById('inv-shipping').value) || 0);
    const discount = Math.max(0, parseFloat(document.getElementById('inv-discount').value) || 0);
    this.currentInvoice.discountValue = this.currentInvoice.discountType === 'percent' ? Math.min(100, discount) : discount;
    this.currentInvoice.notes = document.getElementById('inv-footer-notes').value || '';

    this.updateTotalsCard();
    this.schedulePreview();

    this.saveDraft();
  }

  renderBuilderForm() {
    document.getElementById('inv-number').value = this.currentInvoice.invoiceNumber || '';
    document.getElementById('inv-date').value = this.currentInvoice.date || '';
    this.renderBillNumberMeaning();
    document.getElementById('inv-due-date').value = this.currentInvoice.dueDate || '';

    document.getElementById('cust-name').value = this.currentInvoice.customer.name || '';
    document.getElementById('cust-phone').value = this.currentInvoice.customer.phone || '';
    document.getElementById('cust-address').value = this.currentInvoice.customer.address || '';
    document.getElementById('cust-notes').value = this.currentInvoice.customer.note || '';

    document.getElementById('inv-shipping').value = this.currentInvoice.shippingFee || '';
    document.getElementById('inv-discount').value = this.currentInvoice.discountValue || '';
    this.renderChargeChips();
    document.getElementById('inv-footer-notes').value = this.currentInvoice.notes || '';

    const templateSelect = document.getElementById('preview-template-select');
    templateSelect.value = this.currentInvoice.template || this.settings.defaultTemplate || 'modern';
    this.activeTemplate = templateSelect.value;

    this.renderProductGrid();
    this.renderBillLines({ fresh: true });
    this.updateTotalsCard();
    this.renderStatusToggle();
    this.renderCustomerChips();
    this.updateClearButton();
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
      <div class="product-tile-wrap">
        <button type="button" class="product-tile" data-product-id="${this.escape(product.id)}" style="--tile-hue: ${tileHue(product.name)}">
          ${this.tileFace(product)}
          <span class="tile-name">${this.escape(product.name)}</span>
          <span class="tile-price"><span class="tile-amount">${formatCurrency(product.unitPrice, curr)}</span><small>/${this.escape(this.unitText(product.unit || 'pcs'))}</small></span>
          <span class="tile-badge" hidden></span>
        </button>
        <button type="button" class="tile-qty" data-qty-product="${this.escape(product.id)}" aria-label="${this.escape(this.t('qty.button', { name: product.name }))}" title="${this.escape(this.t('qty.button', { name: product.name }))}"><span aria-hidden="true">🔢</span></button>
      </div>
    `).join('');
    const noMatch = query && !products.length
      ? `<p class="tile-none"><span aria-hidden="true">🔍</span> ${this.escape(this.t('grid.noMatch'))}</p>`
      : '';
    // No products yet: say what the grid is for, with a way to add the first one
    const noProducts = !this.rankedProducts.length;
    document.querySelector('.product-search').hidden = noProducts;
    const intro = noProducts ? `
      <div class="grid-empty">
        ${this.emptyArt('🛍️', '✨', '🏷️')}
        <p class="grid-empty-title">${this.escape(this.t('grid.emptyTitle'))}</p>
        <p class="grid-empty-text">${this.escape(this.t('grid.emptyText'))}</p>
        <button type="button" class="btn btn-primary" data-add-product>${this.escape(this.t('catalog.addProduct'))}</button>
      </div>` : '';

    document.getElementById('product-grid').innerHTML = `${intro}${noMatch}${tiles}
      <button type="button" class="product-tile product-tile-other" data-other-item>
        <span class="tile-plus" aria-hidden="true">+</span>
        <span class="tile-name">${this.escape(this.t('grid.other'))}</span>
      </button>`;
    this.updateTileBadges(false);
  }

  /** The count on each tile, from the quantities in the bill. A new count pops; a cleared one shrinks away. */
  updateTileBadges(animate = true) {
    const quantities = new Map();
    for (const item of this.currentInvoice.items) {
      if (item.productId) quantities.set(item.productId, roundQty((quantities.get(item.productId) || 0) + item.quantity));
    }
    document.querySelectorAll('#product-grid [data-product-id]').forEach(tile => {
      const qty = quantities.get(tile.dataset.productId) || 0;
      const badge = tile.querySelector('.tile-badge');
      const value = qty ? String(qty) : '';
      tile.classList.toggle('in-bill', qty > 0);
      if ((badge.dataset.value || '') === value) return;
      badge.dataset.value = value;
      if (value) {
        badge.textContent = value;
        badge.hidden = false;
        if (animate) pop(badge);
      } else if (animate) {
        // Hide only if nothing was added back while it shrank
        shrink(badge, () => { badge.hidden = !badge.dataset.value; });
      } else {
        badge.hidden = true;
      }
    });
  }

  /** A "+1" flies from the tile into the bill: the bar on phones, the total on wide screens */
  flyToBill(tile, label) {
    const target = document.getElementById(DESKTOP_QUERY.matches ? 'summary-grand-total' : 'bar-count');
    flyTo(tile, target, label, this.motionLayer, () => pop(target, 1.2));
  }

  /** The quantity sheet for a product (its 🔢 button or a long press): sets the line if it is on the bill */
  askQuantity(productId, tile) {
    const product = this.rankedProducts.find(p => p.id === productId);
    if (!product) return;
    const line = this.currentInvoice.items.find(item => item.productId === product.id);
    this.openQtySheet({ product, line, tile });
  }

  /**
   * A key of the on-screen number pad. A quantity shown when the sheet opened is
   * replaced by the first key, as on a calculator.
   */
  pressQtyKey(key) {
    const input = document.getElementById('qty-input');
    let value = this.qtyFresh ? '' : input.value;
    if (key === 'back') {
      value = value.slice(0, -1);
    } else if (key === '.') {
      if (!value.includes('.')) value = `${value || '0'}.`;
    } else {
      value = value === '0' ? key : `${value}${key}`;
    }
    if (value.replace('.', '').length > 7) return;
    input.value = value;
    this.setQtyFresh(false);
    this.updateQtyPreview();
  }

  setQtyFresh(fresh) {
    this.qtyFresh = fresh;
    document.getElementById('qty-input').classList.toggle('is-fresh', fresh);
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
    this.afterItemsChange(product.name);
    this.flyToBill(tile, '+1');
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
  afterItemsChange(addedName = '') {
    this.renderBillLines();
    this.updateTileBadges();
    this.updateTotalsCard();
    this.schedulePreview();
    this.saveDraft();
    this.announceBill(addedName);
  }

  /**
   * Tells screen readers what the bill holds now, once things settle (the totals
   * count up visually, which must not be read out frame by frame).
   */
  announceBill(addedName = '') {
    const count = this.currentInvoice.items.length;
    const items = this.t(count === 1 ? 'bar.item' : 'bar.items', { count });
    const total = formatCurrency(this.currentInvoice.grandTotal, this.settings.currency || '₹');
    const text = `${addedName ? `${this.t('a11y.added', { name: addedName })} ` : ''}${this.t('a11y.billNow', { items, total })}`;
    clearTimeout(this.announceTimer);
    this.announceTimer = setTimeout(() => {
      document.getElementById('sr-status').textContent = text;
    }, 500);
  }

  lineRow(itemId) {
    return document.querySelector(`#mobile-items-list .bill-line[data-item-id="${CSS.escape(itemId)}"]`);
  }

  /**
   * One line per item. Lines are kept and updated by item id, so typing keeps its
   * focus and only real changes move: new lines slide in, removed ones collapse out.
   * `fresh` rebuilds them without motion, for another bill or another language.
   */
  renderBillLines({ fresh = false } = {}) {
    const container = document.getElementById('mobile-items-list');
    if (fresh) container.textContent = '';
    const items = this.currentInvoice.items;
    const ids = new Set(items.map(item => item.id));

    container.querySelectorAll('.bill-line:not([data-leaving])').forEach(row => {
      if (!ids.has(row.dataset.itemId)) exit(row);
    });

    const empty = container.querySelector('.empty-box');
    if (!items.length) {
      if (!empty) {
        container.insertAdjacentHTML('beforeend', `<div class="empty-box empty-box-inline"><span class="empty-inline-icon" aria-hidden="true">🛒</span><span>${this.escape(this.t('items.emptyHint'))}</span></div>`);
      }
      return;
    }
    empty?.remove();

    items.forEach(item => {
      let row = this.lineRow(item.id);
      const isNew = !row;
      if (isNew) {
        row = this.createBillLine(item);
        container.appendChild(row);
        if (!fresh) enter(row);
      }
      this.updateBillLine(row, item, !fresh && !isNew);
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
        <span class="line-icon" aria-hidden="true" hidden></span>
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
          <label class="field-stack field-wide">
            <span class="form-label">${this.escape(this.t('item.namePh'))}</span>
            <input type="text" class="form-control" placeholder="${this.escape(this.t('item.namePh'))}" value="${this.escape(item.name)}" data-field="name" data-voice="text" />
          </label>
          <div class="field-stack field-wide">
            <label class="form-label" for="line-unit-${this.escape(item.id)}">${this.escape(this.t('item.unit'))}</label>
            <div class="choices choices-strip" role="radiogroup" aria-label="${this.escape(this.t('item.unit'))}">${this.unitChips()}</div>
            <input type="text" class="form-control choice-other" id="line-unit-${this.escape(item.id)}" maxlength="20" placeholder="${this.escape(this.t('product.unitPh'))}" value="${this.escape(item.unit)}" data-field="unit" />
          </div>
          <label class="field-stack">
            <span class="form-label">${this.escape(this.t('item.rate', { currency: curr }))}</span>
            <input type="number" inputmode="decimal" step="any" min="0" class="form-control" value="${item.unitPrice}" data-field="unitPrice" data-voice="number" />
          </label>
          <label class="field-stack">
            <span class="form-label">${this.escape(this.t('item.discPct'))}</span>
            <input type="number" inputmode="decimal" min="0" max="100" class="form-control" placeholder="0" value="${item.discount || ''}" data-field="discount" />
          </label>
          <label class="field-stack field-wide">
            <span class="form-label">${this.escape(this.t('product.desc'))}</span>
            <input type="text" class="form-control" placeholder="${this.escape(this.t('item.descPh'))}" value="${this.escape(item.description)}" data-field="description" />
          </label>
          <div class="line-actions field-wide">
            <button type="button" class="btn btn-secondary btn-sm" data-action="save-product">${this.escape(this.t('item.saveProduct'))}</button>
            <button type="button" class="btn btn-ghost btn-sm line-remove" data-action="remove">${TRASH_ICON}<span>${this.escape(this.t('item.remove'))}</span></button>
          </div>
        </div>
      </details>
    `;
    this.showUnitChoice(row.querySelector('.choices'), row.querySelector('[data-field="unit"]'), item.unit);
    return row;
  }

  updateBillLine(row, item, animate = false) {
    const curr = this.settings.currency || '₹';
    const qty = roundQty(item.quantity);
    const qtyChanged = row.dataset.qty !== undefined && row.dataset.qty !== String(qty);
    row.dataset.qty = String(qty);
    const picture = this.linePicture(item);
    const icon = row.querySelector('.line-icon');
    icon.textContent = picture;
    icon.hidden = !picture;
    const name = row.querySelector('.line-name');
    name.textContent = item.name || this.t('item.namePh');
    name.classList.toggle('is-placeholder', !item.name);
    row.querySelector('.line-total').textContent = formatCurrency(item.total, curr);
    const qtyButton = row.querySelector('.line-qty');
    const unit = this.unitText(item.unit);
    qtyButton.innerHTML = `${qty} <small>${this.escape(unit)}</small> <span class="line-qty-edit" aria-hidden="true">✏️</span>`;
    qtyButton.setAttribute('aria-label', `${this.t('item.qty')}: ${qty} ${unit}`);
    row.querySelector('.line-rate').textContent = `× ${formatCurrency(item.unitPrice, curr)}`;
    // Only typed items can be saved as products; catalog items already are
    row.querySelector('[data-action="save-product"]').hidden = Boolean(item.productId);
    if (animate && qtyChanged) pop(qtyButton, 1.15);
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
    const oldName = item.name;
    if (field === 'unit') {
      // A standard unit is kept as its code, however it is spelt ('Kilo' → kg)
      const typed = input.value.trim();
      item.unit = unitInfo(typed)?.code || typed;
      this.unitPickedItemIds.add(item.id);
      const picker = row.querySelector('.choices');
      this.showUnitChoice(picker, input, typed, true);
      this.revealChoice(picker);
    } else {
      item[field] = field === 'unitPrice' || field === 'discount' ? parseFloat(input.value) || 0 : input.value;
    }
    if (field === 'name') this.followNameUnit(row, item, oldName);
    this.updateBillLine(row, item);
    this.updateTotalsCard();
    this.schedulePreview();
    this.saveDraft();
  }

  /** "Save to my products": a typed item becomes a tile for the next bill */
  saveLineAsProduct(item) {
    const name = item.name.trim();
    if (!name) {
      this.showToast(this.t('toast.productNameRequired'), 'warning');
      return;
    }
    const product = new Product({ name, unitPrice: item.unitPrice, unit: item.unit, description: item.description });
    if (!this.store(() => StorageService.addProduct(product))) return;
    item.productId = product.id;
    this.refreshHistoryData();
    this.renderProductGrid();
    this.afterItemsChange();
    this.showToast(this.t('toast.catalogAdded'), 'success');
  }

  /** A unit for screens: a standard one in the app language (kg → किलो), anything else as typed */
  unitText(unit) {
    return unitLabel(unit, this.ui.t);
  }

  /** One chip of a choice row (units, delivery, discount); a `choice` of null makes it "Other" */
  choiceChip(choice, icon, label) {
    const attribute = choice === null ? 'data-choice-other' : `data-choice="${this.escape(String(choice))}"`;
    const iconHTML = icon ? `<span class="choice-icon" aria-hidden="true">${this.escape(icon)}</span>` : '';
    return `<button type="button" class="choice-chip" role="radio" aria-checked="false" ${attribute}>${iconHTML}<span>${this.escape(label)}</span></button>`;
  }

  /** The unit picker's chips: every standard unit with its icon, then "✏️ Other" for typing one */
  unitChips() {
    return UNITS.map(unit => this.choiceChip(unit.code, unit.icon, this.t(`unit.${unit.code}`))).join('')
      + this.choiceChip(null, '✏️', this.t('common.other'));
  }

  /**
   * Checks the chip whose data-choice is `choice`, or "Other" when no chip has it, and
   * then shows the field for typing. `typing` keeps the field open while the person
   * types in it. Only the checked chip is a Tab stop; the arrow keys move between chips.
   */
  showChoice(picker, field, choice, typing = false) {
    const chips = [...picker.querySelectorAll('.choice-chip')];
    const match = choice === null ? null : chips.find(chip => chip.dataset.choice === String(choice));
    if (field) field.hidden = Boolean(match) && !typing;
    chips.forEach(chip => {
      const checked = match ? chip === match : chip.hasAttribute('data-choice-other');
      chip.setAttribute('aria-checked', String(checked));
      chip.tabIndex = checked ? 0 : -1;
    });
  }

  /** A standard unit checks its chip, whatever the spelling; any other unit checks "Other" */
  showUnitChoice(picker, field, unit, typing = false) {
    this.showChoice(picker, field, unitInfo(unit)?.code ?? null, typing);
  }

  /** Scrolls a strip of chips so the checked one is in view */
  revealChoice(picker) {
    const chip = picker?.querySelector('[aria-checked="true"]');
    if (!chip) return;
    picker.scrollLeft = chip.offsetLeft - (picker.clientWidth - chip.offsetWidth) / 2;
    this.markStripEnd(picker);
  }

  markStripEnd(strip) {
    strip.classList.toggle('at-end', strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - 4);
  }

  /** Arrow keys in a row of chips move to the next or previous chip and pick it */
  moveChoice(event) {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    const chip = step && event.target.closest('.choice-chip');
    if (!chip) return;
    event.preventDefault();
    const chips = [...chip.parentElement.querySelectorAll('.choice-chip')];
    const next = chips[(chips.indexOf(chip) + step + chips.length) % chips.length];
    next.focus();
    next.click();
  }

  /** A unit chip in a line's Edit panel: the line changes at once; "Other" opens the field for typing one */
  pickLineUnit(chip) {
    const row = chip.closest('.bill-line');
    const item = row && this.currentInvoice.items.find(line => line.id === row.dataset.itemId);
    if (!item) return;
    const picker = chip.closest('.choices');
    const field = row.querySelector('[data-field="unit"]');
    this.unitPickedItemIds.add(item.id);
    if (chip.hasAttribute('data-choice-other')) {
      // A standard unit has its chip: the field starts empty, for a new one
      if (unitInfo(field.value)) field.value = '';
      this.showUnitChoice(picker, field, field.value, true);
      field.focus();
      return;
    }
    item.unit = chip.dataset.choice;
    field.value = item.unit;
    this.showUnitChoice(picker, field, item.unit);
    this.updateBillLine(row, item);
    this.schedulePreview();
    this.saveDraft();
  }

  /**
   * A typed item's unit follows its name, as in the product form ("Rice" → kg), while
   * it is still the unit the old name suggested and none was picked by hand.
   */
  followNameUnit(row, item, oldName) {
    if (item.productId || this.unitPickedItemIds.has(item.id)) return;
    const suggested = name => suggestForProduct(name)?.unit || 'pcs';
    const unit = suggested(item.name);
    if (item.unit !== suggested(oldName) || unit === item.unit) return;
    item.unit = unit;
    const picker = row.querySelector('.choices');
    const field = row.querySelector('[data-field="unit"]');
    field.value = unit;
    this.showUnitChoice(picker, field, unit);
    this.revealChoice(picker);
  }

  /** A tile's face: the product's picture, or its initial on its own colour */
  tileFace(product) {
    const picture = pictureFor(product);
    return picture
      ? `<span class="tile-initial tile-picture" aria-hidden="true">${this.escape(picture)}</span>`
      : `<span class="tile-initial" aria-hidden="true">${this.escape(initialOf(product.name))}</span>`;
  }

  /** A product card's picture before its name, if it has one */
  cardPicture(product) {
    const picture = pictureFor(product);
    return picture ? `<span class="product-card-icon" aria-hidden="true">${this.escape(picture)}</span>` : '';
  }

  /** A bill line's picture: its product's, or for a typed item the one its name suggests */
  linePicture(item) {
    const product = item.productId && this.rankedProducts.find(p => p.id === item.productId);
    return pictureFor(product || { name: item.name });
  }

  /** A picture for an empty screen: one large emoji with two small ones beside it */
  emptyArt(main, first, second) {
    const part = (name, emoji) => `<span class="empty-art-${name}">${this.escape(emoji)}</span>`;
    return `<div class="empty-art" aria-hidden="true">${part('main', main)}${part('a', first)}${part('b', second)}</div>`;
  }

  /**
   * How much: presets in one tap, or any amount typed or spoken. For a product not on
   * the bill yet it adds a line; for a line it sets the quantity.
   */
  openQtySheet({ product = null, line = null, tile = null }) {
    const source = line || product;
    this.qtyTarget = { product, lineId: line ? line.id : null, tile };
    document.getElementById('qty-title').textContent = source.name || this.t('item.namePh');
    document.getElementById('qty-icon').textContent = line ? this.linePicture(line) : pictureFor(product);
    const unit = this.unitText(source.unit);
    document.getElementById('qty-unit').textContent = unit;
    document.getElementById('qty-presets').innerHTML = presetsFor(source.unit).map(qty => `
      <button type="button" class="qty-preset" data-qty="${qty}">${qty} <small>${this.escape(unit)}</small></button>
    `).join('');
    const input = document.getElementById('qty-input');
    input.value = line ? roundQty(line.quantity) : '';
    this.setQtyFresh(Boolean(line));
    // Phones type with the on-screen pad, so their keyboard never covers the sheet
    input.inputMode = COARSE_POINTER.matches ? 'none' : 'decimal';
    this.updateQtyPreview();
    this.openModal('modal-qty');
    if (!COARSE_POINTER.matches) input.select();
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
    output.textContent = `${qty} ${this.unitText(source.unit)} × ${formatCurrency(source.unitPrice, curr)} = ${formatCurrency(total, curr)}`;
  }

  applyQty(value) {
    this.closeModal('modal-qty');
    // An empty field changes nothing
    if (String(value).trim() === '') return;
    const qty = roundQty(value);
    const { product, lineId, tile } = this.qtyTarget;
    if (lineId) {
      setLineQuantity(this.currentInvoice.items, lineId, qty);
    } else if (qty > 0) {
      addProductLine(this.currentInvoice.items, product, qty);
    }
    this.afterItemsChange(!lineId && qty > 0 ? product.name : '');
    if (tile && qty > 0) this.flyToBill(tile, `${lineId ? '' : '+'}${qty} ${this.unitText(product.unit)}`.trim());
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

  /** Totals count up (or down) to the new amount */
  updateTotalsCard() {
    const money = value => formatCurrency(value, this.settings.currency || '₹');
    const { discountAmount, shippingFee } = this.currentInvoice;
    countTo(document.getElementById('summary-subtotal'), this.currentInvoice.subtotal, money);
    document.getElementById('summary-discount-row').hidden = !(discountAmount > 0);
    document.getElementById('summary-discount-label').textContent = `${discountLabel(this.t('bill.discount'), this.currentInvoice)}:`;
    document.getElementById('summary-discount').textContent = `- ${money(discountAmount)}`;
    document.getElementById('summary-delivery-row').hidden = !(shippingFee > 0);
    document.getElementById('summary-delivery').textContent = `+ ${money(shippingFee)}`;
    countTo(document.getElementById('summary-grand-total'), this.currentInvoice.grandTotal, money);
    this.renderPaymentBanner();
    document.getElementById('summary-words').textContent = this.ui.words(this.currentInvoice.grandTotal);
    this.updateBar();
  }

  /** The phone bar: how many items, the running total, and Next once the bill has an item */
  updateBar() {
    const count = this.currentInvoice.items.length;
    document.getElementById('bar-count').textContent = this.t(count === 1 ? 'bar.item' : 'bar.items', { count });
    countTo(document.getElementById('bar-total'), this.currentInvoice.grandTotal, value => formatCurrency(value, this.settings.currency || '₹'));
    const next = document.getElementById('btn-step-next');
    const wasOff = next.disabled;
    next.disabled = count === 0;
    if (wasOff && !next.disabled) nudge(next);
  }

  /** Paid, Due or Draft, with the pill behind the chosen one */
  /** Delivery and discount chips: None, the usual amounts in the bill's currency, and "✏️ Other" */
  renderChargeChips() {
    const curr = this.settings.currency || '₹';
    const money = value => formatCurrency(value, curr, 0);
    const { shippingFee, discountType, discountValue } = this.currentInvoice;
    const chips = (presets, label) => [
      this.choiceChip(0, '', this.t('common.none')),
      ...presets.map(value => this.choiceChip(value, '', label(value))),
      this.choiceChip(null, '✏️', this.t('common.other'))
    ].join('');

    const delivery = document.getElementById('delivery-chips');
    delivery.innerHTML = chips(deliveryPresets(curr), money);
    this.showChoice(delivery, document.getElementById('inv-shipping'), String(shippingFee));

    const discount = document.getElementById('discount-chips');
    const field = document.getElementById('inv-discount');
    discount.innerHTML = chips(discountPresets(discountType, curr), discountType === 'percent' ? value => `${value}%` : money);
    field.max = discountType === 'percent' ? '100' : '';
    this.showChoice(discount, field, String(discountValue));

    const toggle = document.getElementById('discount-type');
    toggle.querySelectorAll('[data-discount-type]').forEach(option => {
      option.setAttribute('aria-checked', String(option.dataset.discountType === discountType));
    });
    toggle.style.setProperty('--active', discountType === 'amount' ? 1 : 0);
    document.getElementById('discount-currency').textContent = curr;
  }

  /** A delivery or discount chip: the amount changes at once. "Other" opens the field with the amount, ready to type over. */
  pickCharge(chips, field, chip) {
    if (chip.hasAttribute('data-choice-other')) {
      this.showChoice(chips, field, null, true);
      field.focus();
      field.select();
      return;
    }
    field.value = chip.dataset.choice === '0' ? '' : chip.dataset.choice;
    this.showChoice(chips, field, chip.dataset.choice);
    this.syncFormToInvoice();
    pop(chip, 1.08);
  }

  /** Percent or amount. The discount starts again at None, since 10% and ₹10 are different discounts. */
  setDiscountType(type) {
    if (type === this.currentInvoice.discountType) return;
    this.currentInvoice.discountType = type;
    document.getElementById('inv-discount').value = '';
    this.syncFormToInvoice();
    this.renderChargeChips();
  }

  renderStatusToggle() {
    const toggle = document.getElementById('status-toggle');
    const options = [...toggle.querySelectorAll('[data-status]')];
    const index = Math.max(0, options.findIndex(option => option.dataset.status === this.currentInvoice.status));
    options.forEach((option, i) => option.setAttribute('aria-checked', String(i === index)));
    toggle.style.setProperty('--active', index);
    document.getElementById('due-date-group').hidden = this.currentInvoice.status !== 'Due';
    this.renderPaymentBanner();
  }

  /** "📲 Show payment QR" above the bill, while it is Due or a Draft and has an amount */
  renderPaymentBanner() {
    const { status, grandTotal } = this.currentInvoice;
    document.getElementById('btn-payment-qr').hidden = !(status === 'Due' || status === 'Draft') || !(grandTotal > 0);
    document.getElementById('pay-banner-hint').textContent = this.t('pay.showHint', {
      amount: formatCurrency(grandTotal, this.settings.currency || '₹')
    });
  }

  /**
   * The payment sheet for a Due or Draft bill: a large QR code for its amount, with the
   * shop name and UPI ID, and "Payment received". Without a UPI ID it shows the shop's
   * own QR picture (the customer types the amount) or says how to add one. UPI is rupees only.
   */
  openPaymentSheet(invoice, fromBuilder) {
    if (fromBuilder) this.syncFormToInvoice();
    this.payTarget = { invoice, fromBuilder };
    const { upiId, brandName, qrCustomImage } = this.settings;
    const currency = this.settings.currency || '₹';
    const amount = formatCurrency(invoice.grandTotal, currency);
    const rupees = currency === '₹';
    const link = rupees && isValidUpiId(upiId)
      ? buildUPIString({ upiId, brandName, amount: invoice.grandTotal, invoiceNumber: invoice.invoiceNumber })
      : '';
    const picture = link ? generateQRCodeURL(link) : (rupees ? safeImageSrc(qrCustomImage) : '');

    document.getElementById('pay-shop').textContent = brandName || '';
    document.getElementById('pay-amount').textContent = amount;
    document.getElementById('pay-bill').textContent = this.t('pay.bill', { number: invoice.invoiceNumber });
    const image = document.getElementById('pay-qr');
    if (picture) image.src = picture;
    else image.removeAttribute('src');
    image.alt = this.t('pay.qrAlt', { amount });
    document.getElementById('pay-qr-box').hidden = !picture;
    document.getElementById('pay-upi').textContent = link ? this.t('pay.upi', { upi: upiId.trim() }) : '';
    const note = document.getElementById('pay-note');
    note.hidden = !picture || Boolean(link);
    note.textContent = this.t('pay.typeAmount', { amount });
    document.getElementById('pay-missing').hidden = Boolean(picture);
    document.getElementById('pay-missing-text').textContent = rupees ? this.t('pay.noUpi') : this.t('pay.rupeesOnly', { currency });
    document.getElementById('btn-pay-add-upi').hidden = !rupees;
    this.openModal('modal-pay');
  }

  /** "Payment received": the bill is saved as Paid, with Undo. A bill not saved yet is saved first. */
  receivePayment() {
    const { invoice, fromBuilder } = this.payTarget || {};
    if (!invoice) return;
    this.closeModal('modal-pay');
    if (fromBuilder && !this.saveBill()) return;
    this.setBillStatus(invoice, 'Paid', true);
    if (fromBuilder) celebrate(document.querySelector('#status-toggle [data-status="Paid"]'), this.motionLayer);
  }

  /** "Add UPI ID": Settings, with the cursor in the UPI field */
  addUpiFromPaySheet() {
    this.closeModal('modal-pay');
    this.switchView('settings');
    document.getElementById('settings-upi').focus();
  }

  /** 🧹 Clear shows while the bill holds anything to clear */
  updateClearButton() {
    const { items, customer, shippingFee, discountValue, notes } = this.currentInvoice;
    const filled = items.length > 0 || shippingFee > 0 || discountValue > 0 || Boolean(notes.trim())
      || Object.values(customer).some(value => String(value || '').trim());
    document.getElementById('btn-clear-bill').hidden = !filled;
  }

  /** 🧹 Clear: this bill starts again, keeping its number and date. Undo puts everything back. */
  clearBill() {
    const before = this.currentInvoice;
    const { id, invoiceNumber, date, numberAuto, template, createdAt } = before;
    this.currentInvoice = new Invoice({ id, invoiceNumber, date, numberAuto, template, createdAt });
    this.customerMode = null;
    this.renderBuilderForm();
    this.saveDraft();
    this.showToast(this.t('toast.billCleared'), 'info', {
      label: this.t('common.undo'),
      onClick: () => {
        this.currentInvoice = before;
        this.renderBuilderForm();
        this.saveDraft();
      }
    });
  }

  /** Product order and recent customers come from saved bills, so they are refreshed after each save */
  refreshHistoryData() {
    const invoices = StorageService.getInvoices();
    this.recent = recentCustomers(invoices);
    this.customers = recentCustomers(invoices, Infinity);
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
      { key: 'walkin', icon: '🚶', label: this.t('common.walkIn') },
      ...this.recent.map((customer, index) => ({ key: `recent-${index}`, icon: '👤', label: customer.name })),
      { key: 'new', icon: '➕', label: this.t('customer.new') }
    ];
    document.getElementById('customer-chips').innerHTML = chips.map(chip => `
      <button type="button" class="chip${chip.key === active ? ' active' : ''}" data-chip="${chip.key}" aria-pressed="${chip.key === active}"><span class="chip-icon" aria-hidden="true">${chip.icon}</span> ${this.escape(chip.label)}</button>
    `).join('');
    document.getElementById('customer-fields').hidden = active !== 'new';
    document.getElementById('customer-suggestions').innerHTML = this.customers
      .map(customer => `<option value="${this.escape(customer.name)}">${this.escape(customer.phone)}</option>`).join('');
  }

  /** A name typed or picked that matches a past customer fills in their phone and address, if empty */
  fillKnownCustomer() {
    const name = document.getElementById('cust-name').value.trim().toLowerCase();
    const phone = document.getElementById('cust-phone');
    const match = name && this.customers.find(customer => customer.name.trim().toLowerCase() === name);
    if (!match || phone.value.trim()) return;
    phone.value = match.phone || '';
    document.getElementById('cust-address').value = match.address || '';
    this.syncFormToInvoice();
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
    pop(document.querySelector('#customer-chips .chip.active'), 1.08);
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
    this.saveDraft();
  }

  refreshQR() {
    const { upiId, brandName, currency } = this.settings;
    const { grandTotal, invoiceNumber } = this.currentInvoice;
    // UPI pays only in rupees, and only to a well-formed UPI ID
    const payable = isValidUpiId(upiId) && (currency || '₹') === '₹';
    // Only a new payee, amount or bill number needs a new code
    const key = payable ? [upiId, brandName, grandTotal, invoiceNumber].join('|') : '';
    if (key === this.qrKey) return;
    this.qrKey = key;
    this.qrDataUrl = payable
      ? generateQRCodeURL(buildUPIString({ upiId, brandName, amount: grandTotal, invoiceNumber }))
      : '';
  }

  renderActiveInvoicePreview() {
    document.getElementById('setup-nudge').hidden = Boolean(this.settings.brandName);
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

    const { invoiceNumber, id } = this.currentInvoice;
    if (!invoiceNumber) {
      this.showToast(this.t('toast.needNumber'), 'warning');
      this.focusBillNumber();
      return false;
    }

    if (this.currentInvoice.items.length === 0) {
      this.showToast(this.t('toast.needItem'), 'warning');
      this.setStep(1);
      return false;
    }

    // Two bills with one number would confuse the customer and the records
    if (StorageService.findInvoiceByNumber(invoiceNumber, id)) {
      this.showToast(this.t('toast.numberUsed', { number: invoiceNumber }), 'warning');
      this.focusBillNumber();
      return false;
    }

    if (!this.store(() => StorageService.saveInvoice(this.currentInvoice))) return false;
    this.requestPersistentStorage();
    this.refreshHistoryData();
    this.customerMode = null;
    this.renderCustomerChips();
    this.updateBadges();
    pop(document.getElementById('nav-history-badge'), 1.4);
    return true;
  }

  /** Shows the bill number field (under More options on the Send step) and puts the cursor in it */
  focusBillNumber() {
    this.setStep(STEP_COUNT);
    const field = document.getElementById('inv-number');
    field.closest('details').open = true;
    field.focus();
  }

  /**
   * After the first saved bill, asks the browser to keep this site's data even when
   * the phone runs low on space. Asked once; the browser decides.
   */
  requestPersistentStorage() {
    if (this.settings.persistAsked || !navigator.storage?.persist) return;
    this.settings.persistAsked = true;
    this.saveSettings();
    navigator.storage.persist().catch(() => {});
  }

  /** The saved notice, with the next bill one tap away */
  afterSave(message = this.t('toast.billSaved', { number: this.currentInvoice.invoiceNumber })) {
    this.showToast(message, 'success', { label: this.t('nav.newBill'), onClick: () => this.startNewBill() });
    if (!this.settings.installTipShown) setTimeout(() => this.suggestInstall(), 2500);
  }

  /** The button that sent or saved the bill shows a tick for a moment, with a burst of dots */
  celebrateButton(button) {
    if (!button) return;
    celebrate(button, this.motionLayer);
    button.classList.add('is-done');
    clearTimeout(Number(button.dataset.doneTimer));
    button.dataset.doneTimer = setTimeout(() => button.classList.remove('is-done'), 1400);
  }

  /**
   * Saves the bill and makes it a PDF or PNG: shared on phones (into WhatsApp, Drive...),
   * downloaded elsewhere. A failure says so and offers to try again.
   */
  async exportBill(kind) {
    if (!this.saveBill()) return;
    this.flushPreview();
    const pdf = kind === 'pdf';
    this.showToast(this.t(pdf ? 'toast.pdfPreparing' : 'toast.imagePreparing'), 'info');
    const filename = fileNameFor(this.currentInvoice.invoiceNumber, kind);
    let result;
    try {
      result = pdf
        ? await ExporterService.exportPDF('active-invoice-doc', filename)
        : await ExporterService.exportImage('active-invoice-doc', filename);
    } catch (error) {
      console.error('Export failed', error);
      this.showToast(this.t('toast.exportFailed'), 'danger', { label: this.t('common.retry'), onClick: () => this.exportBill(kind) });
      return;
    }
    if (result.status === 'needs-tap') {
      // The browser wants a fresh tap before it opens the share sheet
      this.showToast(this.t('toast.fileReady'), 'success', { label: this.t('action.share'), onClick: () => result.share().catch(() => {}) }, 15000);
    } else if (result.status !== 'cancelled') {
      this.afterSave(this.t(pdf ? 'toast.pdfReady' : 'toast.imageReady'));
    }
  }

  /** Saves the bill, then opens WhatsApp with it: straight to the customer's chat when the phone is known */
  sendWhatsApp(button) {
    if (!this.saveBill()) return;
    ExporterService.shareWhatsApp(this.currentInvoice, this.settings, this.bill);
    this.celebrateButton(button);
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
      const allowed = await this.confirm({
        title: this.t('voice.consentTitle'),
        message: this.t('voice.consent'),
        confirmLabel: this.t('voice.allow')
      });
      if (!allowed) return;
      this.settings.voiceConsent = true;
      this.saveSettings();
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

    const units = document.getElementById('modal-prod-units');
    const unitField = document.getElementById('modal-prod-unit');
    units.addEventListener('click', (event) => {
      const chip = event.target.closest('.choice-chip');
      if (chip) this.pickProductUnit(chip);
    });
    units.addEventListener('keydown', (event) => this.moveChoice(event));
    unitField.addEventListener('input', () => {
      this.productUnitPicked = true;
      document.getElementById('modal-prod-unit-hint').hidden = true;
      this.showUnitChoice(units, unitField, unitField.value, true);
    });
    document.getElementById('modal-prod-name').addEventListener('input', () => {
      this.suggestProductUnit();
      this.renderProductFace();
    });
    document.getElementById('btn-prod-icon').addEventListener('click', () => this.openIconPicker());
    const groups = document.getElementById('icon-groups');
    groups.addEventListener('click', (event) => {
      const chip = event.target.closest('.choice-chip');
      if (chip) this.renderIconGroup(chip.dataset.choice);
    });
    groups.addEventListener('keydown', (event) => this.moveChoice(event));
    groups.addEventListener('scroll', () => this.markStripEnd(groups));
    document.getElementById('icon-grid').addEventListener('click', (event) => {
      const option = event.target.closest('[data-icon]');
      if (option) this.chooseIcon(option.dataset.icon);
    });
    document.getElementById('btn-icon-none').addEventListener('click', () => this.chooseIcon(NO_ICON));
  }

  /** A chip in the product form: a standard unit, or "Other", which opens the field for typing one */
  pickProductUnit(chip) {
    const units = document.getElementById('modal-prod-units');
    const field = document.getElementById('modal-prod-unit');
    this.productUnitPicked = true;
    document.getElementById('modal-prod-unit-hint').hidden = true;
    if (chip.hasAttribute('data-choice-other')) {
      if (unitInfo(field.value)) field.value = '';
      this.showUnitChoice(units, field, field.value, true);
      field.focus();
      return;
    }
    field.value = chip.dataset.choice;
    this.showUnitChoice(units, field, field.value);
  }

  /** Until a unit is picked, a new product's unit follows its name: "Toor dal" → kg */
  suggestProductUnit() {
    if (this.productUnitPicked) return;
    const suggestion = suggestForProduct(document.getElementById('modal-prod-name').value);
    const unit = suggestion ? suggestion.unit : 'pcs';
    const field = document.getElementById('modal-prod-unit');
    document.getElementById('modal-prod-unit-hint').hidden = !suggestion;
    if (unit === field.value) return;
    const units = document.getElementById('modal-prod-units');
    field.value = unit;
    this.showUnitChoice(units, field, unit);
    pop(units.querySelector('[aria-checked="true"]'), 1.1);
  }

  /** The product form's picture: the one chosen, the one the name suggests, or the initial */
  renderProductFace() {
    const name = document.getElementById('modal-prod-name').value;
    const picture = pictureFor({ icon: this.productIcon, name });
    const face = document.getElementById('prod-icon-face');
    face.textContent = picture || initialOf(name || '?');
    face.classList.toggle('is-initial', !picture);
    face.style.setProperty('--tile-hue', tileHue(name));
    // An initial says nothing; a picture is read out by name ("cooked rice")
    face.setAttribute('aria-hidden', String(!picture));
  }

  /** The picture picker, open at the group of the current picture */
  openIconPicker() {
    const current = pictureFor({ icon: this.productIcon, name: document.getElementById('modal-prod-name').value });
    this.renderIconGroup(groupOf(current));
    this.openModal('modal-icon');
    this.revealChoice(document.getElementById('icon-groups'));
  }

  /** One group of pictures; the current picture is marked */
  renderIconGroup(key) {
    const current = pictureFor({ icon: this.productIcon, name: document.getElementById('modal-prod-name').value });
    const groups = document.getElementById('icon-groups');
    groups.innerHTML = ICON_GROUPS.map(group => this.choiceChip(group.key, group.icons[0], this.t(`iconGroup.${group.key}`))).join('');
    this.showChoice(groups, null, key);
    const { icons } = ICON_GROUPS.find(group => group.key === key);
    document.getElementById('icon-grid').innerHTML = icons.map(icon => `
      <button type="button" class="icon-option" data-icon="${this.escape(icon)}" aria-pressed="${icon === current}">${this.escape(icon)}</button>
    `).join('');
  }

  /** A picture (or NO_ICON) for the product; back to the form */
  chooseIcon(icon) {
    this.productIcon = icon;
    this.renderProductFace();
    this.closeModal('modal-icon');
    pop(document.getElementById('prod-icon-face'), 1.2);
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
          ${this.emptyArt('📦', '✨', '🏷️')}
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
            <div class="product-card-title">${this.cardPicture(p)}${this.escape(p.name)}</div>
            <span class="product-card-tag">${this.escape(this.categoryLabel(p.category))}</span>
          </div>
          <div class="product-card-desc">${this.escape(p.description || this.t('catalog.noDesc'))}</div>
        </div>
        <div class="product-card-bottom">
          <div>
            <span class="product-card-price">${formatCurrency(p.unitPrice, curr)}</span>
            <span class="product-card-unit">/${this.escape(this.unitText(p.unit || 'pcs'))}</span>
          </div>
          <div class="product-card-actions">
            <button class="btn btn-secondary btn-sm btn-add-prod-to-bill" data-id="${this.escape(p.id)}" title="${this.escape(this.t('catalog.addToBill'))}">
              ${this.escape(this.t('common.add'))}
            </button>
            <button class="btn btn-ghost btn-sm btn-icon btn-edit-product" data-id="${this.escape(p.id)}" title="${this.escape(this.t('catalog.editTitle'))}" aria-label="${this.escape(this.t('catalog.editTitle'))}">
              <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
            </button>
            <button class="btn btn-ghost btn-sm btn-icon btn-delete-product" data-id="${this.escape(p.id)}" title="${this.escape(this.t('catalog.deleteTitle'))}" aria-label="${this.escape(this.t('catalog.deleteTitle'))}" style="color: var(--danger);">
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
      btn.addEventListener('click', async () => {
        const remove = await this.confirm({
          title: this.t('confirm.deleteProduct'),
          confirmLabel: this.t('common.delete'),
          danger: true
        });
        if (!remove || !this.store(() => StorageService.deleteProduct(btn.dataset.id))) return;
        this.refreshHistoryData();
        this.renderProductGrid();
        this.renderCatalogView();
        this.showToast(this.t('toast.productDeleted'), 'info');
      });
    });
  }

  /** A product's category for display: the stored default 'General' in the app language */
  categoryLabel(category) {
    return !category || category === 'General' ? this.t('catalog.general') : category;
  }

  addProductToBill(product) {
    addProductLine(this.currentInvoice.items, product, 1);
    this.afterItemsChange();
  }

  openProductModal(product = null) {
    this.editingProductId = product ? product.id : null;

    document.getElementById('modal-product-title').textContent = this.t(product ? 'product.editTitle' : 'product.addTitle');
    document.getElementById('modal-prod-name').value = product ? product.name : '';
    // The default category is stored as 'General' (like statuses, in English); the field shows it empty
    document.getElementById('modal-prod-category').value = product && product.category !== 'General' ? product.category : '';
    document.getElementById('modal-prod-desc').value = product ? (product.description || '') : '';
    document.getElementById('modal-prod-price').value = product ? product.unitPrice : '';
    document.getElementById('modal-prod-sku').value = product ? (product.sku || '') : '';
    const units = document.getElementById('modal-prod-units');
    const unitField = document.getElementById('modal-prod-unit');
    units.innerHTML = this.unitChips();
    unitField.value = product ? (product.unit || 'pcs') : 'pcs';
    this.showUnitChoice(units, unitField, unitField.value);
    // A new product's unit follows its name until one is picked; a saved product keeps its unit
    this.productUnitPicked = Boolean(product);
    document.getElementById('modal-prod-unit-hint').hidden = true;
    this.productIcon = product ? product.icon : '';
    this.renderProductFace();

    this.openModal('modal-product');
    if (!COARSE_POINTER.matches) document.getElementById('modal-prod-name').focus();
  }

  saveProductFromModal() {
    const name = document.getElementById('modal-prod-name').value.trim();
    const category = document.getElementById('modal-prod-category').value.trim();
    const description = document.getElementById('modal-prod-desc').value.trim();
    const unitPrice = parseFloat(document.getElementById('modal-prod-price').value) || 0;
    const typedUnit = document.getElementById('modal-prod-unit').value.trim();
    const unit = unitInfo(typedUnit)?.code || typedUnit || 'pcs';
    const sku = document.getElementById('modal-prod-sku').value.trim();

    if (!name) {
      this.showToast(this.t('toast.productNameRequired'), 'warning');
      return;
    }

    const fields = { name, category, description, unitPrice, unit, sku, icon: this.productIcon };
    const saved = this.editingProductId
      ? this.store(() => StorageService.updateProduct(new Product({ id: this.editingProductId, ...fields })))
      : this.store(() => StorageService.addProduct(new Product(fields)));
    if (!saved) return;
    this.showToast(this.t(this.editingProductId ? 'toast.productUpdated' : 'toast.catalogAdded'), 'success');

    this.closeModal('modal-product');
    this.refreshHistoryData();
    this.renderProductGrid();
    this.renderCatalogView();
  }

  // --- Bills history ---
  bindHistoryEvents() {
    document.getElementById('history-search-input').addEventListener('input', () => this.renderHistoryView());
    document.getElementById('history-filter-status').addEventListener('change', () => this.renderHistoryView());
    document.getElementById('btn-export-csv').addEventListener('click', () => this.exportBillsCSV());
    // One listener for the buttons of every bill, since the list is redrawn often
    document.getElementById('view-history').addEventListener('click', (event) => {
      const button = event.target.closest('[data-bill-action]');
      if (button) this.onBillAction(button.dataset.billAction, button.dataset.id);
    });
  }

  /** Paid sales today and this month (by bill date), and what is still due */
  renderHistoryStats(invoices) {
    const today = todayISO();
    const month = today.slice(0, 7);
    const sum = list => list.reduce((total, inv) => total + inv.grandTotal, 0);
    const money = value => formatCurrency(value, this.settings.currency || '₹', 0);
    const paid = invoices.filter(inv => inv.status === 'Paid');
    const due = invoices.filter(inv => inv.status === 'Due');
    document.getElementById('stat-today').textContent = money(sum(paid.filter(inv => inv.date === today)));
    document.getElementById('stat-month').textContent = money(sum(paid.filter(inv => inv.date.startsWith(month))));
    document.getElementById('stat-due').textContent = money(sum(due));
    document.getElementById('stat-due-label').textContent = due.length === 0
      ? this.t('stats.dueNone')
      : this.t(due.length === 1 ? 'stats.dueOne' : 'stats.dueMany', { count: due.length });
  }

  renderHistoryView() {
    this.renderBackupStatus();
    const all = StorageService.getInvoices();
    this.renderHistoryStats(all);

    const list = this.shownBills(all);

    const tableBody = document.getElementById('history-table-body');
    const cards = document.getElementById('mobile-history-list');
    if (!list.length) {
      // No bills at all, or none that the search and filter let through
      const empty = all.length
        ? `${this.emptyArt('🔍', '🧾', '❔')}<p>${this.escape(this.t('history.empty'))}</p>`
        : `${this.emptyArt('🧾', '✨', '💰')}<p>${this.escape(this.t('history.emptyFirst'))}</p>`;
      tableBody.innerHTML = `<tr><td colspan="7" class="history-empty-cell">${empty}</td></tr>`;
      cards.innerHTML = `<div class="empty-box">${empty}</div>`;
      return;
    }

    const curr = this.settings.currency || '₹';
    const language = this.settings.appLanguage || 'en';
    const id = inv => this.escape(inv.id);
    const date = inv => this.escape(formatDate(inv.date, language));
    const items = inv => this.escape(this.t(inv.items.length === 1 ? 'bar.item' : 'bar.items', { count: inv.items.length }));
    const customer = inv => this.escape(inv.customer.name || this.t('common.walkIn'));
    const status = inv => `<span class="badge ${statusBadgeClass(inv.status)}">${STATUS_ICONS[inv.status] ? `<span aria-hidden="true">${STATUS_ICONS[inv.status]}</span> ` : ''}${this.escape(statusLabel(this.ui.t, inv.status))}</span>`;
    const payBy = inv => (inv.status === 'Due' && inv.dueDate
      ? `<div class="history-due">${this.escape(this.t('history.payBy', { date: formatDate(inv.dueDate, language) }))}</div>`
      : '');
    const action = (name, inv, label, style, icon = '') => `<button type="button" class="btn btn-sm ${style}" data-bill-action="${name}" data-id="${id(inv)}">${icon ? `<span aria-hidden="true">${icon}</span> ` : ''}${this.escape(label)}</button>`;
    const removeButton = inv => `<button type="button" class="btn btn-ghost btn-sm btn-icon btn-delete" data-bill-action="delete" data-id="${id(inv)}" title="${this.escape(this.t('history.delete'))}" aria-label="${this.escape(this.t('history.delete'))}">${TRASH_ICON}</button>`;
    const dueActions = inv => (inv.status === 'Due'
      ? action('paid', inv, this.t('history.markPaid'), 'btn-success', '✅') + action('qr', inv, this.t('history.payQr'), 'btn-secondary', '📲')
        + action('remind', inv, this.t('history.remind'), 'btn-secondary', '🔔')
      : '');

    tableBody.innerHTML = list.map(inv => `
      <tr>
        <td class="history-number">${this.escape(inv.invoiceNumber)}</td>
        <td class="history-date">${date(inv)}${payBy(inv)}</td>
        <td>
          <div class="history-customer">${customer(inv)}</div>
          ${inv.customer.phone ? `<small class="history-phone">${this.escape(inv.customer.phone)}</small>` : ''}
        </td>
        <td class="history-items">${items(inv)}</td>
        <td class="history-total">${formatCurrency(inv.grandTotal, curr)}</td>
        <td>${status(inv)}</td>
        <td><div class="history-row-actions">
          ${action('open', inv, this.t('history.open'), 'btn-secondary')}
          ${action('repeat', inv, this.t('history.repeat'), 'btn-ghost', '🔁')}
          ${dueActions(inv)}
          ${removeButton(inv)}
        </div></td>
      </tr>
    `).join('');

    cards.innerHTML = list.map(inv => `
      <div class="history-bill-card">
        <div class="history-bill-card-top">
          <span class="history-bill-number">${this.escape(inv.invoiceNumber)}</span>
          ${status(inv)}
        </div>
        <div class="history-bill-customer">${customer(inv)}</div>
        <div class="history-bill-meta">${date(inv)} &bull; ${items(inv)}</div>
        ${payBy(inv)}
        <div class="history-bill-details-row">
          <span class="history-bill-meta">${this.escape(this.t('history.grandTotal'))}</span>
          <span class="history-bill-amount">${formatCurrency(inv.grandTotal, curr)}</span>
        </div>
        ${inv.status === 'Due' ? `<div class="history-bill-actions history-due-actions">${dueActions(inv)}</div>` : ''}
        <div class="history-bill-actions">
          ${action('open', inv, this.t('history.openBill'), 'btn-primary history-open')}
          ${action('repeat', inv, this.t('history.repeat'), 'btn-secondary', '🔁')}
          ${removeButton(inv)}
        </div>
      </div>
    `).join('');
  }

  /** The bills that History's status filter and search let through */
  shownBills(all = StorageService.getInvoices()) {
    const filter = document.getElementById('history-filter-status').value;
    const query = document.getElementById('history-search-input').value.trim().toLowerCase();
    return all.filter(inv => (filter === 'all' || inv.status.toLowerCase() === filter)
      && (!query || [inv.invoiceNumber, inv.customer.name, inv.customer.phone].some(text => String(text || '').toLowerCase().includes(query))));
  }

  /** The bills shown in History as a spreadsheet file (CSV), for Excel or an accountant */
  async exportBillsCSV() {
    const bills = this.shownBills();
    if (!bills.length) {
      this.showToast(this.t('toast.csvEmpty'), 'info');
      return;
    }
    const csv = invoicesToCSV(bills, { t: this.t.bind(this), statusLabel });
    const result = await ExporterService.deliverFile(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `billcraft-bills-${todayISO()}.csv`);
    if (result.status === 'needs-tap') {
      this.showToast(this.t('toast.fileReady'), 'success', { label: this.t('action.share'), onClick: () => result.share().catch(() => {}) }, 15000);
    } else if (result.status !== 'cancelled') {
      this.showToast(this.t('toast.csvReady'), 'success');
    }
  }

  /** The buttons on a saved bill: open, repeat, delete, mark paid, remind */
  async onBillAction(action, id) {
    const inv = StorageService.getInvoiceById(id);
    if (!inv) return;
    if (action === 'open') {
      this.openBill(inv, STEP_COUNT);
      this.showToast(this.t('toast.billOpened', { number: inv.invoiceNumber }), 'info');
    } else if (action === 'repeat') {
      const nextNum = this.nextBillNumber(todayISO());
      this.openBill(new Invoice({
        ...inv,
        id: newId('inv'),
        invoiceNumber: nextNum,
        numberAuto: true,
        date: todayISO(),
        dueDate: '',
        status: 'Paid',
        items: inv.items.map(({ id: lineId, ...item }) => item), // fresh line ids
        createdAt: new Date().toISOString()
      }), STEP_COUNT);
      this.showToast(this.t('toast.repeated', { number: nextNum }), 'success');
    } else if (action === 'delete') {
      const remove = await this.confirm({ title: this.t('confirm.deleteBill'), confirmLabel: this.t('common.delete'), danger: true });
      if (!remove || !this.store(() => StorageService.deleteInvoice(id))) return;
      this.refreshHistoryData();
      this.renderHistoryView();
      this.updateBadges();
      this.showToast(this.t('toast.billDeleted'), 'info');
    } else if (action === 'paid') {
      this.setBillStatus(inv, 'Paid', true);
    } else if (action === 'remind') {
      ExporterService.sendReminder(inv, this.settings, this.bill);
    } else if (action === 'qr') {
      this.openPaymentSheet(inv, false);
    }
  }

  /** Changes a saved bill's status (with Undo when asked). The bill open in the builder follows. */
  setBillStatus(invoice, status, offerUndo) {
    const before = invoice.status;
    invoice.status = status;
    if (!this.store(() => StorageService.saveInvoice(invoice))) return;
    if (this.currentInvoice.id === invoice.id) {
      this.currentInvoice.status = status;
      this.renderStatusToggle();
      this.schedulePreview();
      this.saveDraft();
    }
    this.renderHistoryView();
    if (offerUndo) {
      this.showToast(this.t('toast.markedPaid', { number: invoice.invoiceNumber }), 'success', {
        label: this.t('common.undo'),
        onClick: () => this.setBillStatus(invoice, before, false)
      });
    }
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
        this.saveSettings();
      });
    });

    // Bill number format: saved at once; the examples follow the shop code as it is typed
    document.getElementById('bill-format-choices').addEventListener('click', (event) => {
      const card = event.target.closest('[data-bill-format]');
      if (!card) return;
      this.settings.billFormat = card.dataset.billFormat;
      this.saveSettings();
      this.renumberIfAutomatic();
      this.saveDraft();
      this.renderBillFormatChoices();
    });
    document.getElementById('settings-bill-code').addEventListener('input', () => this.renderBillFormatChoices());

    const templateCards = document.querySelectorAll('.template-card-choice');
    templateCards.forEach(card => {
      card.addEventListener('click', () => {
        templateCards.forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        this.settings.defaultTemplate = card.dataset.template;
        this.saveSettings();
      });
    });

    document.getElementById('settings-qr-upload').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      try {
        this.settings.qrCustomImage = await shrinkImage(file);
      } catch {
        this.showToast(this.t('toast.imageInvalid'), 'warning');
        return;
      }
      this.saveSettings();
      this.renderSettingsQrPreview();
      this.schedulePreview();
    });

    // The preview follows the UPI ID, shop name and currency as they are typed
    ['settings-upi', 'settings-brand-name', 'settings-currency'].forEach(id => {
      document.getElementById(id).addEventListener('input', () => {
        if (id === 'settings-upi') this.showFieldError('settings-upi', false);
        this.renderSettingsQrPreview();
      });
    });

    document.getElementById('btn-clear-custom-qr').addEventListener('click', () => {
      this.settings.qrCustomImage = '';
      this.saveSettings();
      this.renderSettingsQrPreview();
      this.schedulePreview();
      this.showToast(this.t('toast.qrReset'), 'info');
    });

    document.getElementById('btn-export-backup').addEventListener('click', () => this.exportBackup());
    document.getElementById('btn-backup-now').addEventListener('click', () => this.exportBackup());

    document.getElementById('input-import-backup').addEventListener('change', (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (file) this.restoreBackup(file);
    });
  }

  /** Saves every product, bill and setting to a file, and remembers when */
  async exportBackup() {
    const json = StorageService.exportBackupJSON(APP_VERSION);
    const result = await ExporterService.deliverFile(new Blob([json], { type: 'application/json' }), `billcraft-backup-${todayISO()}.json`);
    if (result.status === 'cancelled') return;
    if (result.status === 'needs-tap') {
      this.showToast(this.t('toast.fileReady'), 'success', { label: this.t('action.share'), onClick: () => result.share().catch(() => {}) }, 15000);
      return;
    }
    this.settings.lastBackupAt = new Date().toISOString();
    this.saveSettings();
    this.renderBackupStatus();
    this.showToast(this.t('toast.backupDone'), 'success');
  }

  /**
   * Restores a backup file: checked completely first, then confirmed with what will be
   * replaced. Undo puts back exactly what was there.
   */
  async restoreBackup(file) {
    let backup;
    try {
      if (file.size > MAX_BACKUP_BYTES) throw new BackupError('not-backup');
      backup = parseBackup(await file.text());
    } catch (error) {
      const newer = error instanceof BackupError && error.reason === 'newer';
      this.showToast(this.t(newer ? 'toast.restoreNewer' : 'toast.restoreFailed'), 'danger');
      return;
    }

    const here = { bills: StorageService.getInvoices().length, products: StorageService.getCatalog().length };
    const replace = await this.confirm({
      title: this.t('restore.title'),
      message: this.t('restore.message', {
        currentBills: here.bills,
        currentProducts: here.products,
        bills: backup.invoices ? backup.invoices.length : here.bills,
        products: backup.catalog ? backup.catalog.length : here.products
      }),
      confirmLabel: this.t('restore.confirm'),
      danger: true
    });
    if (!replace) return;

    const before = StorageService.snapshot();
    if (!this.store(() => StorageService.applyBackup(backup))) {
      this.store(() => StorageService.restoreSnapshot(before));
      return;
    }
    await this.reloadFromStorage();
    this.showToast(this.t('toast.restoreDone'), 'success', {
      label: this.t('common.undo'),
      onClick: async () => {
        if (this.store(() => StorageService.restoreSnapshot(before))) await this.reloadFromStorage();
      }
    });
  }

  /** After a restore (or its undo): settings, products and bills are read again */
  async reloadFromStorage() {
    this.settings = StorageService.getSettings();
    this.currentInvoice = this.openingBill();
    this.refreshHistoryData();
    await this.loadTranslators();
    this.refreshAll();
  }

  /**
   * True when bills exist that no backup file holds yet: three or more and never backed
   * up, or any made since a backup that is over a week old
   */
  needsBackup() {
    const last = Date.parse(this.settings.lastBackupAt) || 0;
    const unsaved = StorageService.getInvoices().filter(inv => (Date.parse(inv.createdAt) || 0) > last).length;
    if (!last) return unsaved >= 3;
    return unsaved > 0 && Date.now() - last > 7 * 24 * 60 * 60 * 1000;
  }

  /** The reminder in History, and the date of the last backup in Settings */
  renderBackupStatus() {
    document.getElementById('backup-banner').hidden = !this.needsBackup();
    const last = this.settings.lastBackupAt;
    document.getElementById('backup-last').textContent = last
      ? this.t('backup.last', { date: formatDate(last, this.settings.appLanguage || 'en') })
      : this.t('backup.never');
  }

  /** The QR code the bills will carry, from the fields as typed (before Save) */
  renderSettingsQrPreview() {
    const previewBox = document.getElementById('settings-qr-preview');
    const upiId = document.getElementById('settings-upi').value.trim();
    const brandName = document.getElementById('settings-brand-name').value.trim();
    const currency = document.getElementById('settings-currency').value;
    const note = key => `<span class="muted-note">${this.escape(this.t(key))}</span>`;
    const image = src => `<img src="${this.escape(src)}" alt="" style="width: 100%; height: 100%; object-fit: contain;" />`;

    if (safeImageSrc(this.settings.qrCustomImage)) {
      previewBox.innerHTML = image(safeImageSrc(this.settings.qrCustomImage));
    } else if (currency !== '₹') {
      previewBox.innerHTML = note('settings.upiRupeesOnly');
    } else if (!upiId) {
      previewBox.innerHTML = note('settings.enterUpi');
    } else if (!isValidUpiId(upiId)) {
      previewBox.innerHTML = note('settings.upiInvalid');
    } else {
      previewBox.innerHTML = image(generateQRCodeURL(buildUPIString({ upiId, brandName, amount: 0, invoiceNumber: '' })));
    }
  }

  /** Settings → Bill numbers: each format's next number, and what the chosen one means */
  renderBillFormatChoices() {
    const field = document.getElementById('settings-bill-code');
    const derived = shopCode(document.getElementById('settings-brand-name').value || this.settings.brandName);
    const code = normalizeShopCode(field.value) || derived;
    field.placeholder = derived;
    const today = todayISO();
    document.querySelectorAll('[data-bill-format]').forEach(card => {
      const format = card.dataset.billFormat;
      card.setAttribute('aria-checked', String(format === this.settings.billFormat));
      card.querySelector('[data-example]').textContent = StorageService.nextBillNumber(format, code, today);
    });
    const next = StorageService.nextBillNumber(this.settings.billFormat, code, today);
    document.getElementById('bill-format-meaning').textContent = `${this.t('settings.nextBill', { number: next })} · ${this.describeBillNumber(next)}`;
  }

  /** Marks a field as wrong (or clears the mark), showing the reason in its "-error" element */
  showFieldError(fieldId, invalid) {
    document.getElementById(fieldId).setAttribute('aria-invalid', String(invalid));
    document.getElementById(`${fieldId}-error`).hidden = !invalid;
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
    document.getElementById('settings-bill-code').value = this.settings.billCode;
    this.renderBillFormatChoices();
    document.getElementById('settings-app-language').value = this.settings.appLanguage || DEFAULT_LANGUAGE;
    document.getElementById('settings-bill-language').value = this.settings.billLanguage || '';

    document.querySelectorAll('.color-swatch').forEach(sw => {
      sw.classList.toggle('active', sw.dataset.color === this.settings.themeAccent);
    });

    document.querySelectorAll('.template-card-choice').forEach(card => {
      card.classList.toggle('selected', card.dataset.template === (this.settings.defaultTemplate || 'modern'));
    });

    this.showFieldError('settings-upi', false);
    this.renderSettingsQrPreview();
    this.renderBackupStatus();
    this.renderAppCard();
  }

  async saveSettingsFromForm() {
    // A malformed UPI ID would put a QR code on every bill that cannot be paid
    const upiField = document.getElementById('settings-upi');
    const upiId = upiField.value.trim();
    if (upiId && !isValidUpiId(upiId)) {
      this.showFieldError('settings-upi', true);
      upiField.focus();
      this.showToast(this.t('settings.upiInvalid'), 'warning');
      return;
    }

    this.settings.sellerName = document.getElementById('settings-seller-name').value.trim();
    this.settings.brandName = document.getElementById('settings-brand-name').value.trim();
    this.settings.tagline = document.getElementById('settings-tagline').value.trim();
    this.settings.phone = document.getElementById('settings-phone').value.trim();
    this.settings.email = document.getElementById('settings-email').value.trim();
    this.settings.address = document.getElementById('settings-address').value.trim();
    this.settings.currency = document.getElementById('settings-currency').value.trim() || '₹';
    this.settings.upiId = upiId;
    this.settings.paymentNotes = document.getElementById('settings-payment-note').value.trim();
    this.settings.defaultNotes = document.getElementById('settings-default-notes').value.trim();
    this.settings.appLanguage = document.getElementById('settings-app-language').value;
    this.settings.billLanguage = document.getElementById('settings-bill-language').value;
    this.settings.billCode = normalizeShopCode(document.getElementById('settings-bill-code').value);

    if (!this.saveSettings()) return;
    // A new shop code (or shop name) gives a bill not yet saved its new number
    this.renumberIfAutomatic();
    this.saveDraft();
    await this.loadTranslators();
    this.refreshAll();
    this.showToast(this.t('toast.settingsSaved'), 'success');
  }

  // --- Saving ---

  /** Runs a storage write. When the browser's storage is full it says so (not more than every 15 s) and returns false. */
  store(write) {
    try {
      write();
      return true;
    } catch (error) {
      if (!(error instanceof StorageFullError)) throw error;
      if (Date.now() - (this.storageWarnedAt || 0) > 15000) {
        this.storageWarnedAt = Date.now();
        this.showToast(this.t('toast.storageFull'), 'danger');
      }
      return false;
    }
  }

  saveSettings() {
    return this.store(() => StorageService.saveSettings(this.settings));
  }

  /** The bill being made is kept as a draft after every change, so nothing is lost if the app closes */
  saveDraft() {
    this.updateClearButton();
    return this.store(() => StorageService.saveActiveDraft(this.currentInvoice));
  }

  /**
   * A yes/no question in the app's own dialog and language (the browser's confirm()
   * shows OK and Cancel in the browser's language). Resolves true for yes.
   */
  confirm({ title, message = '', confirmLabel, danger = false }) {
    this.settleConfirm(false); // a question still open is answered "no"
    document.getElementById('confirm-title').textContent = title;
    const text = document.getElementById('confirm-message');
    text.textContent = message;
    text.hidden = !message;
    const ok = document.getElementById('btn-confirm-ok');
    ok.textContent = confirmLabel;
    ok.className = `btn ${danger ? 'btn-danger' : 'btn-primary'}`;
    this.openModal('modal-confirm');
    return new Promise(resolve => {
      this.confirmAnswer = resolve;
    });
  }

  settleConfirm(answer) {
    const resolve = this.confirmAnswer;
    if (!resolve) return;
    this.confirmAnswer = null;
    this.closeModal('modal-confirm');
    resolve(answer);
  }

  // --- Dialogs ---
  bindModalEvents() {
    document.getElementById('btn-confirm-ok').addEventListener('click', () => this.settleConfirm(true));
    document.getElementById('btn-confirm-cancel').addEventListener('click', () => this.settleConfirm(false));

    document.querySelectorAll('.btn-close-modal').forEach(btn => {
      btn.addEventListener('click', () => this.dismissModal(btn.closest('.modal-overlay').id));
    });

    // A tap outside dismisses a dialog, except the shop setup, which has its own Skip
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (event) => {
        if (event.target === overlay && overlay.id !== 'modal-setup') this.dismissModal(overlay.id);
      });
    });

    document.addEventListener('keydown', (event) => {
      const top = [...document.querySelectorAll('.modal-overlay.active')].at(-1);
      if (!top) return;
      if (event.key === 'Tab') {
        this.keepFocusIn(top, event);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        this.dismissModal(top.id);
      }
    });
  }

  /** Tab and Shift+Tab go round inside the open dialog, as in the browser's own dialogs */
  keepFocusIn(overlay, event) {
    const box = overlay.querySelector('.modal-box');
    const stops = [...box.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])')]
      .filter(el => el.getClientRects().length > 0);
    if (!stops.length) {
      event.preventDefault();
      return;
    }
    const current = document.activeElement;
    const first = stops[0];
    const last = stops[stops.length - 1];
    const outside = !box.contains(current) || current === box;
    if (event.shiftKey && (current === first || outside)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (current === last || (outside && current !== box))) {
      event.preventDefault();
      first.focus();
    }
  }

  /** What Escape, a tap outside and the close button do */
  dismissModal(modalId) {
    if (modalId === 'modal-confirm') {
      this.settleConfirm(false);
    } else if (modalId === 'modal-setup') {
      this.finishSetup(false);
    } else if (modalId !== 'modal-language' || this.settings.appLanguage) {
      // On the first run a language must be chosen
      this.closeModal(modalId);
    }
  }

  /**
   * Shows a dialog: it takes focus (not its first field, so the phone keypad stays
   * closed), the app behind it is inert, and focus returns when it closes.
   */
  openModal(modalId) {
    const overlay = document.getElementById(modalId);
    if (!overlay.classList.contains('active')) {
      this.modalOpeners.set(modalId, document.activeElement);
      overlay.classList.add('active');
    }
    this.syncInert();
    overlay.querySelector('.modal-box').focus({ preventScroll: true });
  }

  closeModal(modalId) {
    const overlay = document.getElementById(modalId);
    if (!overlay.classList.contains('active')) return;
    overlay.classList.remove('active');
    this.syncInert();
    const opener = this.modalOpeners.get(modalId);
    this.modalOpeners.delete(modalId);
    const top = [...document.querySelectorAll('.modal-overlay.active')].at(-1);
    if (top) {
      (opener?.isConnected && top.contains(opener) ? opener : top.querySelector('.modal-box')).focus({ preventScroll: true });
    } else if (opener && opener.isConnected) {
      opener.focus({ preventScroll: true });
    }
  }

  /** Only the top dialog can be reached; the app and any dialog under it are inert */
  syncInert() {
    const open = [...document.querySelectorAll('.modal-overlay.active')];
    document.querySelector('.app-container').inert = open.length > 0;
    document.querySelector('.skip-link').inert = open.length > 0;
    open.forEach((overlay, index) => {
      overlay.inert = index < open.length - 1;
    });
  }

  updateBadges() {
    document.getElementById('nav-history-badge').textContent = StorageService.getInvoices().length;
  }

  /**
   * Shows a short notice. `action` ({ label, onClick }) adds a button and keeps the
   * notice longer; `duration` (ms) overrides how long it stays. The countdown pauses while the page is hidden (for example while
   * WhatsApp is open), so the button is still there when the user comes back.
   */
  showToast(message, type = 'info', action = null, duration = action ? 6000 : 3000) {
    const container = document.getElementById('toast-container');

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icon = document.createElement('span');
    icon.className = 'toast-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = TOAST_ICONS[type] || TOAST_ICONS.info;
    toast.appendChild(icon);
    const text = document.createElement('span');
    text.textContent = message;
    toast.appendChild(text);

    let timer = 0;
    let startedAt = 0;
    let remaining = duration;
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

  /** Escapes any value placed into markup (see js/safe.js) */
  escape(value) {
    return escapeHTML(value);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // A failure here (for example a browser that blocks site storage) shows the start-up message
  const failed = (error) => {
    console.error('BillCraft failed to start', error);
    document.documentElement.classList.add('app-failed');
  };
  try {
    window.app = new BillCraftApp();
    window.app.start().catch(failed);
  } catch (error) {
    failed(error);
  }
});
