/**
 * Puts the app in site/, ready to upload to a static host: npm run package
 * For Netlify Drop, drag the site folder onto https://app.netlify.com/drop.
 *
 * Copies exactly the files the service worker keeps (see scripts/stamp-sw.mjs),
 * sw.js and the licences, and writes a _headers file with the security headers
 * (Netlify and Cloudflare Pages read it). Stops if the stamp in sw.js is stale.
 */
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, appFiles, readStamp, stampVersion } from './stamp-sw.mjs';

export const SITE = path.join(ROOT, 'site');
const EXTRA_FILES = ['sw.js', 'THIRD_PARTY_NOTICES.md', 'vendor/LICENSE-html2canvas.txt', 'vendor/LICENSE-jspdf.txt', 'fonts/OFL.txt'];

/**
 * The _headers file. The Content Security Policy is the one in index.html, plus
 * frame-ancestors, which only works as a header: other sites may not frame the app.
 */
export function buildHeaders(indexHtml) {
  const meta = indexHtml.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/);
  if (!meta) throw new Error('index.html has no Content-Security-Policy meta tag');
  return [
    '/*',
    `  Content-Security-Policy: ${meta[1]}; frame-ancestors 'none'`,
    '  X-Content-Type-Options: nosniff',
    '  Referrer-Policy: no-referrer',
    '  Permissions-Policy: camera=(), geolocation=(), payment=(), usb=(), microphone=(self)',
    '',
    '# The page and the service worker are checked for a new version on every visit',
    '/',
    '  Cache-Control: no-cache',
    '/index.html',
    '  Cache-Control: no-cache',
    '/sw.js',
    '  Cache-Control: no-cache',
    ''
  ].join('\n');
}

/** Writes the site to `outDir` (site/ unless given; the browser tests use a temporary folder) */
export function packageSite(outDir = SITE) {
  const files = appFiles();
  const stamp = readStamp(readFileSync(path.join(ROOT, 'sw.js'), 'utf8'));
  if (stamp.version !== stampVersion(files) || JSON.stringify(stamp.files) !== JSON.stringify(files)) {
    throw new Error('sw.js is out of date: run npm run stamp first');
  }
  rmSync(outDir, { recursive: true, force: true });
  for (const file of [...files, ...EXTRA_FILES]) {
    const target = path.join(outDir, file);
    mkdirSync(path.dirname(target), { recursive: true });
    cpSync(path.join(ROOT, file), target);
  }
  writeFileSync(path.join(outDir, '_headers'), buildHeaders(readFileSync(path.join(ROOT, 'index.html'), 'utf8')));
  return { count: files.length + EXTRA_FILES.length + 1, version: stamp.version };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { count, version } = packageSite();
    console.log(`site/ is ready: ${count} files, version ${version}.`);
    console.log('Upload: open https://app.netlify.com/drop and drag the site folder onto the page.');
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
