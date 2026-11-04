/**
 * BillCraft service worker: keeps every file of the app on the device, so it opens
 * and works with no network. The files and their version are stamped below
 * (npm run stamp). A new version is fetched as one set and waits until the app
 * asks for it ("Update"), so nobody runs a mix of old and new files.
 */

// The app files and their version, written by scripts/stamp-sw.mjs (npm run stamp).
// Do not edit by hand: tests/sw.test.js checks them against the files.
const VERSION = '1.0.0-447c39e30d07';
const FILES = [
  'css/base.css',
  'css/components.css',
  'css/invoice-templates.css',
  'css/responsive.css',
  'css/variables.css',
  'fonts/plus-jakarta-sans-latin-ext-wght-normal.woff2',
  'fonts/plus-jakarta-sans-latin-wght-normal.woff2',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-32.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/icon.svg',
  'index.html',
  'js/app.js',
  'js/backup.js',
  'js/billNumber.js',
  'js/config.js',
  'js/exporter.js',
  'js/i18n/i18n.js',
  'js/i18n/languages.js',
  'js/i18n/locales/en.js',
  'js/i18n/locales/hi.js',
  'js/i18n/numberWords.js',
  'js/models.js',
  'js/motion.js',
  'js/qrHelper.js',
  'js/quickBill.js',
  'js/safe.js',
  'js/storage.js',
  'js/templates.js',
  'js/units.js',
  'js/voice.js',
  'manifest.webmanifest',
  'vendor/html2canvas-1.4.1.min.js',
  'vendor/jspdf-2.5.1.umd.min.js'
];
// End of the stamp

const CACHE = `billcraft-${VERSION}`;

self.addEventListener('install', (event) => {
  // Fresh from the network, not from the browser's HTTP cache
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES.map(file => new Request(file, { cache: 'reload' })))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith('billcraft-') && name !== CACHE).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

// The app sends this when the person taps "Update"
self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // Any page in the app's folder opens the app, also offline
    if (request.mode === 'navigate') return (await cache.match('index.html')) || fetch(request);
    return (await cache.match(request, { ignoreSearch: true })) || fetch(request);
  })());
});
