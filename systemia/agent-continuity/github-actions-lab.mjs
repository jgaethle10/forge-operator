#!/usr/bin/env node
// CI-only first live provider readback. Ephemeral signing key is generated for
// this single isolated run. This is NOT production source enrollment or an
// independent provider-effect verifier; no credential or agent command is sent.
import {generateKeyPairSync,sign} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fetchOwnedGithubRun,githubRunToIncidentEvent} from './github-actions-source.mjs';
import {appendJournalEvent,localIncidentProjections,readJournalEvent} from './incident-journal.mjs';

const tenant_id='evercraft';
const mission_id='evercraft-agent-continuity-fabric-20261016';
const repo=process.env.GITHUB_REPOSITORY;
const run_id=Number(process.env.GITHUB_RUN_ID);
const token=process.env.GITHUB_TOKEN;
const workflow='entire-blackbox-evidence.yml';
const observation=await fetchOwnedGithubRun({repo,workflow,run_id,tenant_id,mission_id,token});
const now=Date.now();
const payload=githubRunToIncidentEvent(observation,{tenant_id,mission_id,observed_at:new Date(now).toISOString()});
const kp=generateKeyPairSync('ed25519');
const key_id='ci-lab-ephemeral-readonly';
const purpose='evercraft.blackbox.readonly-ingest.v1';
const signature=sign(null,Buffer.from(purpose+'\n'+JSON.stringify(payload)),kp.privateKey).toString('base64');
const envelope={key_id,purpose,payload,signature};
const trust={[key_id]:{
  public_key_pem:kp.publicKey.export({type:'spki',format:'pem'}),
  tenant_id,source_id:'owned-github-actions-readback',
  actor_ids:['github-actions-readonly-adapter'],permission_scopes:['audit:read']
}};
const journal_root=mkdtempSync(join(tmpdir(),'blackbox-readonly-live-source-'));
try{
  const policy={tenant_id,mission_id,now};
  const appended=appendJournalEvent({journal_root,envelope,trust,policy});
  const reopened=readJournalEvent({journal_root,tenant_id,mission_id,incident_id:payload.incident_id,event_id:payload.event_id,trust,policy});
  const local=localIncidentProjections({journal_root,tenant_id,mission_id,incident_id:payload.incident_id,trust,policy});
  if(reopened.receipt.event_sha256!==appended.receipt.event_sha256||
    local.black_box.timeline.length!==1||
    local.incident_id!==payload.incident_id||
    local.spider_society.live_process_inventory!==false||
    local.chum.real_chum_invocation!==false||
    local.black_box.external_provider_verification!=='NOT_PERFORMED') throw Error('CI lab readback invariants failed');
  const out={
    schema:'evercraft.blackbox.ci-lab-source-receipt.v1',
    provider:'github_actions_api',provider_run_id:observation.run_id,provider_workflow:observation.workflow_file,
    provider_commit:observation.head_sha,provider_reported_status:observation.github_status,
    provider_reported_conclusion:observation.github_conclusion,provider_url:observation.provider_url,
    incident_id:payload.incident_id,event_id:payload.event_id,event_sha256:appended.receipt.event_sha256,
    local_producer:'temporary_ci_ephemeral_key_not_production_authority',
    accepted:'LOCAL_READONLY_SIGNED_EVENT_WITH_GITHUB_API_SOURCE_READBACK',
    independent_provider_effect_verified:false,live_agent_telemetry_verified:false,
    cross_product_runtime_integrated:false,live_containment_performed:false,
    same_root_local_readback:true,local_custody:appended.local_custody_state
  };
  process.stdout.write(JSON.stringify(out,null,2)+'\n');
}finally{
  rmSync(journal_root,{recursive:true,force:true});
}
