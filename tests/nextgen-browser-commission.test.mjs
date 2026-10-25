import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {requireNextGenLocal,sanitizeNode002AgentStatus,verifyPublicBrowserEvidence} from '../scripts/nextgen-browser-commission.mjs';

const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const target='https://www.dshs.wa.gov/information-potential-medicaid-contractors';
function sample(){
  const snapshot={text:'Government provider application guidance',title:'HRSN'};
  const png=Buffer.from('synthetic-public-page-image-fixture');
  const boundaries={
    allowed_network_methods:['GET','HEAD','OPTIONS'],
    form_submit_action_supported:false,arbitrary_click_action_supported:false,
    private_and_reserved_targets_blocked:true,
  };
  const evidence={
    engine:'evercraft-owned-browser-worker-v1',mode:'public_read_only',
    requested_url:target,final_url:target,http_status:200,title:'HRSN',
    text_sha256:hash(snapshot.text),screenshot_sha256:hash(png),
    actions:[],blocked_network_events:[],console_errors:[],
    started_at:'2026-10-25T17:00:00.000Z',finished_at:'2026-10-25T17:00:01.000Z',
    duration_ms:1000,boundaries,
  };
  return {
    ok:true,...evidence,snapshot,
    screenshot:{base64:png.toString('base64'),sha256:hash(png)},
    evidence_receipt_sha256:hash(JSON.stringify(evidence)),
  };
}
test('remote GitHub runner cannot impersonate the actual HP host',()=>{
  assert.equal(requireNextGenLocal({hostname:'NextGen',platform:'linux'}),true);
  for(const input of [
    {hostname:'penguin',platform:'linux'},
    {hostname:'nextgen',platform:'win32'},
    {hostname:'ci-runner',platform:'linux'},
  ])assert.throws(()=>requireNextGenLocal(input),/physical_nextgen_linux_required/);
});
test('Node002 status projection redacts keys and unknown content',()=>{
  assert.deepEqual(sanitizeNode002AgentStatus({
    config_mode:'shadow',remote_jobs_enabled:false,
    status:{telemetry_state:'SHADOW_HEARTBEAT_ACK'},
    private_token:'NEVER_EMIT',device_id:'SENSITIVE',
  }),{state:'observed_local',config_mode:'shadow',remote_jobs_enabled:false,telemetry_state:'SHADOW_HEARTBEAT_ACK'});
  assert.deepEqual(sanitizeNode002AgentStatus(null),{state:'unavailable'});
});
test('public read-only worker evidence is independently hashed and accepted',()=>{
  const result=verifyPublicBrowserEvidence(sample());
  assert.equal(result.verified,true);
  assert.equal(result.http_status,200);
  assert.equal('snapshot' in result,false);
  assert.equal('screenshot' in result,false);
});
test('fake or modified worker identity and network methods fail closed',()=>{
  const bad=sample();bad.engine='other-browser';
  assert.throws(()=>verifyPublicBrowserEvidence(bad),/identity_failed/);
  const write=sample();write.boundaries.allowed_network_methods.push('POST');
  assert.throws(()=>verifyPublicBrowserEvidence(write),/boundary_failed/);
  const side=sample();side.boundaries.form_submit_action_supported=true;
  assert.throws(()=>verifyPublicBrowserEvidence(side),/boundary_failed/);
});
test('changed site or synthetic submit proof is rejected',()=>{
  const wrong=sample();wrong.requested_url='https://fake-gov.example/';
  assert.throws(()=>verifyPublicBrowserEvidence(wrong),/target_mismatch/);
  const denied=sample();denied.http_status=403;
  assert.throws(()=>verifyPublicBrowserEvidence(denied),/target_mismatch/);
});
test('tampered text, screenshot and evidence digest are rejected',()=>{
  const text=sample();text.snapshot.text+=' mutated';
  assert.throws(()=>verifyPublicBrowserEvidence(text),/page_text_digest_mismatch/);
  const shot=sample();shot.screenshot.base64=Buffer.from('tampered').toString('base64');
  assert.throws(()=>verifyPublicBrowserEvidence(shot),/screenshot_digest_mismatch/);
  const receipt=sample();receipt.evidence_receipt_sha256='a'.repeat(64);
  assert.throws(()=>verifyPublicBrowserEvidence(receipt),/browser_receipt_digest_mismatch/);
});
test('--status is read-only, independently inspectable and never grants remote jobs',()=>{
  const file=path.join(path.dirname(fileURLToPath(import.meta.url)),'../scripts/nextgen-browser-commission.mjs');
  const p=spawnSync(process.execPath,[file,'--status'],{encoding:'utf8',timeout:5000});
  assert.equal(p.status,0,p.stderr);
  const body=JSON.parse(p.stdout);
  assert.equal(body.schema,'evercraft.nextgen.browser-local-status.v1');
  assert.equal(body.remote_dispatch_authority_granted_by_this_script,false);
  assert.equal(body.physical_node_claim_allowed,false); // CI/local test host isn't NextGen
});
test('the commission script never exposes an arbitrary URL, host control or portal-submit CLI',()=>{
  const file=path.join(path.dirname(fileURLToPath(import.meta.url)),'../scripts/nextgen-browser-commission.mjs');
  const source=fs.readFileSync(file,'utf8');
  assert.match(source,/const TARGET_URL='https:\/\/www.dshs.wa.gov\/information-potential-medicaid-contractors'/);
  assert.match(source,/--status','--preflight','--install','--run'/);
  assert.match(source,/remote_work_admission_verified:false/);
  assert.match(source,/portal_application_submitted:false/);
});
