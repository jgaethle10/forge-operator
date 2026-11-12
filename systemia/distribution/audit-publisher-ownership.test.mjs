import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const script = new URL('./audit-publisher-ownership.mjs', import.meta.url).pathname;
function audit(entries) {
  const folder = mkdtempSync(join(tmpdir(), 'publisher-audit-'));
  try {
    const source = join(folder, 'ledger.json'), destination = join(folder, 'receipt.json');
    writeFileSync(source,JSON.stringify({schema:'evercraft.distribution.publisher-ownership.v1',entries}));
    const result = spawnSync(process.execPath,[script,source,destination],{encoding:'utf8'});
    return {exitCode:result.status, receipt:JSON.parse(readFileSync(destination,'utf8'))};
  } finally { rmSync(folder,{recursive:true,force:true}); }
}
test('private plugin with actual internal ID and provenance passes without public URL', () => {
  const r=audit([{key:'private',status:'DISCOVERED',visibility:'PRIVATE',internal_plugin_id:'plugins_123',evidence:{source:'Plugin Creator inventory'}}]);
  assert.equal(r.exitCode,0);
  assert.equal(r.receipt.status,'VALID_LEDGER_NOT_OWNERSHIP_PROOF');
});
test('a discovered public listing must provide its exact URL', () => {
  const r=audit([{key:'public',status:'DISCOVERED'}]);
  assert.equal(r.exitCode,1);
  assert.equal(r.receipt.findings[0].issue,'NO_SOURCE_URL_OR_PRIVATE_ID_EVIDENCE');
});
test('a positive claim requires independently recorded publisher proof', () => {
  const r=audit([{key:'claimed',status:'CLAIMED',public_url:'https://example.com/listing'}]);
  assert.equal(r.exitCode,1);
  assert.ok(r.receipt.findings.some(x=>x.issue==='MISSING_PUBLISHER_RECEIPT'));
});
test('private account inventory cannot masquerade as a public release', () => {
  const r=audit([{key:'private',status:'PUBLISHED',visibility:'PRIVATE',internal_plugin_id:'plugins_123',evidence:{source:'inventory',receipt_url:'https://example.com/a',verified_at:'2026-10-25'},current_release_verified:true}]);
  assert.equal(r.exitCode,1);
  assert.ok(r.receipt.findings.some(x=>x.issue==='PRIVATE_RECORD_CANNOT_ASSERT_PUBLIC_RELEASE'));
});
test('unknown provider state is allowed but does not imply ownership', () => {
  const r=audit([{key:'unverified',status:'UNKNOWN'}]);
  assert.equal(r.exitCode,0);
  assert.equal(r.receipt.status,'VALID_LEDGER_NOT_OWNERSHIP_PROOF');
});

test('first-party public portal screenshot can be tracked without claiming independent discovery',()=>{
  const r=audit([{
    key:'evercraft-public',status:'PORTAL_LISTED_PUBLICLY_OBSERVED',release:'1.0.2',visibility:'PUBLIC_PORTAL',
    evidence:{source:'founder OpenAI Platform screenshot',receipt:'distribution/openai-plugin/public-listing-observation-2026-11-10.json',independent_fresh_account_discovery:false}
  }]);
  assert.equal(r.exitCode,0);
  assert.equal(r.receipt.status,'VALID_LEDGER_NOT_OWNERSHIP_PROOF');
});
test('portal-observed release cannot masquerade as independently attested',()=>{
  const r=audit([{
    key:'evercraft-public',status:'PORTAL_LISTED_PUBLICLY_OBSERVED',release:'1.0.2',visibility:'PUBLIC_PORTAL',current_release_verified:true,
    evidence:{source:'founder screenshot',receipt:'source/receipt.json',independent_fresh_account_discovery:false}
  }]);
  assert.equal(r.exitCode,1);
  assert.ok(r.receipt.findings.some(x=>x.issue==='PORTAL_SCREENSHOT_NOT_INDEPENDENT_RELEASE_ATTESTATION'));
});
test('uninstalled duplicate stays in ledger without being advertised as public',()=>{
  const r=audit([{
    key:'old-duplicate',status:'UNINSTALLED_FROM_CHATGPT',visibility:'NOT_INSTALLED',
    internal_plugin_id:'plugin_asdk_app_123',evidence:{source:'verified ChatGPT uninstall'}
  }]);
  assert.equal(r.exitCode,0);
});
test('unsubstantiated portal publication observation fails closed',()=>{
  const r=audit([{key:'portal-guess',status:'PORTAL_LISTED_PUBLICLY_OBSERVED',visibility:'PUBLIC_PORTAL',release:'1.0.2'}]);
  assert.equal(r.exitCode,1);
  assert.ok(r.receipt.findings.some(x=>x.issue==='PORTAL_OBSERVATION_EVIDENCE_INCOMPLETE'));
});
