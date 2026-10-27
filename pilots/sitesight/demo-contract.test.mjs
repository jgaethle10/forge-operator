import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';

const html = readFileSync(new URL('./evercraft_ppe_safety_internal_demo.html', import.meta.url), 'utf8');

test('offline demo contains a compilable, self-contained controller', () => {
  assert.match(html, /<!doctype html>/i);
  assert.ok(!/<script[^>]+src=/.test(html), 'no remote scripts');
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 1);
  assert.doesNotThrow(() => new Script(scripts[0][1], { filename: 'sitesight-inline-demo.js' }));
});

test('user-visible simulated and human-review disclosures cannot silently disappear', () => {
  for (const words of ['INTERNAL PROTOTYPE','NO LIVE CAMERA','Simulation, not a detection claim','human review','systemia_admission:\'unverified\'','live_ai_detection:false']) {
    assert.ok(html.includes(words), 'missing boundary: ' + words);
  }
});

test('unverifiable imagery generates a field inspection request without visual clearance', () => {
  assert.ok(html.includes("i.confidence==='unknown'"));
  assert.ok(html.includes('Request on-site inspection'));
  assert.ok(html.includes("act!=='inspect'"));
  assert.ok(html.includes("field_inspection_requested"));
  assert.ok(html.includes('inspection_requested_at'));
});

test('demo does not auto-submit to live commerce, outside services, or surveillance endpoint', () => {
  assert.ok(!html.includes('fetch('));
  assert.ok(!html.includes('XMLHttpRequest'));
  assert.ok(!html.includes('navigator.mediaDevices'));
  assert.ok(!html.includes('stripe.com'));
});
