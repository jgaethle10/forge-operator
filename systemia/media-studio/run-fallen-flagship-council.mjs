#!/usr/bin/env node
/**
 * Non-billable Creative Council dry run for Evercraft Commercial Studio.
 * Uses the existing Fallen/Saban deterministic role adapter.
 * Does NOT invoke LLM agents, paid render providers, publication, or Vast.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {runAssignment,reconcile} from './creative-council-saban-adapter.mjs';

const fixturePath=new URL('../saban/fixtures/fallen-flagship-commercial-creative-council-job.json',import.meta.url);
const manifest=JSON.parse(fs.readFileSync(fixturePath,'utf8'));
const outArg=process.argv.indexOf('--output');
const out=path.resolve(outArg>=0 ? process.argv[outArg+1] : 'artifacts/fallen-flagship-council/creative-council-receipt.json');
const STOP=(msg)=>{throw new Error(msg);};
if(manifest.schema!=='evercraft.fallen.flagship.creative-council-handoff.v1') STOP('unknown_manifest_schema');
if(manifest.publication_authority!==false || manifest.production_budget?.provisioning_blocked_until_receipts_and_cleanup_verified!==true) STOP('unsafe_release_or_provisioning_state');
if(manifest.stage!=='CREATIVE_REVIEW_ONLY') STOP('unexpected_execution_state');
if(manifest.production_budget?.first_canary_total_allocation!==3) STOP('canary_allocation_mismatch');
if(!Array.isArray(manifest.roles) || new Set(manifest.roles).size!==14) STOP('council_must_have_14_roles');
if(!Array.isArray(manifest.jobs) || manifest.jobs.length!==5) STOP('five_shots_required');
const total=Number(manifest.jobs.reduce((n,j)=>n+Number(j.shot?.durationSec||0),0).toFixed(2));
if(total!==30) STOP('flagship_runtime_not_30_seconds');
const assignments=[];
for(const job of manifest.jobs){
  if(job.kind!=='fallen_creative_shot') STOP('unrecognized_job_kind');
  if(job.shot?.sourceType!=='generation_request') STOP('unexpected_source_kind');
  if(job.shot?.aspectRatio!=='9:16') STOP('vertical_master_required');
  for(const role of manifest.roles){
    assignments.push(await runAssignment({assignment:{agent_id:'fallen-flagship:'+role,role,item:{shot:job.shot}}}));
  }
}
const reconciliation=await reconcile({results:assignments,plan:{roles:manifest.roles}});
const ready=assignments.length===70 &&
  assignments.every(x=>x.status==='completed') &&
  Number(reconciliation.shot_count)===5 &&
  Number(reconciliation.blocked_shot_count)===0;
const inputSha=crypto.createHash('sha256').update(fs.readFileSync(fixturePath)).digest('hex');
const receipt={
  schema:'evercraft.fallen.flagship.creative-council-dry-run.v1',
  mission_id:manifest.mission_id,
  status:ready?'CREATIVE_SCHEMA_READY':'CREATIVE_BLOCKED',
  execution_class:'LOCAL_DETERMINISTIC_RULE_BASED_COUNCIL',
  input_sha256:inputSha,
  shot_count:manifest.jobs.length,
  role_count:manifest.roles.length,
  assignment_count:assignments.length,
  duration_seconds:total,
  creative_notes:assignments,
  reconciliation,
  gates:{
    provider_called:false,
    physical_assets_rendered:false,
    independent_llm_agents_convened:false,
    footage_beauty_evaluated:false,
    vast_instance_created:false,
    spend_incurred:false,
    publication_authorized:false,
    requires_visual_review:true,
    requires_provider_billing_controls:true
  }
};
fs.mkdirSync(path.dirname(out),{recursive:true});
fs.writeFileSync(out,JSON.stringify(receipt,null,2)+'\n','utf8');
const summary=`## Evercraft Fallen flagship / Council dry run\n\n| Metric | Result |\n|---|---|\n| Manifest | \${manifest.mission_id} |\n| Duration | \${total}s |\n| Shots | \${manifest.jobs.length} |\n| Deterministic role notes | \${assignments.length} |\n| Creative schema status | \${receipt.status} |\n| Media produced | NO |\n| Vast spend | \$0 |\n| Publication | NOT AUTHORIZED |\n\n**This is deterministic creative-direction validation, not 14 autonomous agents reviewing rendered footage.**\n`;
if(process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,summary);
console.log(JSON.stringify({status:receipt.status,shot_count:receipt.shot_count,role_count:receipt.role_count,assignments:receipt.assignment_count,duration_seconds:total,receipt:out,budget_allocation_usd:3,provider_called:false},null,2));
if(!ready) process.exitCode=1;
