/**
 * Browser tests: the main journeys in headless Chrome. Run with: npm run e2e
 *
 * Uses only Node and an installed Chrome or Chromium (set CHROME_PATH if it is
 * not found; without one the run is skipped). Each check prints PASS or FAIL,
 * and the run fails if any check fails. QR codes are decoded with Chrome's
 * BarcodeDetector where the platform has one (macOS, Android); elsewhere that
 * check is reported as skipped.
 */
import { createAppServer } from '../../scripts/serve.mjs';
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
const DRAFT = { id: 'inv_test', invoiceNumber: 'BILL-001', date: '2026-11-03', status: 'Paid', customer: { name: 'Meera', phone: '99123 45678' }, items: [{ id: 'l1', name: 'Soy candle', quantity: 3, unitPrice: 450 }] };

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
    lastToast: () => evaluate("[...document.querySelectorAll('.toast')].at(-1)?.firstChild.textContent || ''"),
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
  const decoded = await decodeQR(page, '#invoice-render-target img');
  if (decoded === null) {
    skip('the QR code on the bill pays the shop exactly', 'no BarcodeDetector on this platform');
  } else {
    check('the QR code on the bill pays the shop exactly', decoded === 'upi://pay?pa=asha.candles@okaxis&pn=Asha%20Candles&am=70.00&cu=INR&tn=Bill%20BILL-001', decoded);
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
