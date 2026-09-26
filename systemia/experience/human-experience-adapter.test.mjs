import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { analyzeHumanSurfaceHtml, classifySurface, reconcile } from './human-experience-adapter.mjs';

test('classifies Evercraft app roots as human UI and function URLs as API', () => {
  assert.equal(classifySurface('https://rivet.base44.app/'), 'human_ui');
  assert.equal(classifySurface('https://base44.app/api/apps/abc/functions/foo'), 'api');
  assert.equal(classifySurface('https://github.com/jgaethle10/forge-operator/tree/main/registry/rivet'), 'documentation');
});

test('finds mobile, accessibility and interaction defects without claiming pixels were rendered', () => {
  const html = '<html><head><title>RIVET</title></head><body><img src="x"><a href="#">Go</a></body></html>';
  const mobile = analyzeHumanSurfaceHtml({html,url:'https://rivet.base44.app/',product:{product_key:'rivet',name:'RIVET'},role:'mobile_guard'});
  const access = analyzeHumanSurfaceHtml({html,url:'https://rivet.base44.app/',product:{product_key:'rivet',name:'RIVET'},role:'accessibility_guard'});
  const interaction = analyzeHumanSurfaceHtml({html,url:'https://rivet.base44.app/',product:{product_key:'rivet',name:'RIVET'},role:'interaction_guard'});
  assert.ok(mobile.findings.some(f => f.code === 'mobile_viewport_missing'));
  assert.ok(access.findings.some(f => f.code === 'document_language_missing'));
  assert.ok(access.findings.some(f => f.code === 'image_alt_coverage_gap'));
  assert.ok(interaction.findings.some(f => f.code === 'dead_link_placeholder'));
});

test('flags retired RIVET Luma branding', () => {
  const html = '<html lang="en"><head><meta name="viewport" content="width=device-width"><title>RIVET</title></head><body><h1>Luma EV Reports</h1></body></html>';
  const out = analyzeHumanSurfaceHtml({html,url:'https://rivet.base44.app/',product:{product_key:'rivet',name:'RIVET'},role:'brand_guard'});
  assert.ok(out.findings.some(f => f.code === 'legacy_brand_leak' && f.severity === 'P1'));
});

test('treats SPA shell as blocked for clarity instead of a false pass', () => {
  const html = '<html lang="en"><head><meta name="viewport" content="width=device-width"><title>App</title></head><body><div id="root"></div><script src="/app.js"></script></body></html>';
  const out = analyzeHumanSurfaceHtml({html,url:'https://example.base44.app/',product:{product_key:'example',name:'Example'},role:'clarity_guard'});
  assert.ok(out.findings.some(f => f.code === 'rendered_content_requires_browser' && f.severity === 'BLOCKED'));
});


test('does not grade GitHub documentation chrome as Evercraft UI', () => {
  const html = '<html><head><title>GitHub</title></head><body><button></button></body></html>';
  const out = analyzeHumanSurfaceHtml({html,url:'https://github.com/jgaethle10/forge-operator/tree/main/registry/example',product:{product_key:'example',name:'Example'},role:'accessibility_guard'});
  assert.equal(out.applicable, false);
  assert.equal(out.findings.length, 0);
});

test('reconciliation returns an explicit reconciled status for the Saban quality gate', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-human-experience-'));
  try {
    const out = await reconcile({results: [], rootDir});
    assert.equal(out.status, 'reconciled');
  } finally {
    fs.rmSync(rootDir, {recursive: true, force: true});
  }
});
