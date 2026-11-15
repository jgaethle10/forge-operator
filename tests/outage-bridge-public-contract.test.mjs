import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';

const html = readFileSync(new URL('../public/outage-bridge/index.html', import.meta.url), 'utf8');
test('Outage Bridge source is a parseable, self-contained public demo', () => {
  assert.match(html, /<title>Outage Bridge \| Evercraft<\/title>/);
  assert.match(html, /id="contact-form"/);
  assert.match(html, /id="download" disabled/);
  assert.match(html, /id="preview-links"/);
  assert.doesNotMatch(html, /<script[^>]+src=/i);
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 1);
  assert.doesNotThrow(() => new Script(scripts[0][1]));
  assert.doesNotMatch(scripts[0][1], /\b(fetch|XMLHttpRequest|sendBeacon|localStorage|sessionStorage)\b/);
});
test('Link and commercial boundaries are clear', () => {
  assert.match(html, /https:\/\/fabric\.systemiacommandcenters\.com\/offers\/site-survive/);
  assert.match(html, /Site-Survive Rapid Audit/);
  assert.match(html, /\$250/);
  assert.doesNotMatch(html, /\$99/);
  assert.match(html, /not affiliated with Microsoft/i);
  assert.match(html, /independent hosting/i);
  assert.match(html, /does not monitor outages/i);
});
test('Generator validates user-controlled links and escapes HTML', () => {
  assert.match(html, /u\.protocol==="https:"/);
  assert.match(html, /const escapeHtml/);
  assert.match(html, /escapeHtml\(v\.name\)/);
  assert.match(html, /escapeHtml\(booking\)/);
  assert.match(html, /escapeHtml\(email\)/);
  assert.match(html, /new Blob\(/);
  assert.match(html, /download="emergency-contact\.html"|a\.download="emergency-contact\.html"/);
});
