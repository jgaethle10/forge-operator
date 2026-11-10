import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';

const html = readFileSync(new URL('../public/closeout/index.html', import.meta.url), 'utf8');
const script = html.match(/<script>\s*([\s\S]*?)\s*<\/script>/i)?.[1];

test('Closeout is a standalone, mobile-ready HTML product', () => {
  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /name="viewport"/);
  assert.match(html, /@media\(max-width:530px\)/);
  assert.match(html, /href="https:\/\/jgaethle10\.github\.io\/forge-operator\/closeout\/"/);
});

test('Client-side builder script is syntactically valid', () => {
  assert.ok(script, 'Missing local builder script');
  assert.doesNotThrow(() => new Script(script));
});

test('All printable handoff sections and controls exist', () => {
  for (const id of ['packetForm', 'client', 'company', 'address', 'summary', 'followups', 'warranty', 'photos', 'outDone', 'outPhotos', 'printBtn', 'sampleBtn', 'resetBtn']) {
    assert.ok(html.includes('id="' + id + '"'), 'Missing control: ' + id);
  }
  assert.match(html, /@media print/);
  assert.match(html, /window\.print\(\)/);
});

test('No automatic outbound calls or third-party dependencies', () => {
  assert.doesNotMatch(html, /<script[^>]*\bsrc=/i);
  assert.doesNotMatch(html, /<link[^>]*rel="stylesheet"/i);
  assert.doesNotMatch(script, /\b(?:fetch|sendBeacon|XMLHttpRequest|WebSocket)\b/);
  assert.doesNotMatch(html, /buy\.stripe\.com|checkout\.stripe\.com/i);
});

test('Images use local FileReader and have explicit bounds', () => {
  assert.match(script, /new FileReader\(\)/);
  assert.match(script, /files\.slice\(0,4\)/);
  assert.match(script, /f\.size>5\*1024\*1024/);
  assert.match(html, /No customer data or images are uploaded by this page/);
});

test('Customer-entered text is assigned as text, not HTML', () => {
  assert.match(script, /textContent=value/);
  assert.doesNotMatch(script, /innerHTML|insertAdjacentHTML/);
});

test('Paid pilot states payment and verification boundaries', () => {
  assert.match(html, /\$49/);
  assert.match(html, /No payment is taken here/);
  assert.match(html, /Evercraft Payments order is required/);
  assert.match(html, /not independently verified/i);
});
