import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { ROOT, appFiles, readStamp, stampVersion } from '../scripts/stamp-sw.mjs';
import { APP_VERSION } from '../js/config.js';

const read = file => readFileSync(path.join(ROOT, file), 'utf8');
const stamp = readStamp(read('sw.js'));

test('the service worker keeps every file the app serves, and only those', () => {
  assert.deepEqual(stamp.files, appFiles(), 'run npm run stamp');
});

test('the service worker version matches the files (run npm run stamp after a change)', () => {
  assert.equal(stamp.version, stampVersion(), 'run npm run stamp');
});

test('the app version is the same in package.json and js/config.js', () => {
  assert.equal(APP_VERSION, JSON.parse(read('package.json')).version);
  assert.ok(stamp.version.startsWith(`${APP_VERSION}-`));
});

test('everything index.html, the manifest and the exporter load is kept offline', () => {
  const html = read('index.html');
  const local = [...html.matchAll(/(?:href|src)="([^"#:]+)"/g)].map(match => match[1]).filter(ref => !ref.startsWith('data'));
  const manifest = JSON.parse(read('manifest.webmanifest'));
  const vendor = [...read('js/exporter.js').matchAll(/'(vendor\/[^']+)'/g)].map(match => match[1]);
  const css = ['css/base.css'].flatMap(file => [...read(file).matchAll(/url\('\.\.\/([^']+)'\)/g)].map(match => match[1]));
  for (const ref of [...local, ...manifest.icons.map(icon => icon.src), ...vendor, ...css]) {
    assert.ok(existsSync(path.join(ROOT, ref)), `${ref} exists`);
    assert.ok(stamp.files.includes(ref), `${ref} is kept offline`);
  }
});

test('the manifest uses relative paths, so the app also works from a subfolder', () => {
  const manifest = JSON.parse(read('manifest.webmanifest'));
  for (const url of [manifest.start_url, manifest.scope, manifest.id, ...manifest.icons.map(icon => icon.src)]) {
    assert.ok(!url.startsWith('/') && !url.includes('://'), url);
  }
  assert.ok(manifest.icons.some(icon => icon.purpose === 'maskable'));
});
