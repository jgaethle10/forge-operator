import test from 'node:test';
import assert from 'node:assert/strict';
import { assessSearchResults } from './audit-search-result-freshness.mjs';
const entry=(overrides={})=>({
  key:'findmypart-old-home',product:'FindMyPart',status:'LEGACY_INDEXED',
  query:'site:findmypart.base44.app FindMyPart',
  result_url:'https://findmypart.base44.app/',observed_on:'2026-10-29',
  replacement_url:null,replacement_proof:null,...overrides
});
const ledger=(items)=>({schema:'evercraft.distribution.publisher-ownership.v1',entries:[],search_observations:items});
test('keeps dated legacy index observations distinct from verified current search pickup',()=>{
  const report=assessSearchResults(ledger([entry()]));
  assert.equal(report.status,'HISTORICAL_LEGACY_RESULTS_OBSERVED');
  assert.equal(report.snapshot_only,true);
  assert.equal(report.search_engine_live_query_performed,false);
  assert.equal(report.rows[0].provider_pickup_verified,false);
  assert.equal(report.rows[0].replacement_status,'NOT_VERIFIED');
  assert.equal(report.summary.findings,0);
});
test('refuses deceptive nested lookalike domains as Base44 evidence',()=>{
  const report=assessSearchResults(ledger([entry({result_url:'https://findmypart.base44.app.evil.example/'})]));
  assert.ok(report.findings.some(f=>f.issue==='LEGACY_RESULT_MUST_HAVE_EXACT_BASE44_HOST'));
});
test('requires independent receipt before labeling any replacement verified',()=>{
  const report=assessSearchResults(ledger([entry({replacement_url:'https://example.com/new/'})]));
  assert.ok(report.findings.some(f=>f.issue==='REPLACEMENT_NOT_INDEPENDENTLY_VERIFIED'));
});
test('blocks a Base44 replacement and duplicate observations',()=>{
  const report=assessSearchResults(ledger([
    entry({replacement_url:'https://findmypart.base44.app/new',replacement_proof:{status:'VERIFIED',receipt_url:'https://github.com/example/receipt',verified_at:'2026-10-29T00:00:00Z'}}),
    entry()
  ]));
  assert.ok(report.findings.some(f=>f.issue==='INVALID_OWNED_REPLACEMENT'));
  assert.ok(report.findings.some(f=>f.issue==='MISSING_OR_DUPLICATE_KEY'));
});
test('rejects ambiguous observations and missing ledger',()=>{
  assert.throws(()=>assessSearchResults({schema:'wrong',entries:[],search_observations:[]}),/invalid_publisher_ledger/);
  const report=assessSearchResults(ledger([entry({status:'PUBLISHED',observed_on:'unknown'})]));
  assert.ok(report.findings.some(f=>f.issue==='UNSUPPORTED_OBSERVATION_STATUS'));
  assert.ok(report.findings.some(f=>f.issue==='OBSERVATION_DATE_REQUIRED'));
});
