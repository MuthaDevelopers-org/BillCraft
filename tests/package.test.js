import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildHeaders } from '../scripts/package-site.mjs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('the uploaded site sends the page\'s CSP as a header, plus frame-ancestors', () => {
  const headers = buildHeaders(html);
  const csp = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  assert.ok(headers.includes(`Content-Security-Policy: ${csp}; frame-ancestors 'none'`));
  assert.match(headers, /X-Content-Type-Options: nosniff/);
  assert.match(headers, /Referrer-Policy: no-referrer/);
  assert.match(headers, /Permissions-Policy: .*microphone=\(self\)/);
});

test('the page and the service worker are never cached stale', () => {
  const headers = buildHeaders(html);
  for (const path of ['/', '/index.html', '/sw.js']) {
    assert.match(headers, new RegExp(`\\n${path.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}\\n  Cache-Control: no-cache`));
  }
});
