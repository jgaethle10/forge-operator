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

test('a newcomer can start a real live example in one click', () => {
  assert.match(html, /id="heroTryExample"/);
  assert.match(html, /See a real example/);
  assert.match(html, /Make better decisions with real-world evidence/);
  assert.match(html, /Ask my own question/);
  assert.match(html, /document\.getElementById\('heroTryExample'\)\.addEventListener\('click'/);
  assert.match(html, /loadFoodInfrastructurePilot\(\{partner:document\.body\.dataset\.pilot==='agnormal'\}\)/);
  assert.match(html, /document\.getElementById\('form'\)\.requestSubmit\(\)/);
  assert.match(html, /id="advancedScope"/);
  assert.match(html, /Optional: refine the question with more detail/);
  assert.match(html, /id="runtimePulse"/);
  assert.match(html, /id="metricSignals"/);
  assert.match(html, /At a glance/);
  assert.match(html, /site approval/);
  assert.doesNotMatch(html, /<a class="hero-primary" href="#investigation">Start an investigation/);
});

test('first screen remains usable without loading system diagnostics', () => {
  const opening = html.slice(html.indexOf('<header>'), html.indexOf('</header>') + 9);
  assert.match(opening, /id="heroTryExample"/);
  assert.match(opening, /<details class="runtime-details">/);
  assert.match(opening, /<summary>See the current evidence coverage and system status<\/summary>/);
  assert.match(opening, /id="runtimePulseLabel"/);
  assert.ok(opening.indexOf('id="heroTryExample"') < opening.indexOf('id="metricSignals"'));
  const form = html.slice(html.indexOf('<form id="form">'), html.indexOf('</form>'));
  assert.ok(form.indexOf('id="question"') < form.indexOf('id="advancedScope"'));
  assert.ok(form.indexOf('id="region"') < form.indexOf('id="advancedScope"'));
  assert.ok(form.indexOf('id="run"') > form.indexOf('</details>'));
});

test('optional comparison starter connects to the real comparison flow', () => {
  assert.match(html, /id="compareExample"/);
  assert.match(html, /id="compareRun"/);
  assert.match(html, /Compare evidence for two places/);
  assert.match(html, /document\.getElementById\('compareExample'\)\.addEventListener\('click'/);
  assert.match(html, /document\.getElementById\('compareRun'\)\.click\(\)/);
  assert.match(html, /body\[data-pilot="agnormal"\] \.pilot-actions/);
});

test('comparison explicitly distinguishes absent evidence from an unsuitable site', () => {
  assert.match(html, /hasMatchingSources = Number\(candidate\.independent_source_family_count/);
  assert.match(html, /no matching source coverage/);
  assert.match(html, /Not yet assessed/);
  assert.match(html, /<strong>not<\/strong>/);
  assert.match(html, /not.*evidence that this location is unsuitable/);
});

test('source ledger shows the last cycle, not a fictional global connection list', () => {
  for (const marker of [
    'id="sources"',
    'id="sourceLedger"',
    'id="sourceLedgerCycle"',
    'id="sourceLedgerSummary"',
    'renderFaieSourceLedger(health)',
    'official_collector_receipts',
    'National Weather Service alerts',
    'USGS stream and water measurements',
    'NOAA river gauges and forecasts',
    'U.S. Drought Monitor county assessments',
    'Checked; no observations returned',
    'Not configured',
    'Check failed',
    'Partial / degraded',
    'newly admitted across all inputs'
  ]) assert.ok(html.includes(marker),'source transparency marker missing: '+marker);
  assert.match(html,/health\.ok !== true/);
  assert.match(html,/Source receipts unavailable\. Do not interpret previous counts as live/);
  assert.doesNotMatch(html, /All connected sources are live/);
});


test('specific-site USDA soil proof is opt-in, source-backed and separate from regional preview', () => {
  const panel=html.slice(html.indexOf('id="soilPreviewPanel"'),html.indexOf('id="soilPreviewResult"')+200);
  assert.match(panel,/Scan a real location: soil \+ weather \+ operational questions/);
  assert.match(panel,/id="soilLatitude"/);
  assert.match(panel,/id="soilLongitude"/);
  assert.match(panel,/FAIE asks USDA for mapped soil units/);
  assert.match(html,/id="soilPreviewForm"/);
  assert.match(html,/\/api\/faie\/soil\/preview/);
  assert.match(html,/document\.getElementById\('soilPreviewForm'\)\.addEventListener\('submit',runSoilPreview\)/);
  assert.match(html,/Survey mapping is not an on-site soil test/);
  assert.match(html,/data\.request_persisted!==false/);
  assert.match(html,/data\.site_suitability_verdict!==null/);
});


test('site intelligence scanner has simple entry, real source boundaries, and downloadable proof', () => {
  for(const marker of [
    'id="heroSiteScanJump"',
    'id="siteScanRun"',
    'id="siteScanExample"',
    'id="siteScanResult"',
    'id="siteScanDownload"',
    '/api/faie/site/scan',
    'Run two-source site scan',
    'USDA NRCS · Reported',
    'NOAA NWS · Modeled',
    'wx.screening_flags',
    'source_receipts',
    'data.site_suitability_verdict!==null',
    'latestSiteScan=data',
    'evercraft-faie-site-scan.json',
    'public_lookup_persisted!==false',
    'Official site scan unavailable'
  ]) assert.ok(html.includes(marker),'site-scan experience contract missing: '+marker);
  assert.match(html,/Coordinates go to both official services/);
  assert.match(html,/No automatic build, farm or investment recommendation/);
});

test('observed historical station evidence is separately available with distance, coverage and uncertainty', () => {
  for(const marker of [
    'id="historicalClimatePanel"',
    'id="historicalClimateRun"',
    'id="historicalClimateResult"',
    'id="historicalClimateDownload"',
    '/api/faie/climate/history',
    '2023–2024',
    'No approved historical station within 40 km',
    'station observations, 2023',
    'expected_days',
    'threshold_days',
    'observed_days',
    'missing_days',
    'historical_station_context_available',
    'evercraft-faie-historical-climate.json'
  ]) assert.ok(html.includes(marker),'historical context UI contract missing: '+marker);
  assert.match(html,/This is not a 30-year climate normal/);
  assert.match(html,/data\.request_persisted!==false/);
});
