#!/usr/bin/env node
// CI laboratory: provider-authenticated READ of an existing scheduled heartbeat.
// In-branch output is a bounded, ephemeral proof of source observation only.
import {generateKeyPairSync,sign} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fetchScheduledRevenueHeartbeat,fetchRevenueHeartbeatWorkflowConfiguration} from './github-heartbeat-source.mjs';
import {githubRunToIncidentEvent} from './github-actions-source.mjs';
import {appendJournalEvent,readJournalEvent,localIncidentProjections} from './incident-journal.mjs';

const tenant_id='evercraft',mission_id='evercraft-agent-continuity-fabric-20261016';
const observed=await fetchScheduledRevenueHeartbeat({
 repo:process.env.GITHUB_REPOSITORY,tenant_id,mission_id,
 token:process.env.GITHUB_TOKEN,max_age_ms:45*60_000
});
const configuration=await fetchRevenueHeartbeatWorkflowConfiguration({repo:process.env.GITHUB_REPOSITORY,token:process.env.GITHUB_TOKEN});
const summary={
 schema:'evercraft.blackbox.scheduled-heartbeat-source-lab.v1',
 source:'owned_revenue_autonomy_heartbeat_scheduled_github_run',
 observed_at:observed.observed_at,
 provider_query:observed.source_query,provider_source_state:observed.source_state,
 source_runs_returned:observed.source_count,
 provider_workflow:'revenue-autonomy-heartbeat.yml',
 provider_workflow_configuration_state:configuration.provider_workflow_state,
 provider_workflow_metadata_verified:configuration.metadata_readback_verified,
 provider_run_id:observed.run?.run_id??null,
 provider_reported_status:observed.run?.github_status??null,
 provider_reported_conclusion:observed.run?.github_conclusion??null,
 provider_url:observed.run?.provider_url??null,
 provider_scheduled_run_age_ms:observed.detail?.scheduled_run_age_ms??null,
 source_observed_from:'TWO_GITHUB_READONLY_GET_RESPONSES_IF_PRESENT',
 incident_id:null,event_id:null,event_sha256:null,
 local_custody_receipt_verified:false,
 identity_state:'CI_EPHEMERAL_LAB_ONLY',
 live_agent_telemetry_verified:false,
 external_effect_provider_verified:false,
 actual_heartbeat_json_consumed:false,
 shared_chum_spider_runtime_called:false,
 production_identity_granted:false,
 execution_authority:'NONE_READ_ONLY',
 next_proof:'SIGNED_OWNER_SCOPED_PRODUCTION_AGENT_SCHEDULER_READBACK_AFTER_SYSTEMIA_ADMISSION'
};
if(observed.run){
 const payload=githubRunToIncidentEvent(observed.run,{tenant_id,mission_id,observed_at:observed.observed_at});
 const pair=generateKeyPairSync('ed25519'),purpose='evercraft.blackbox.readonly-ingest.v1',key_id='heartbeat-ci-ephemeral';
 const envelope={purpose,key_id,payload,signature:sign(null,Buffer.from(purpose+'\n'+JSON.stringify(payload)),pair.privateKey).toString('base64')};
 const trust={[key_id]:{
   public_key_pem:pair.publicKey.export({type:'spki',format:'pem'}),
   tenant_id,source_id:'owned-github-actions-readback',
   actor_ids:['github-actions-readonly-adapter'],permission_scopes:['audit:read']
 }};
 const journal_root=mkdtempSync(join(tmpdir(),'blackbox-owned-heartbeat-lab-'));
 try{
   const policy={tenant_id,mission_id,now:Date.parse(observed.observed_at)};
   const appended=appendJournalEvent({journal_root,envelope,trust,policy});
   const reopened=readJournalEvent({journal_root,tenant_id,mission_id,incident_id:payload.incident_id,event_id:payload.event_id,trust,policy});
   const projections=localIncidentProjections({journal_root,tenant_id,mission_id,incident_id:payload.incident_id,trust,policy});
   if(reopened.receipt.event_sha256!==appended.receipt.event_sha256||projections.black_box.timeline.length!==1||projections.black_box.external_provider_verification!=='NOT_PERFORMED'||projections.chum.real_chum_invocation||projections.spider_society.live_process_inventory)throw Error('heartbeat lab custody invariant held');
   summary.incident_id=payload.incident_id;
   summary.event_id=payload.event_id;
   summary.event_sha256=appended.receipt.event_sha256;
   summary.local_custody_receipt_verified=true;
 }finally{
   rmSync(journal_root,{force:true,recursive:true});
 }
}
if(configuration.provider_workflow_state!=='active'){
 summary.next_proof='HELD_GITHUB_WORKFLOW_CONFIGURATION_NOT_ACTIVE_OWNER_REVIEW_REQUIRED';
}else if(summary.provider_source_state!=='SCHEDULED_RUN_PROVIDER_OBSERVED'){
 summary.next_proof='HELD_SCHEDULED_HEARTBEAT_MISSING_OR_STALE_CHECK_WORKFLOW_CADENCE_AND_PROVIDER_STATUS';
}
process.stdout.write(JSON.stringify(summary,null,2)+'\n');
