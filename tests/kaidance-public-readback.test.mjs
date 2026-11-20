import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyPublicKaidanceReadback} from '../systemia/collider/public-readback.mjs';
import {projectPublicKaidancePulse} from '../systemia/collider/public-projection.mjs';

const clock=new Date('2026-11-19T20:06:00.000Z');
function projected(){
 return projectPublicKaidancePulse({
  schema:'evercraft.kaidance.pulse.v1',resident:true,state:'healthy',
  cycle_number:45,last_completed_cycle:'2026-11-19T20:05:00.000Z',
  heartbeat_target_seconds:300,coverage_receipt_valid:true,admitted_count:7,held_count:3,
  field_attestation:{state:'verified',receipt:'private-field-proof'},
  observed_at:'2026-11-19T20:05:08.000Z'
 },{now:clock});
}
const url='https://kaidance.example.test/kaidance/pulse.json';
function fixture(body=projected(),headers={'content-type':'application/json'},status=200){
 return async()=>({ok:status===200,status,headers:new Headers(headers),text:async()=>JSON.stringify(body)});
}
test('real public-surface verifier reports exact source and freshness, no private data',async()=>{
 const report=await verifyPublicKaidanceReadback({url,fetchImpl:fixture(),now:clock.getTime()});
 assert.equal(report.status,'verified');
 assert.equal(report.cycle_number,45);
 assert.equal(report.cycle_age_seconds,60);
 assert.equal(report.source_url,url);
});
test('HTTPS same-origin canonical route is required and URLs cannot include credentials',async()=>{
 for(const invalid of [
  'http://kaidance.example.test/kaidance/pulse.json',
  'https://kaidance.example.test/some-other-path',
  'https://user:secret@kaidance.example.test/kaidance/pulse.json',
  'https://kaidance.example.test/kaidance/pulse.json?token=bad'
 ]){
  await assert.rejects(()=>verifyPublicKaidanceReadback({url:invalid,fetchImpl:fixture(),now:clock.getTime()}),/public_url_must_be_owned_https_kaidance_pulse/);
 }
});
test('stale, not field-attested, malformed and unavailable sources fail closed',async()=>{
 const ok=projected();
 for(const [body,status,headers] of [
  [{...ok,field_attestation_verified:false},200,{'content-type':'application/json'}],
  [{...ok,published_at:'2026-11-19T19:00:00Z'},200,{'content-type':'application/json'}],
  [ok,404,{'content-type':'application/json'}],
  [ok,200,{'content-type':'text/html'}]
 ]){
  await assert.rejects(()=>verifyPublicKaidanceReadback({url,fetchImpl:fixture(body,headers,status),now:clock.getTime()}));
 }
});
