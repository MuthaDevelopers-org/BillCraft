import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(path.join(root, 'css/invoice-templates.css'), 'utf8');

// The @media print block, found by matching braces because it contains nested rules
function printBlock(source) {
  const start = source.indexOf('@media print {');
  assert.notEqual(start, -1, 'css/invoice-templates.css has no @media print block');
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  assert.fail('the @media print block is not closed');
}

// Each rule in the block, with its selectors and declarations. Comments are removed first,
// because their commas would otherwise be read as selectors.
function rulesIn(block) {
  const code = block.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...code.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selectors, declarations]) => ({
    selectors: selectors.split(',').map(selector => selector.trim()),
    declarations: declarations.replace(/\s+/g, ' ').trim()
  }));
}

const rules = rulesIn(printBlock(css));
const hidden = rules
  .filter(rule => rule.declarations === 'display: none !important;')
  .flatMap(rule => rule.selectors);
const shown = rules
  .filter(rule => rule.declarations.includes('display: block !important;'))
  .flatMap(rule => rule.selectors);

// Print runs on a page narrower than the desktop breakpoints, so phone-only
// controls must be removed for print as well as on screen.
const CHROME = [
  '.boot-error',                      // the start-up failure message
  '.app-sidebar',                     // bottom bar on phones, sidebar on wide screens
  '.app-topbar',
  '.view-section:not(#view-builder)', // catalog, history and settings
  '.bill-form-panel',                 // the editor cards
  '.preview-actions-bar',             // design picker and the PDF, image, print, WhatsApp and Save buttons
  '.step-bar',
  '.step-nav',
  '.mobile-only',
  '.toast-container',
  '.motion-layer',                    // flying "+1" bubbles and the burst after sending
  '.modal-overlay'
];

test('print removes the app chrome, the other views and the editor', () => {
  for (const selector of CHROME) {
    assert.ok(hidden.includes(selector), `${selector} must be hidden when printing`);
  }
});

test('print uses a white page, not the screen background', () => {
  const page = rules.find(rule => rule.selectors.includes('html'));
  assert.ok(page, 'the print block must style html');
  assert.ok(page.declarations.includes('background: #ffffff !important;'));
});

test('print keeps the builder and the bill visible', () => {
  // The bill lives in the builder, so it prints even when another view is open
  assert.ok(shown.includes('#view-builder'));
  assert.ok(shown.includes('.bill-preview-panel'));
  assert.ok(!hidden.includes('.bill-preview-panel'));
  assert.ok(!hidden.some(selector => selector.includes('invoice')), 'no invoice element may be hidden when printing');
});
