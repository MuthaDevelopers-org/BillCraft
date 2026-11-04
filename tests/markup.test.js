import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import english from '../js/i18n/locales/en.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFileSync(path.join(root, file), 'utf8');

// Every app script except the locale files themselves
const SOURCE_FILES = [
  ...readdirSync(path.join(root, 'js')).filter(file => file.endsWith('.js')).map(file => `js/${file}`),
  ...readdirSync(path.join(root, 'js/i18n')).filter(file => file.endsWith('.js')).map(file => `js/i18n/${file}`)
];
const MARKUP_FILES = ['index.html'];

const messageKeys = new Set(Object.keys(english.messages));
const knownPrefixes = new Set([...messageKeys].map(key => key.split('.')[0]));

// Keys built at runtime, such as t(`title.${viewName}`)
const DYNAMIC_PREFIXES = ['title.'];

function keysReferencedIn(text) {
  const found = new Set();

  // Quoted dotted names whose first part is a known prefix, e.g. 'toast.billSaved'
  for (const match of text.matchAll(/['"`]([a-z][A-Za-z0-9]*\.[A-Za-z0-9.]+)['"`]/g)) {
    if (knownPrefixes.has(match[1].split('.')[0])) found.add(match[1]);
  }

  // data-i18n attributes (placeholder, title and aria variants included)
  for (const match of text.matchAll(/data-i18n(?:-placeholder|-title|-aria)?="([^"]+)"/g)) {
    found.add(match[1]);
  }

  return found;
}

test('every translation key used in the app exists in the English locale', () => {
  const missing = [];
  for (const file of [...SOURCE_FILES, ...MARKUP_FILES]) {
    for (const key of keysReferencedIn(read(file))) {
      if (!messageKeys.has(key)) missing.push(`${key} (${file})`);
    }
  }
  assert.deepEqual(missing, []);
});

test('every English translation key is used somewhere', () => {
  const used = keysReferencedIn([...SOURCE_FILES, ...MARKUP_FILES].map(read).join('\n'));
  const unused = [...messageKeys].filter(key =>
    !used.has(key) && !DYNAMIC_PREFIXES.some(prefix => key.startsWith(prefix))
  );
  assert.deepEqual(unused, []);
});

test('scripts look up only element IDs that exist in index.html or that they create', () => {
  const ids = new Set([...read('index.html').matchAll(/\sid="([^"]+)"/g)].map(match => match[1]));
  // IDs the scripts create for themselves, such as the empty-catalog button
  for (const file of ['js/app.js', 'js/exporter.js']) {
    for (const match of read(file).matchAll(/\sid="([^"]+)"/g)) ids.add(match[1]);
  }
  const missing = [];
  for (const file of ['js/app.js', 'js/exporter.js']) {
    for (const match of read(file).matchAll(/getElementById\('([^']+)'\)/g)) {
      if (!ids.has(match[1])) missing.push(`${match[1]} (${file})`);
    }
  }
  assert.deepEqual(missing, []);
});
