import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const dir = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.resolve(dir, '../public/faie/index.html'), 'utf8');

test('FAIE studio ships as a single self-contained, parsed page', () => {
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.equal(scripts.length, 1, 'the owned Fabric surface expects one inline application script');
  assert.doesNotThrow(() => new vm.Script(scripts[0], { filename: 'faie-inline.js' }));
  assert.ok(html.includes('FAIE EXPERIENCE REVAMP 2026-11-19'));
  assert.doesNotMatch(html, /base44\.app/i);
  assert.doesNotMatch(html, /<script[^>]+src=/i, 'no external script runtime');
});

test('navigation and decision-room controls target real page sections', () => {
  for (const id of ['investigation', 'field', 'comparison', 'form', 'result', 'signals',
    'comparisonResult', 'metricSignals', 'metricFeeds', 'metricRegion',
    'metricChecked', 'runtimePulse', 'runtimePulseLabel', 'activityHud']) {
    assert.match(html, new RegExp('id="' + id + '"'), 'missing #'+id);
  }
  for (const href of ['investigation', 'field', 'comparison']) {
    assert.match(html, new RegExp('href="#' + href + '"'));
  }
  for (const lens of ['water', 'soil', 'resilience', 'operations']) {
    assert.match(html, new RegExp('data-faie-lens="' + lens + '"'));
  }
  assert.match(html, /faieLensQuestions/);
  assert.match(html, /document\.getElementById\('question'\)\.value=/);
});

test('health status stays mounted through statusbar renders and does not claim live when failing', () => {
  const statusIndex=html.indexOf('id="statusbar"');
  const pulseIndex=html.indexOf('id="runtimePulse"');
  assert.ok(statusIndex >= 0 && pulseIndex > statusIndex);
  assert.ok(html.slice(statusIndex,pulseIndex).includes('</div>'), 'pulse must not be inside replaceable statusbar');
  assert.match(html, /setFaieMetrics\(\{health\}\)/);
  assert.match(html, /setFaieMetrics\(\{error\}\)/);
  assert.match(html, /faieMetrics\.pulse\.dataset\.health='fail'/);
  assert.doesNotMatch(html, /\['Registry', 'PUBLISHED'\]/, 'do not hardcode external verification');
});

test('public evidence, AgNormal, and authority boundaries remain intact', () => {
  for (const marker of [
    'Prepared for AgNormal', 'One real decision. Live evidence. No theater.',
    'Run live AgNormal brief', 'Cancel operation', 'Download handed off',
    'fetchWithTimeout', '/api/faie/health', '/api/faie/investigate',
    '/api/faie/compare', 'human review', 'public preview',
    'evidence_acquisition_queue', 'provenance_refs'
  ]) {
    assert.ok(html.toLowerCase().includes(marker.toLowerCase()), 'missing contract: '+marker);
  }
  assert.match(html, /prefers-reduced-motion:reduce/);
  assert.match(html, /@media\(max-width:620px\)/);
  assert.match(html, /navigator\.clipboard\.writeText/);
});
