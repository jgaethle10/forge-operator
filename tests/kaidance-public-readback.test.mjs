import test from 'node:test';
import assert from 'node:assert/strict';
import {approvedPublicPulseUrl,readbackPublicKaidance} from '../scripts/kaidance-public-readback.mjs';
const NOW=Date.parse('2026-11-19T20:06:00Z');
function pulse(attested=true){
 return {
   schema:'evercraft.kaidance.public-pulse.v1',
   state:'healthy',cycle_number:17,last_completed_cycle:'2026-11-19T20:05:00.000Z',
   heartbeat_target_seconds:300,admitted_count:3,held_count:1,
   coverage_receipt_valid:true,field_attestation_verified:attested,
   observed_at:'2026-11-19T20:05:30.000Z',
   published_at:'2026-11-19T20:06:00.000Z',
 };
}
function fakeFetch(value,status=200){
 const calls=[];
 const f=async(url,options)=>{
  calls.push({url,options});
  const text=typeof value==='string'?value:JSON.stringify(value);
  return {ok:status===200,status,headers:{get:()=>String(text.length)},text:async()=>text};
 };
 return {f,calls};
}
test('independent HTTPS check only targets one approved public pulse path',async()=>{
 assert.equal(approvedPublicPulseUrl('https://kaidance.example.org'),'https://kaidance.example.org/kaidance/pulse.json');
 for(const bad of ['http://kaidance.example.org','https://kaidance.example.org/hidden',
                   'https://kaidance.example.org/?redirect=1','https://user:pw@kaidance.example.org',
                   'https://kaidance.example.org:8443']){
  assert.throws(()=>approvedPublicPulseUrl(bad),/approved_https_origin_required/);
 }
 const source=fakeFetch(pulse());
 const result=await readbackPublicKaidance({origin:'https://kaidance.example.org',now:NOW,fetchImpl:source.f});
 assert.equal(result.ok,true);
 assert.equal(result.verified,true);
 assert.equal(result.cycle_number,17);
 assert.equal(result.heartbeat_age_seconds,60);
 assert.equal(source.calls[0].url,'https://kaidance.example.org/kaidance/pulse.json');
 assert.equal(source.calls[0].options.redirect,'error');
});
test('unattested, stale, or failed public source never passes external live verification',async()=>{
 const opts={origin:'https://kaidance.example.org',now:NOW};
 await assert.rejects(readbackPublicKaidance({...opts,fetchImpl:fakeFetch(pulse(false)).f}),/public_pulse_not_verified_live/);
 await assert.rejects(readbackPublicKaidance({...opts,now:NOW+600000,fetchImpl:fakeFetch(pulse()).f}),/public_pulse_not_verified_live/);
 await assert.rejects(readbackPublicKaidance({...opts,fetchImpl:fakeFetch(pulse(),500).f}),/pulse_http_unavailable/);
 await assert.rejects(readbackPublicKaidance({...opts,fetchImpl:fakeFetch('bad JSON').f}),/pulse_json_invalid/);
});
test('readback enforces a strict payload size limit',async()=>{
 const oversized=fakeFetch('x'.repeat(20000));
 await assert.rejects(readbackPublicKaidance({origin:'https://kaidance.example.org',now:NOW,fetchImpl:oversized.f}),/pulse_too_large/);
});
