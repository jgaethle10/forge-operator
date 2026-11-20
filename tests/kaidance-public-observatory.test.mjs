import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {projectPublicKaidancePulse} from '../systemia/collider/public-projection.mjs';
import {assessPublicPulse,durationText} from '../public/kaidance/pulse-source.mjs';

const now=new Date('2026-11-19T20:06:00Z');
const pulse={
 schema:'evercraft.kaidance.pulse.v1',state:'healthy',resident:true,
 cycle_number:16,last_cycle_key:'private:cycle:16',
 last_completed_cycle:'2026-11-19T20:05:00Z',
 heartbeat_target_seconds:300,coverage_receipt_valid:true,
 last_coverage_receipt_key:'private:receipt',admitted_count:6,held_count:2,
 deployment_receipt:'deploy:internal',compute_node_id:'private-node-id',
 continuity:{action:'recover',receipt_hash:'private-hash'},
 safe_holds:[{category:'remote_device_trust',count:7}],
 field_attestation:{state:'verified',receipt:'private-attestation',verified_at:'2026-11-19T20:05:05Z'},
 observed_at:'2026-11-19T20:05:08Z'
};
test('projection only emits a strict non-sensitive allowlist',()=>{
 const output=projectPublicKaidancePulse(pulse,{now});
 assert.deepEqual(Object.keys(output),[
  'schema','state','cycle_number','last_completed_cycle','heartbeat_target_seconds',
  'admitted_count','held_count','coverage_receipt_valid','field_attestation_verified','observed_at','published_at'
 ]);
 const raw=JSON.stringify(output);
 for(const privateThing of ['private-node-id','private-attestation','private:receipt','private-hash',
    'safe_holds','deployment_receipt','continuity','last_cycle_key','mission','customer']){
   assert.equal(raw.includes(privateThing),false,privateThing);
 }
 assert.equal(output.field_attestation_verified,true);
 assert.equal(output.cycle_number,16);
});
test('verified, timely pulse can render as observed, never automatically advance a cycle',()=>{
 const projected=projectPublicKaidancePulse(pulse,{now});
 const p=assessPublicPulse(projected,now.getTime());
 assert.equal(p.ok,true);assert.equal(p.verified,true);assert.equal(p.fresh,true);
 assert.equal(p.cycle_number,16);assert.equal(p.age_seconds,60);
 assert.equal(durationText(241),'04:01');
});
test('unverified and stale pulses cannot claim verified live status',()=>{
 const noAttest=projectPublicKaidancePulse({...pulse,field_attestation:{state:'not_verified'}},{now});
 assert.equal(assessPublicPulse(noAttest,now.getTime()).verified,false);
 const stale=assessPublicPulse(projectPublicKaidancePulse(pulse,{now}),now.getTime()+421000);
 assert.equal(stale.ok,true);assert.equal(stale.verified,false);assert.equal(stale.sourceFresh,false);
 assert.equal(assessPublicPulse({...noAttest,state:'degraded'},now.getTime()).verified,false);
});
test('bad sources and unauthorized shapes fail closed',()=>{
 assert.throws(()=>projectPublicKaidancePulse({schema:'evercraft.kaidance.runtime-health.v1'},{now}),/approved_safe_pulse_required/);
 assert.throws(()=>projectPublicKaidancePulse({...pulse,cycle_number:-1},{now}),/cycle_number_invalid/);
 assert.throws(()=>projectPublicKaidancePulse({...pulse,customer_token:'sensitive'},{now}),/leaks forbidden field/);
 assert.throws(()=>projectPublicKaidancePulse({...pulse,observed_at:'not a date'},{now}),/observed_at_invalid/);
 const projected=projectPublicKaidancePulse(pulse,{now});
 assert.equal(assessPublicPulse({...projected,published_at:'2050-01-01T00:00:00Z'},now.getTime()).ok,false);
 assert.equal(assessPublicPulse({...projected,admitted_count:'6'},now.getTime()).ok,false);
});
test('public page includes real provenance, portrait controls, and no fake activity data',()=>{
 const html=readFileSync(new URL('../public/kaidance/index.html',import.meta.url),'utf8');
 const script=readFileSync(new URL('../public/kaidance/app.mjs',import.meta.url),'utf8');
 assert.match(html,/Content-Security-Policy/);
 assert.match(html,/9:16 LIVE VIEW/);
 assert.match(html,/NO SOURCE TIMESTAMP/);
 assert.match(script,/normalizePublicActivity/);
 assert.match(script,/pulse\.json/);
 assert.doesNotMatch(script,/innerHTML\s*=/);
 assert.equal(existsSync(new URL('../public/kaidance/pulse.json',import.meta.url)),false,
   'No fabricated public pulse JSON may be checked into source');
});
