import test from 'node:test';
import assert from 'node:assert/strict';
import {runRogueAgentMission} from './rogue-field-drill.mjs';
import {runCrossRunnerSpiderMission} from './spider-cross-runner-mission.mjs';
import {validateTransferPacket} from './spider-cross-runner-contract.mjs';
test('source mission packet is cryptographically bound to observed local Black Box manifest and frozen Spider state',async()=>{
 const m=await runRogueAgentMission();
 const v=validateTransferPacket(m);
 assert.notStrictEqual(m.transfer_packet.source_blackbox_event_hashes,m.blackbox.signed_event_hashes);
 assert.equal(v.source_blackbox_count,8);
 assert.equal(v.production_spider_authority,false);
 assert.equal(v.external_owner_trust_verified,false);
 for(const mutate of [
   x=>{x.transfer_packet.spider_snapshot.generation=0},
   x=>{x.transfer_packet.spider_snapshot.queue[0].state='pending'},
   x=>{x.transfer_packet.spider_snapshot_sha256='0'.repeat(64)},
   x=>{x.transfer_packet.source_blackbox_event_hashes[0]='0'.repeat(64)},
   x=>{x.transfer_packet.source_blackbox_manifest_sha256='0'.repeat(64)},
   x=>{x.real_spider_service_invoked=true}
 ]){
  const rogue=structuredClone(m);mutate(rogue);
  assert.throws(()=>validateTransferPacket(rogue),/SPIDER_CROSS_RUNNER_PACKET_HELD/);
 }
});
test('real restarted second test service denies replayed rogue actions after artifact handoff',async()=>{
 const mission=await runRogueAgentMission();
 const r=await runCrossRunnerSpiderMission(mission);
 assert.equal(r.local_http_service_started,true);
 assert.equal(r.receiver_service_os_restart_completed,true);
 assert.equal(r.unauthorized_request_rejected,true);
 assert.equal(r.tampered_import_rejected,true);
 assert.equal(r.duplicate_transfer_rejected,true);
 assert.equal(r.durable_state_sha256_unchanged_on_restart,true);
 assert.deepEqual(r.first_wave.map(x=>x.kind),['retry','callback','successor','cross_tenant_read']);
 assert.deepEqual(r.second_wave_after_restart.map(x=>x.kind),r.first_wave.map(x=>x.kind));
 assert.equal(r.final_readback.pending,0);
 assert.equal(r.first_readback.runnable_retries,0);
 assert.equal(r.restart_readback.active_leases,0);
 assert.equal(r.real_spider_society_service_called,false);
 assert.equal(r.global_no_regeneration_proven,false);
});
