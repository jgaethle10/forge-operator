// Strict evidence packet for the two-GitHub-runner Spider Society SANDBOX drill.
// Provider transport is authenticated by GitHub Actions artifact download,
// not by these payload bytes or by independently enrolled production keys.
import {createHash} from 'node:crypto';
const HEX=/^[a-f0-9]{64}$/;
function hold(s){throw Error('SPIDER_CROSS_RUNNER_PACKET_HELD: '+s)}
export function validateTransferPacket(mission){
 if(!mission||typeof mission!=='object'||Array.isArray(mission)||
 mission.schema!=='evercraft.rogue-agent.actual-local-process-drill.v1'||
 mission.mission_execution_id!=='rogue-drill-20261017-local-001'||
 mission.result!=='PASSED_CONTAINED_LOCAL_ROGUE_DRILL_NOT_PRODUCTION'||
 mission.observed_rogue_process_terminated!==true||
 mission.agent_post_quarantine_retry!=='DENIED_QUARANTINED'||
 mission.real_spider_service_invoked!==false||
 mission.operator_production_admission_verified!==false||
 mission.external_effect_verified!==false||
 mission.authority!=='NONE_READ_ONLY')hold('source mission lineage or authority mismatch');
 const packet=mission.transfer_packet;
 if(!packet||packet.schema!=='evercraft.spider.rogue-cross-runner-transfer.v1'||
 packet.source_mission_execution_id!==mission.mission_execution_id||
 packet.source_incident_id!=='rogue-drill-20261017-local-001'||
 packet.synthetic_drill_only!==true||
 packet.source_service_state!=='LOCAL_SANDBOX_NOT_REAL_SPIDER'||
 packet.transport_state!=='AWAITING_PROVIDER_ARTIFACT_UPLOAD')hold('packet class and provenance mismatch');
 const hashes=packet.source_blackbox_event_hashes;
 if(!Array.isArray(hashes)||hashes.length!==8||hashes.some(h=>!HEX.test(h))||
 new Set(hashes).size!==hashes.length||
 packet.source_blackbox_event_count!==8||
 mission.blackbox?.events!==8||
 JSON.stringify(hashes)!==JSON.stringify(mission.blackbox.signed_event_hashes)||
 packet.source_blackbox_manifest_sha256!==createHash('sha256').update(JSON.stringify(hashes)).digest('hex'))
 hold('Black Box source event hash lineage inconsistent');
 const s=packet.spider_snapshot;
 if(!s||s.schema!=='evercraft.spider.sandbox-quarantine-drill.v1'||
 s.tenant_id!=='evercraft-drill'||s.workload_id!=='saban-synthetic-rogue-001'||
 s.status!=='quarantined'||s.generation!==1||
 !Array.isArray(s.queue)||!Array.isArray(s.callbacks)||
 !Array.isArray(s.successors)||!Array.isArray(s.leases)||
 s.queue.filter(x=>x.state==='held').length!==1||
 s.callbacks.filter(x=>x.state==='held').length!==1||
 s.successors.filter(x=>x.state==='denied').length!==1||
 s.leases.filter(x=>x.state==='held').length!==1)hold('quarantine snapshot not exact');
 const observed=createHash('sha256').update(JSON.stringify(s)).digest('hex');
 if(!HEX.test(packet.spider_snapshot_sha256)||packet.spider_snapshot_sha256!==observed)
  hold('source snapshot digest mismatch');
 return {schema:'evercraft.spider.cross-runner-source-verification.v1',
  source_incident_id:packet.source_incident_id,source_blackbox_count:8,
  source_blackbox_manifest_sha256:createHash('sha256').update(JSON.stringify(hashes)).digest('hex'),
  source_snapshot_sha256:observed,source_status:'FROZEN_LOCAL_SANDBOX_ONLY',
  external_owner_trust_verified:false,production_spider_authority:false,
  execution_authority:'NONE_READ_ONLY'};
}
