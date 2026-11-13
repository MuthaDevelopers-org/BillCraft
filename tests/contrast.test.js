import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// WCAG 2.1 contrast: text needs 4.5:1 against what it sits on (AA, normal size)
const AA = 4.5;
const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

function luminance(hex) {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? [...value].map(c => c + c).join('') : value;
  const [r, g, b] = [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

const css = read('css/variables.css');
const block = selector => css.slice(css.indexOf(selector), css.indexOf('}', css.indexOf(selector)));
const tokens = text => Object.fromEntries([...text.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{3,6})\s*;/g)].map(m => [m[1], m[2]]));
const root = tokens(block(':root'));
const accents = ['emerald', 'sapphire', 'purple', 'rose', 'amber', 'charcoal']
  .map(name => ({ name, ...tokens(block(`[data-accent="${name}"]`)) }));

const pass = (foreground, background, label) => {
  const ratio = contrast(foreground, background);
  assert.ok(ratio >= AA, `${label}: ${foreground} on ${background} is ${ratio.toFixed(2)}:1`);
};

test('app text colours meet AA on the surfaces they sit on', () => {
  for (const surface of ['bg-surface', 'bg-app']) {
    pass(root['text-main'], root[surface], `text-main on ${surface}`);
    pass(root['text-muted'], root[surface], `text-muted on ${surface}`);
    pass(root['text-subtle'], root[surface], `text-subtle on ${surface}`);
  }
  pass(root['text-muted'], root['bg-surface-alt'], 'text-muted on bg-surface-alt');
  pass('#ffffff', root.success, 'white on success buttons');
  pass(root.danger, '#ffffff', 'danger text');
  pass(root.danger, root['danger-light'], 'danger on its light background');
  for (const status of ['success', 'danger', 'warning']) {
    pass(root[`${status}-text`], root[`${status}-light`], `${status} badges`);
  }
});

test('every theme colour carries white text and works as text on its soft background', () => {
  for (const accent of accents) {
    pass('#ffffff', accent['theme-accent'], `${accent.name}: white on the accent`);
    pass(accent['theme-accent'], accent['theme-accent-soft'], `${accent.name}: accent on its soft background`);
  }
});

test('text on the bills meets AA on white and on the light panels', () => {
  const sources = [read('css/invoice-templates.css'), read('js/templates.js')].join('\n');
  // Text colours only (not borders or backgrounds); white is used on coloured banners
  const colours = [...sources.matchAll(/(?<![-\w])color:\s*(#[0-9a-fA-F]{3,6})\b/g)]
    .map(match => match[1].toLowerCase())
    .filter(hex => !['#fff', '#ffffff'].includes(hex));
  assert.ok(colours.length > 20, 'the bill colours were found');
  for (const hex of new Set(colours)) pass(hex, '#f8fafc', 'bill text');
});
