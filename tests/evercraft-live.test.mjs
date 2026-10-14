import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../public/live/index.html', import.meta.url), 'utf8');

test('same existing public runtime, not an independent agent service', () => {
  assert.match(html, /EVERCRAFT/);
  assert.match(html, /<span style="color:var\(--green\)">LIVE<\/span>/);
  assert.match(html, /data-scene="activity"/);
  assert.match(html, /data-scene="build"/);
  assert.match(html, /data-scene="proof"/);
  assert.match(html, /PUBLIC PRODUCTION WINDOW/);
});

test('only public GitHub is queried, no write APIs or tokens', () => {
  assert.match(html, /https:\/\/api\.github\.com\/repos\/\$\{repo\}/);
  assert.match(html, /jgaethle10\/forge-operator/);
  assert.match(html, /async function get\(url\)/);
  assert.match(html, /fetch\(url,\{headers:/);
  assert.doesNotMatch(html, /\b(method|Authorization|Bearer|access_token|private_key|secret_key):\s*['"\x60]/i);
  assert.doesNotMatch(html, /\bPOST\b|\bPATCH\b|\bDELETE\b/);
});

test('CI is matched to selected exact revision; no CI or source-only green shipping claims', () => {
  assert.match(html, /r\.head_sha===commit\.sha/);
  assert.match(html, /No independent deployed-output verification/);
  assert.match(html, /No real recipient or owner acceptance receipt/);
  assert.match(html, /NOT VERIFIED/);
  assert.match(html, /GitHub public API rate limit reached/);
});

test('operator-controlled strings render as text, not HTML', () => {
  assert.match(html, /node\.textContent=String\(txt\)/);
  assert.match(html, /\$\('mission-display'\)\.textContent=mission/);
  assert.doesNotMatch(html, /innerHTML\s*=/);
});
