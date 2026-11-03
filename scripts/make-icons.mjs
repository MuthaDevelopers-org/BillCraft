/**
 * Draws the app icons from icons/icon.svg with headless Chrome:
 * - icon-32.png, icon-192.png, icon-512.png: rounded corners, transparent outside
 * - icon-maskable-512.png and apple-touch-icon.png (180): a square background, because
 *   Android and iOS cut their own shape (the receipt sits inside the safe zone)
 *
 * Run after changing icons/icon.svg: node scripts/make-icons.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome, sleep } from '../tests/e2e/chrome.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rounded = readFileSync(path.join(ROOT, 'icons/icon.svg'), 'utf8');
const square = rounded.replace(/<rect width="512" height="512" rx="\d+"/, '<rect width="512" height="512"');
if (square === rounded) throw new Error('icons/icon.svg: the background <rect> was not found');

const OUTPUTS = [
  { file: 'icon-32.png', size: 32, svg: rounded },
  { file: 'icon-192.png', size: 192, svg: rounded },
  { file: 'icon-512.png', size: 512, svg: rounded },
  { file: 'icon-maskable-512.png', size: 512, svg: square },
  { file: 'apple-touch-icon.png', size: 180, svg: square }
];

const chrome = await launchChrome();
try {
  await chrome.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
  for (const { file, size, svg } of OUTPUTS) {
    await chrome.send('Emulation.setDeviceMetricsOverride', { width: size, height: size, deviceScaleFactor: 1, mobile: false });
    const page = `<!doctype html><body style="margin:0;background:transparent"><img width="${size}" height="${size}" src="data:image/svg+xml,${encodeURIComponent(svg)}"></body>`;
    await chrome.send('Page.navigate', { url: `data:text/html,${encodeURIComponent(page)}` });
    await sleep(400);
    const { data } = await chrome.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: size, height: size, scale: 1 } });
    writeFileSync(path.join(ROOT, 'icons', file), Buffer.from(data, 'base64'));
    console.log(`icons/${file}`);
  }
} finally {
  await chrome.close();
}
