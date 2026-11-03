/**
 * Writes the list of files the app serves, and a hash of their contents, into sw.js.
 * Run after changing any of them: npm run stamp
 *
 * The service worker keeps exactly these files on the device. A new hash makes
 * browsers fetch the new set as a whole, so nobody runs a mix of old and new files.
 * tests/sw.test.js fails while the stamp is stale.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOP_LEVEL_FILES = ['index.html', 'manifest.webmanifest'];
const APP_FOLDERS = ['css', 'js', 'vendor', 'fonts', 'icons'];
const SERVED = /\.(css|js|woff2|png|svg)$/;

/** Every file the app serves, as paths relative to the app folder, sorted */
export function appFiles(root = ROOT) {
  const walk = folder => readdirSync(path.join(root, folder), { withFileTypes: true })
    .flatMap(entry => {
      const file = `${folder}/${entry.name}`;
      if (entry.isDirectory()) return walk(file);
      return SERVED.test(entry.name) ? [file] : [];
    });
  return [...TOP_LEVEL_FILES, ...APP_FOLDERS.flatMap(walk)].sort();
}

/** The version for these files: the package version, then 12 hex digits of their content hash */
export function stampVersion(files = appFiles(), root = ROOT) {
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(`${file}\0`);
    hash.update(readFileSync(path.join(root, file)));
    hash.update('\0');
  }
  const { version } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  return `${version}-${hash.digest('hex').slice(0, 12)}`;
}

const START = '// The app files and their version, written by scripts/stamp-sw.mjs (npm run stamp).';
const END = '// End of the stamp';

/** The stamp block of sw.js for the current files */
export function stampBlock(files = appFiles(), root = ROOT) {
  return [
    START,
    '// Do not edit by hand: tests/sw.test.js checks them against the files.',
    `const VERSION = '${stampVersion(files, root)}';`,
    'const FILES = [',
    files.map(file => `  '${file}'`).join(',\n'),
    '];',
    END
  ].join('\n');
}

/** The VERSION and FILES written in sw.js */
export function readStamp(source) {
  const block = source.slice(source.indexOf(START), source.indexOf(END));
  return {
    version: (block.match(/const VERSION = '([^']+)';/) || [])[1] || '',
    files: [...block.slice(block.indexOf('const FILES')).matchAll(/'([^']+)'/g)].map(match => match[1])
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const swPath = path.join(ROOT, 'sw.js');
  const source = readFileSync(swPath, 'utf8');
  const start = source.indexOf(START);
  const end = source.indexOf(END);
  if (start === -1 || end === -1) throw new Error('sw.js has no stamp block');
  writeFileSync(swPath, source.slice(0, start) + stampBlock() + source.slice(end + END.length));
  console.log(`sw.js stamped: ${readStamp(readFileSync(swPath, 'utf8')).version}, ${appFiles().length} files`);
}
