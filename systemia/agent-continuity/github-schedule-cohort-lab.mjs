#!/usr/bin/env node
// Live GitHub five-lane source evidence -> one common lab incident.
// Ephemeral signing key is generated inside CI only. Read-only same-root custody
// is neither a production identity grant nor external-effect proof.
import {generateKeyPairSync,sign} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {observeScheduledCohort,cohortToSharedIncidentEvents} from './github-schedule-cohort.mjs';
import {appendJournalEvent,localIncidentProjections} from './incident-journal.mjs';
const observed=await observeScheduledCohort({
 repo:process.env.GITHUB_REPOSITORY,
 token:process.env.GITHUB_TOKEN
});
const packet=cohortToSharedIncidentEvents(observed);
const kp=generateKeyPairSync('ed25519');
const key_id='ci-owned-cohort-ephemeral',purpose='evercraft.blackbox.readonly-ingest.v1';
const tenant_id='evercraft',mission_id='evercraft-agent-continuity-fabric-20261016';
const trust={[key_id]:{public_key_pem:kp.publicKey.export({format:'pem',type:'spki'}),
 tenant_id,source_id:'owned-github-actions-cohort',actor_ids:['github-schedule-cohort-lab'],permission_scopes:['audit:read']}};
const journal_root=mkdtempSync(join(tmpdir(),'blackbox-shared-schedule-cohort-'));
let custody;
try{
 const source_hashes=[];
 for(const payload of packet.events){
  const envelope={key_id,purpose,payload,signature:sign(null,Buffer.from(purpose+'\n'+JSON.stringify(payload)),kp.privateKey).toString('base64')};
  const saved=appendJournalEvent({envelope,trust,policy:{tenant_id,mission_id,now:Date.parse(observed.observed_at)},journal_root});
  source_hashes.push({event_id:saved.receipt.event_id,event_sha256:saved.receipt.event_sha256});
 }
 let projections=null;
 if(packet.events.length){
   projections=localIncidentProjections({journal_root,tenant_id,mission_id,incident_id:packet.incident_id,trust});
   if(projections.black_box.timeline.length!==packet.events.length ||
     projections.chum.incident_trail_candidates.length!==packet.events.length ||
     projections.spider_society.persistence_candidates.length!==packet.events.length ||
     projections.execution_authority!=='NONE_READ_ONLY'||projections.spider_society.no_regeneration_proven!==false||
     projections.chum.real_chum_invocation!==false)throw Error('Shared source evidence projections violated');
 }
 custody={
   packet_incident_id:packet.incident_id,source_events_written:source_hashes.length,
   source_hashes,blackbox_event_count:projections?.black_box.timeline.length??0,
   chum_local_candidates:projections?.chum.incident_trail_candidates.length??0,
   spider_local_candidates:projections?.spider_society.persistence_candidates.length??0,
   excluded_missing_lanes:packet.excluded_missing_lanes,
   correlation_semantics:'TEMPORAL_CORRELATION_ONLY_NOT_CAUSATION',
   local_source_signature:'CI_EPHEMERAL_NOT_PRODUCTION_IDENTITY',
   local_custody:'WRITE_ONCE_FSYNCED_SAME_TRUST_ROOT_NOT_REMOTE',
   producer_consumer_receipt_state:'LOCAL_ONLY',
   external_verifier_state:'NOT_PRESENT',
   service_calls_executed:false,
   authorization:'NONE_READ_ONLY'
 };
}finally{
 rmSync(journal_root,{recursive:true,force:true});
}
if(observed.source_execution_authority!=='NONE_READ_ONLY'||observed.common_cause_verified!==false||
 observed.actual_agent_telemetry_verified!==false||observed.service_recovery_verified!==false ||
 custody.service_calls_executed!==false || custody.authorization!=='NONE_READ_ONLY')
 throw Error('Cohort read-only acceptance contract violated');
process.stdout.write(JSON.stringify({...observed,shared_local_incident:custody},null,2)+'\n');
