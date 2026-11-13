/**
 * Browser tests: the main journeys in headless Chrome. Run with: npm run e2e
 *
 * Uses only Node and an installed Chrome or Chromium (set CHROME_PATH if it is
 * not found; without one the run is skipped). Each check prints PASS or FAIL,
 * and the run fails if any check fails. QR codes are decoded with Chrome's
 * BarcodeDetector where the platform has one (macOS, Android); elsewhere that
 * check is reported as skipped.
 */
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createAppServer } from '../../scripts/serve.mjs';
import { packageSite } from '../../scripts/package-site.mjs';
import { findChrome, launchChrome, sleep } from './chrome.mjs';

if (!findChrome()) {
  console.log('Chrome was not found, so the browser tests were skipped. Set CHROME_PATH to run them.');
  process.exit(0);
}

const server = createAppServer();
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const APP = `http://127.0.0.1:${server.address().port}/`;

const results = [];
function check(label, ok, detail = '') {
  results.push({ label, ok: Boolean(ok) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail ? `  (${detail})` : ''}`);
}
const skip = (label, why) => console.log(`SKIP  ${label}  (${why})`);

const SHOP = { appLanguage: 'en', brandName: 'Asha Candles', sellerName: 'Asha', phone: '98765 43210', upiId: 'asha.candles@okaxis', setupDone: true };
const PRODUCTS = [
  { id: 'prod_candle', name: 'Soy candle', unitPrice: 450, unit: 'pcs' },
  { id: 'prod_honey', name: 'Forest honey', unitPrice: 380, unit: 'jar' },
  { id: 'prod_dal', name: 'Toor dal', unitPrice: 140, unit: 'kg' }
];
// numberAuto: false keeps these numbers as typed (an automatic number follows the shop code and date)
const DRAFT = { id: 'inv_test', invoiceNumber: 'BILL-001', numberAuto: false, date: '2026-11-03', status: 'Paid', customer: { name: 'Meera', phone: '99123 45678' }, items: [{ id: 'l1', name: 'Soy candle', quantity: 3, unitPrice: 450 }] };

/** A fresh browser with helpers for the app */
async function openBrowser() {
  const chrome = await launchChrome();
  const { send, evaluate } = chrome;
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: "window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI));"
  });
  const page = {
    chrome,
    send,
    evaluate,
    async size(width, height = 900) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 800 });
      await send('Emulation.setTouchEmulationEnabled', { enabled: width < 1024, maxTouchPoints: 5 });
    },
    /** Waits for a new page (not the one being left) with the app started */
    async settle() {
      for (let i = 0; i < 150; i++) {
        await sleep(100);
        const ready = await evaluate("window.__oldPage === undefined && Boolean(window.app && window.app.ui) && document.readyState === 'complete'").catch(() => false);
        if (ready) break;
      }
      await sleep(300);
    },
    async go(query = '') {
      await evaluate('window.__oldPage = true').catch(() => {});
      await send('Page.navigate', { url: `${APP}${query}` });
      await page.settle();
    },
    async reload() {
      await evaluate('window.__oldPage = true').catch(() => {});
      await send('Page.reload');
      await page.settle();
    },
    /** Opens the app with this data stored (keys without the billcraft_ prefix) */
    async start(data = {}, query = '') {
      await page.go(query);
      await evaluate(`(() => {
        localStorage.clear();
        for (const [key, value] of Object.entries(${JSON.stringify(data)})) localStorage.setItem('billcraft_' + key, JSON.stringify(value));
      })()`);
      await page.reload();
    },
    click: selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`),
    async type(selector, value) {
      await evaluate(`{
        const field = document.querySelector(${JSON.stringify(selector)});
        field.value = ${JSON.stringify(value)};
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.dispatchEvent(new Event('change', { bubbles: true }));
      }`);
    },
    isOpen: id => evaluate(`document.getElementById('${id}').classList.contains('active')`),
    /** The message of the newest notice (after its icon) */
    lastToast: () => evaluate("[...document.querySelectorAll('.toast')].at(-1)?.querySelector('span:not(.toast-icon)')?.textContent || ''"),
    /** The chip of a choice row (units, delivery, discount) whose data-choice is `choice` */
    chip: (row, choice) => `${row} .choice-chip[data-choice="${choice}"]`,
    checked: row => evaluate(`document.querySelector('${row} .choice-chip[aria-checked="true"]')?.dataset.choice ?? 'other'`),
    /** Runs `action` in the page and returns the file it would save: { name, type, bytes (base64), text } */
    catchFile: action => evaluate(`(async () => {
      const files = [];
      const realCreate = URL.createObjectURL;
      const realClick = HTMLAnchorElement.prototype.click;
      URL.createObjectURL = blob => { files.push(blob); return realCreate.call(URL, blob); };
      HTMLAnchorElement.prototype.click = function () { window.__savedName = this.download; };
      navigator.canShare = () => false;
      try { ${action} } finally {
        URL.createObjectURL = realCreate;
        HTMLAnchorElement.prototype.click = realClick;
      }
      const blob = files.at(-1);
      if (!blob) return null;
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = '';
      for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return { name: window.__savedName, type: blob.type, size: bytes.length, bytes: btoa(binary), text: blob.type.startsWith('image') ? '' : new TextDecoder().decode(bytes) };
    })()`),
    async problems() {
      const csp = await evaluate('window.__csp || []').catch(() => []);
      return [...chrome.issues.filter(issue => !issue.includes('Export failed')), ...csp.map(v => `CSP: ${v}`)];
    },
    close: () => chrome.close()
  };
  return page;
}

const decodeQR = (page, selector) => page.evaluate(`(async () => {
  if (!('BarcodeDetector' in window)) return null;
  const img = document.querySelector(${JSON.stringify(selector)});
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 600;
  canvas.getContext('2d').drawImage(img, 0, 0, 600, 600);
  const codes = await new BarcodeDetector({ formats: ['qr_code'] }).detect(canvas);
  return codes.length ? codes[0].rawValue : '';
})()`);

const pngWidth = base64 => Buffer.from(base64, 'base64').readUInt32BE(16);
const pdfPages = base64 => (Buffer.from(base64, 'base64').toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;

async function journey(name, run) {
  console.log(`\n${name}`);
  const page = await openBrowser();
  try {
    await run(page);
    const problems = await page.problems();
    check(`${name}: no console errors or blocked content`, problems.length === 0, problems.slice(0, 3).join(' | '));
  } catch (error) {
    check(`${name}: finished`, false, error.message);
  } finally {
    await page.close();
  }
}

await journey('First bill on a phone, from a new install', async (page) => {
  await page.size(375, 812);
  await page.go();
  check('the language is asked first', await page.isOpen('modal-language'));
  await page.click('.lang-option[data-lang="en"]');
  await sleep(600);
  check('then the shop', await page.isOpen('modal-setup'));
  await page.type('#setup-shop', 'Asha Candles');
  await page.type('#setup-phone', '98765 43210');
  await page.type('#setup-upi', 'asha.candles@okaxis');
  await page.click('#form-setup button[type="submit"]');
  await sleep(400);
  check('no made-up products or bills', await page.evaluate("!localStorage.getItem('billcraft_catalog') && !localStorage.getItem('billcraft_invoices')"));
  await page.click('#product-grid [data-add-product]');
  await sleep(300);
  await page.type('#modal-prod-name', 'Soy candle');
  await page.type('#modal-prod-price', '450');
  await page.click('#btn-save-modal-product');
  await sleep(400);
  await page.click('#product-grid [data-product-id]');
  await page.click('#product-grid [data-product-id]');
  await sleep(500);
  check('two taps make 2 of the product', (await page.evaluate("document.getElementById('bar-count').textContent")) === '1 item'
    && (await page.evaluate('window.app.currentInvoice.items[0].quantity')) === 2);
  await page.click('#btn-step-next');
  await sleep(500);
  await page.evaluate('window.open = url => { window.__opened = url; }');
  await page.click('#btn-send-whatsapp');
  await sleep(500);
  const opened = decodeURIComponent(await page.evaluate("window.__opened || ''"));
  check('Send opens WhatsApp with the bill and its total', opened.startsWith('https://wa.me/?text=') && opened.includes('₹ 900.00'), opened.slice(0, 60));
  check('and the bill is in History', (await page.evaluate("JSON.parse(localStorage.getItem('billcraft_invoices')).length")) === 1);
  check('the notice offers the next bill', (await page.evaluate("[...document.querySelectorAll('.toast-action')].at(-1).textContent")) === '+ New Bill');
});

await journey('Weighed items and the payment QR code', async (page) => {
  await page.size(1280);
  await page.start({ settings: SHOP, catalog: PRODUCTS });
  await page.click('#product-grid [data-product-id="prod_dal"]');
  await sleep(400);
  check('a kg product asks how much', await page.isOpen('modal-qty'));
  await page.click('#qty-presets [data-qty="0.5"]');
  await sleep(400);
  check('0.5 kg of ₹140 is ₹70', (await page.evaluate("document.querySelector('#mobile-items-list .line-total').textContent")) === '₹ 70.00');
  const number = await page.evaluate('window.app.currentInvoice.invoiceNumber');
  check('a new bill is numbered by shop and month', /^AC-\d{4}-001$/.test(number), number);
  const decoded = await decodeQR(page, '#invoice-render-target img');
  if (decoded === null) {
    skip('the QR code on the bill pays the shop exactly', 'no BarcodeDetector on this platform');
  } else {
    check('the QR code on the bill pays the shop exactly', decoded === `upi://pay?pa=asha.candles@okaxis&pn=Asha%20Candles&am=70.00&cu=INR&tn=Bill%20${number}`, decoded);
  }
});

await journey('Exports, print and long bills', async (page) => {
  await page.size(375, 812);
  await page.start({ settings: SHOP, active_draft: DRAFT });
  await page.evaluate('window.app.setStep(2)');
  const phonePng = await page.catchFile("await window.app.exportBill('png');");
  await page.size(1280);
  await page.start({ settings: SHOP, active_draft: { ...DRAFT, id: 'inv_test2', invoiceNumber: 'BILL-002' } });
  const desktopPng = await page.catchFile("await window.app.exportBill('png');");
  check('an image is A4 width from a phone and from a computer', pngWidth(phonePng.bytes) === 1588 && pngWidth(desktopPng.bytes) === 1588);
  const pdf = await page.catchFile("await window.app.exportBill('pdf');");
  check('a one-page PDF is small', pdf.type === 'application/pdf' && pdf.size < 600 * 1024 && pdfPages(pdf.bytes) === 1, `${Math.round(pdf.size / 1024)} KB`);
  const items = Array.from({ length: 45 }, (_, i) => ({ id: `x${i}`, name: `Product ${i + 1}`, quantity: i + 1, unitPrice: 10 + i }));
  await page.start({ settings: SHOP, active_draft: { ...DRAFT, id: 'inv_long', invoiceNumber: 'INV/26/9', items } });
  const long = await page.catchFile("await window.app.exportBill('pdf');");
  check('a 45-item bill becomes several pages, named after the bill', pdfPages(long.bytes) >= 2 && long.name === 'INV-26-9.pdf', `${pdfPages(long.bytes)} pages, ${long.name}`);

  await page.send('Emulation.setEmulatedMedia', { media: 'print' });
  const printed = await page.evaluate(`(() => {
    const shown = selector => [...document.querySelectorAll(selector)].some(el => getComputedStyle(el).display !== 'none' && el.getClientRects().length);
    return {
      chrome: ['.app-sidebar', '.app-topbar', '.bill-form-panel', '.preview-actions-bar', '.step-nav', '.toast-container', '.modal-overlay', '.boot-error'].filter(shown),
      bill: shown('#active-invoice-doc')
    };
  })()`);
  check('print shows only the bill', printed.bill && printed.chrome.length === 0, printed.chrome.join(', '));
  await page.send('Emulation.setEmulatedMedia', { media: '' });
});

await journey('Dialogs, keyboard and screen readers', async (page) => {
  await page.size(1280);
  await page.start({ settings: SHOP, catalog: PRODUCTS });
  await page.evaluate("window.app.switchView('catalog')");
  await sleep(200);
  await page.evaluate("document.getElementById('btn-new-product').focus(); document.getElementById('btn-new-product').click()");
  await sleep(300);
  check('a dialog takes focus and the app behind is inert', (await page.evaluate("document.activeElement.id")) === 'modal-prod-name' && await page.evaluate("document.querySelector('.app-container').inert"));
  await page.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await sleep(200);
  check('Escape closes it and focus goes back', !(await page.isOpen('modal-product')) && (await page.evaluate("document.activeElement.id")) === 'btn-new-product');
  await page.evaluate("window.app.switchView('builder')");
  await sleep(200);
  await page.click('#product-grid [data-product-id="prod_candle"]');
  await sleep(800);
  check('screen readers hear what was added', (await page.evaluate("document.getElementById('sr-status').textContent")) === 'Soy candle added. Bill now: 1 item, ₹ 450.00.');
});

await journey('Backups, History and the spreadsheet', async (page) => {
  await page.size(1280);
  const invoices = [
    { id: 'due', invoiceNumber: 'BILL-002', date: '2026-11-03', status: 'Due', dueDate: '2026-11-10', customer: { name: 'Meera', phone: '99123 45678' }, items: [{ name: 'Candle', quantity: 2, unitPrice: 450 }] },
    { id: 'paid', invoiceNumber: 'BILL-001', date: '2026-11-02', status: 'Paid', customer: {}, items: [{ name: 'Honey', quantity: 1, unitPrice: 380 }] }
  ];
  await page.start({ settings: SHOP, catalog: PRODUCTS, invoices });
  await page.evaluate("window.app.switchView('history')");
  await sleep(300);
  const reminder = decodeURIComponent(await page.evaluate("(() => { let url = ''; window.open = u => { url = u; }; document.querySelector('#history-table-body [data-bill-action=\"remind\"]').click(); return url; })()"));
  check('Remind writes to the customer about what is due', reminder.startsWith('https://wa.me/919912345678?text=') && reminder.includes('Please pay by 10 Nov 2026.'), reminder.slice(0, 50));
  await page.click('#history-table-body [data-bill-action="paid"]');
  await sleep(300);
  check('Mark paid saves the bill as Paid', (await page.evaluate("JSON.parse(localStorage.getItem('billcraft_invoices')).find(i => i.id === 'due').status")) === 'Paid');
  const csv = await page.catchFile("await window.app.exportBillsCSV();");
  check('the spreadsheet lists the bills', csv.text.replace(/^﻿/, '').trimEnd().split('\r\n').length === 3 && csv.name.endsWith('.csv'));

  const backup = await page.catchFile("await window.app.exportBackup();");
  const restore = json => page.evaluate(`(() => {
    const input = document.getElementById('input-import-backup');
    const files = new DataTransfer();
    files.items.add(new File([${JSON.stringify(json)}], 'backup.json', { type: 'application/json' }));
    input.files = files.files;
    input.dispatchEvent(new Event('change'));
  })()`);
  await page.evaluate("localStorage.setItem('billcraft_invoices', '[]'); window.app.switchView('settings')");
  await restore(backup.text);
  await sleep(500);
  check('restoring asks first', await page.isOpen('modal-confirm'));
  await page.click('#btn-confirm-ok');
  await sleep(600);
  check('a backup restores every bill', (await page.evaluate("JSON.parse(localStorage.getItem('billcraft_invoices')).length")) === 2);
  await restore(JSON.stringify({ app: 'BillCraft', format: 2, settings: { appLanguage: 'en', brandName: '<img src=x onerror="window.__pwned=1">', setupDone: true }, catalog: [{ id: 'x" onmouseover="window.__pwned=2', name: '<svg onload="window.__pwned=3">', unitPrice: 1 }], invoices: [] }));
  await sleep(500);
  await page.click('#btn-confirm-ok');
  await sleep(600);
  for (const view of ['builder', 'catalog', 'history', 'settings']) {
    await page.evaluate(`window.app.switchView('${view}')`);
    await sleep(200);
  }
  check('a hostile backup is shown as text and runs nothing', (await page.evaluate('window.__pwned')) === undefined
    && (await page.evaluate("document.getElementById('sidebar-brand-name').textContent")).startsWith('<img'));
});

await journey('Offline, through the service worker', async (page) => {
  await page.size(375, 812);
  await page.start({ settings: SHOP, catalog: PRODUCTS }, '?sw=1');
  const controlled = await page.evaluate("(async () => { await navigator.serviceWorker.ready; for (let i = 0; i < 50 && !navigator.serviceWorker.controller; i++) await new Promise(r => setTimeout(r, 100)); return Boolean(navigator.serviceWorker.controller); })()");
  check('the service worker keeps the app', controlled);
  server.setOffline(true);
  await page.send('Network.enable');
  await page.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await page.reload();
  check('the app opens with no network', await page.evaluate("Boolean(document.querySelector('#product-grid [data-product-id]'))"));
  await page.click('#product-grid [data-product-id="prod_candle"]');
  await sleep(300);
  await page.evaluate('window.app.setStep(2)');
  const pdf = await page.catchFile("await window.app.exportBill('pdf');");
  check('a PDF can be made offline', pdf && pdf.type === 'application/pdf');
  await page.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  server.setOffline(false);
});

await journey('Quick entry: the number pad, units and pictures', async (page) => {
  await page.size(390, 844);
  await page.start({ settings: SHOP, catalog: PRODUCTS });
  await page.click('#product-grid [data-qty-product="prod_candle"]');
  await sleep(300);
  check('a tile\'s number button asks how many', await page.isOpen('modal-qty'));
  for (const key of ['1', '2']) await page.click(`#qty-pad [data-key="${key}"]`);
  await page.evaluate("document.getElementById('form-qty').requestSubmit()");
  await sleep(400);
  check('the number pad puts 12 on the bill', (await page.evaluate("window.app.currentInvoice.items.find(i => i.productId === 'prod_candle').quantity")) === 12);

  await page.evaluate('window.app.openProductModal()');
  await sleep(300);
  await page.type('#modal-prod-name', 'Basmati rice');
  check('a product name picks its unit and picture', (await page.checked('#modal-prod-units')) === 'kg'
    && (await page.evaluate("document.getElementById('prod-icon-face').textContent")) === '🍚');
  await page.click(page.chip('#modal-prod-units', 'bag'));
  await page.type('#modal-prod-name', 'Basmati rice 25 kg');
  check('a unit picked by hand stays', (await page.checked('#modal-prod-units')) === 'bag');
  await page.type('#modal-prod-price', '1800');
  await page.click('#btn-save-modal-product');
  await sleep(400);
  const rice = await page.evaluate("JSON.parse(localStorage.getItem('billcraft_catalog')).find(p => p.name === 'Basmati rice 25 kg')");
  check('it is saved with the unit code and follows its name for the picture', rice?.unit === 'bag' && rice?.icon === '');
  check('its tile shows the picture and the unit', (await page.evaluate(`[...document.querySelectorAll('#product-grid .product-tile')].find(t => t.textContent.includes('Basmati')).textContent.replace(/\\s+/g, ' ').trim()`)).startsWith('🍚 Basmati rice 25 kg ₹ 1,800.00/bag'));

  await page.click('#product-grid [data-other-item]');
  await sleep(300);
  await page.type('#mobile-items-list .bill-line:last-child [data-field="name"]', 'Milk');
  check('a typed item\'s unit and picture follow its name', (await page.evaluate('window.app.currentInvoice.items.at(-1).unit')) === 'ltr'
    && (await page.evaluate("document.querySelector('#mobile-items-list .bill-line:last-child .line-icon').textContent")) === '🥛');

  await page.evaluate(`(() => { window.app.settings.billLanguage = 'hi'; window.app.saveSettings(); })()`);
  await page.reload();
  await page.evaluate('window.app.setStep(2); window.app.flushPreview()');
  const bill = await page.evaluate("document.getElementById('invoice-render-target').textContent");
  check('a Hindi bill names the units in Hindi, with no pictures', bill.includes('लीटर') && bill.includes('नग') && !/\p{Extended_Pictographic}/u.test(bill));
});

await journey('Delivery, discount, Clear and the payment QR', async (page) => {
  await page.size(390, 844);
  await page.start({ settings: SHOP, catalog: PRODUCTS });
  await page.click('#product-grid [data-product-id="prod_candle"]');
  await page.click('#product-grid [data-product-id="prod_candle"]');
  await page.evaluate("document.querySelector('.more-options').open = true");
  await page.click(page.chip('#delivery-chips', '50'));
  await page.click(page.chip('#discount-chips', '10'));
  await sleep(700);
  check('₹50 delivery and 10% off: ₹900 - ₹90 + ₹50 = ₹860', (await page.evaluate('window.app.currentInvoice.grandTotal')) === 860
    && (await page.evaluate("document.getElementById('summary-discount-label').textContent")) === 'Discount (10%):');
  await page.click('#discount-type [data-discount-type="amount"]');
  await page.click('#discount-chips [data-choice-other]');
  await page.type('#inv-discount', '25');
  await sleep(300);
  check('an amount typed under Other: ₹925', (await page.evaluate('window.app.currentInvoice.grandTotal')) === 925 && (await page.checked('#discount-chips')) === 'other');

  await page.click('#btn-clear-bill');
  await sleep(300);
  check('Clear empties the bill and keeps its number', (await page.evaluate('window.app.currentInvoice.items.length')) === 0
    && (await page.evaluate('window.app.currentInvoice.grandTotal')) === 0 && (await page.lastToast()) === 'Bill cleared. Its number and date stay.');
  await page.click('.toast-action');
  await sleep(300);
  check('Undo brings it all back', (await page.evaluate('window.app.currentInvoice.grandTotal')) === 925);

  await page.evaluate('window.app.setStep(2)');
  await page.click('#status-toggle [data-status="Due"]');
  await sleep(300);
  check('a Due bill offers its payment QR', await page.evaluate("!document.getElementById('btn-payment-qr').hidden"));
  await page.click('#btn-payment-qr');
  await sleep(400);
  const number = await page.evaluate('window.app.currentInvoice.invoiceNumber');
  const decoded = await decodeQR(page, '#pay-qr');
  if (decoded === null) {
    skip('the payment QR is for the exact amount', 'no BarcodeDetector on this platform');
  } else {
    check('the payment QR is for the exact amount', decoded === `upi://pay?pa=asha.candles@okaxis&pn=Asha%20Candles&am=925.00&cu=INR&tn=Bill%20${number}`, decoded);
  }
  await page.click('#btn-payment-received');
  await sleep(400);
  const saved = () => page.evaluate(`JSON.parse(localStorage.getItem('billcraft_invoices')).find(i => i.invoiceNumber === '${number}')?.status`);
  check('Payment received saves it as Paid', (await saved()) === 'Paid' && (await page.lastToast()) === `Bill ${number} marked paid`);
  await page.click('.toast-action');
  await sleep(300);
  check('and Undo makes it Due again', (await saved()) === 'Due');
});

await journey('The site folder for Netlify', async (page) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'billcraft-site-'));
  const site = createAppServer({ root: dir });
  try {
    const { count } = packageSite(dir);
    check('the folder has the app, its licences and _headers', count > 30 && existsSync(path.join(dir, 'index.html')) && existsSync(path.join(dir, 'sw.js'))
      && readFileSync(path.join(dir, '_headers'), 'utf8').includes("frame-ancestors 'none'"));
    check('and nothing else (no tests, scripts or docs)', !['tests', 'scripts', 'docs', 'package.json', 'CLAUDE.md'].some(name => existsSync(path.join(dir, name))));
    await new Promise(resolve => site.listen(0, '127.0.0.1', resolve));
    await page.size(390, 844);
    await page.send('Page.navigate', { url: `http://127.0.0.1:${site.address().port}/?sw=1` });
    await page.settle();
    await page.evaluate(`(() => { localStorage.setItem('billcraft_settings', ${JSON.stringify(JSON.stringify(SHOP))}); localStorage.setItem('billcraft_catalog', ${JSON.stringify(JSON.stringify(PRODUCTS))}); window.__oldPage = true; })()`);
    await page.send('Page.reload');
    await page.settle();
    check('the app runs from the folder', await page.evaluate("Boolean(document.querySelector('#product-grid [data-product-id]'))"));
    const controlled = await page.evaluate("(async () => { await navigator.serviceWorker.ready; for (let i = 0; i < 50 && !navigator.serviceWorker.controller; i++) await new Promise(r => setTimeout(r, 100)); return Boolean(navigator.serviceWorker.controller); })()");
    site.setOffline(true);
    await page.evaluate('window.__oldPage = true');
    await page.send('Page.reload');
    await page.settle();
    check('and works offline once opened', controlled && await page.evaluate("Boolean(document.querySelector('#product-grid [data-product-id]'))"));
  } finally {
    site.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

await journey('Layouts and Hindi', async (page) => {
  const invoices = [{ id: 'a', invoiceNumber: 'BILL-001', date: '2026-11-03', status: 'Due', dueDate: '2026-11-10', customer: { name: 'मीरा देशमुख', phone: '99123 45678' }, items: [{ name: 'मोमबत्ती', quantity: 2, unitPrice: 450 }] }];
  for (const [width, language] of [[360, 'hi'], [768, 'en'], [1280, 'hi']]) {
    await page.size(width, 800);
    await page.start({ settings: { ...SHOP, appLanguage: language }, catalog: PRODUCTS, invoices, active_draft: DRAFT });
    const wide = [];
    for (const view of ['builder', 'catalog', 'history', 'settings']) {
      await page.evaluate(`window.app.switchView('${view}')`);
      if (view === 'builder') await page.evaluate('window.app.setStep(2)');
      await sleep(250);
      const overflow = await page.evaluate('document.documentElement.scrollWidth - window.innerWidth');
      if (overflow > 0) wide.push(`${view} +${overflow}px`);
    }
    check(`nothing runs off the screen at ${width}px (${language})`, wide.length === 0, wide.join(', '));
  }
  const words = await page.evaluate("document.getElementById('active-invoice-doc').innerText");
  check('a Hindi bill has its words and dates in Hindi', words.includes('मात्र') && words.includes('नव॰ 2026'));
});

server.close();
const failed = results.filter(result => !result.ok);
console.log(`\n${results.length - failed.length} of ${results.length} checks passed.`);
process.exit(failed.length ? 1 : 0);
