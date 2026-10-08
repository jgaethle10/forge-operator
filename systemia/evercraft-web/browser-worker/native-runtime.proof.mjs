import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  prepareNativeBrowserRuntime,
} from './native-runtime.mjs';

const configuredState=String(process.env.EVERCRAFT_NATIVE_BROWSER_STATE_DIR||'').trim();
const ownsState=!configuredState;
const state=configuredState
  ? path.resolve(configuredState)
  : fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-native-browser-proof-'));
fs.mkdirSync(state,{recursive:true});
let runtime=null;

try{
  const prepared=await prepareNativeBrowserRuntime({
    sourceDir:process.cwd(),
    stateDir:state,
    allowInstall:true,
  });
  assert.equal(prepared.ready,true);
  assert.equal(prepared.mode,'native_user_playwright');
  assert.equal(prepared.sudo_used,false);
  assert.equal(prepared.system_package_manager_used,false);
  assert.equal(typeof prepared.browserRuntimeFactory,'function');
  assert.ok(String(prepared.chromium_version||'').length>0);
  assert.ok(String(prepared.receipt_hash||'').startsWith('sha256:'));

  runtime=await prepared.browserRuntimeFactory({
    maxConcurrency:1,
    jobStateDir:path.join(state,'durable-jobs'),
  });

  const health=await runtime.health();
  assert.equal(health.ok,true);
  assert.equal(health.service,'evercraft-owned-browser-worker');
  assert.equal(health.runtime,'Evercraft Compute');
  assert.equal(health.execution_mode,'native_user_playwright');
  assert.equal(health.durable_jobs_enabled,true);

  const browse=await runtime.browse({
    url:'https://example.com/',
    actions:[],
    viewport:{width:1024,height:768},
    timeout_ms:15_000,
    max_text_chars:10_000,
    include_screenshot:false,
    include_screenshot_base64:false,
  });
  assert.equal(browse.ok,true);
  assert.match(String(browse.final_url||''),/^https:\/\/example\.com/);
  assert.ok(String(browse.evidence_receipt_sha256||'').match(/^[a-f0-9]{64}$/));

  // The same native worker executes, screenshots, retries and receipts these jobs.
  // No simulated browser is substituted for the real Chromium canary.
  const idempotencySuffix=String(Date.now())+'-'+process.pid;
  const canaryJob={
    url:'https://example.com/',
    actions:[
      {type:'wait_for_selector',selector:'h1',timeout_ms:5000},
      {type:'scroll',x:0,y:100},
    ],
    timeout_ms:15000,
    include_screenshot:true,
    include_screenshot_base64:false,
  };
  const canaryEnvelope={
    idempotency_key:'browser-native-'+idempotencySuffix,
    mission_key:'systemia-browser-native-proof',
    work_key:'browser-native-readonly-001',
    job:canaryJob,
  };
  const submitted=await runtime.submitReadOnlyJob(canaryEnvelope);
  assert.equal(submitted.ok,true);
  assert.match(submitted.job.id,/^[0-9a-f-]{36}$/);
  const duplicate=await runtime.submitReadOnlyJob(canaryEnvelope);
  assert.equal(duplicate.job.id,submitted.job.id);
  assert.equal(duplicate.job.deduplicated,true);

  async function pollJob(id,timeoutMs=90000){
    const deadline=Date.now()+timeoutMs;
    while(Date.now()<deadline){
      const response=await runtime.readReadOnlyJob(id);
      if(['completed','failed','cancelled'].includes(response.job.state)) return response.job;
      await new Promise((resolve)=>setTimeout(resolve,250));
    }
    throw new Error('native_durable_job_poll_timeout');
  }

  const successfulJob=await pollJob(submitted.job.id);
  assert.equal(successfulJob.state,'completed',JSON.stringify(successfulJob));
  assert.equal(successfulJob.result.http_status,200);
  assert.equal(successfulJob.result.action_count,2);
  assert.match(successfulJob.result.evidence_receipt_sha256,/^[a-f0-9]{64}$/);
  assert.match(successfulJob.result.screenshot_sha256,/^[a-f0-9]{64}$/);
  assert.match(successfulJob.result.text_sha256,/^[a-f0-9]{64}$/);

  const failureJob=await runtime.submitReadOnlyJob({
    idempotency_key:'browser-fail-'+idempotencySuffix,
    mission_key:'systemia-browser-native-proof',
    work_key:'browser-native-failure-001',
    job:{
      url:'https://example.com/',
      timeout_ms:3000,
      actions:[{type:'wait_for_selector',selector:'#evercraft-nonexistent-sentinel',timeout_ms:200}],
    }
  });
  const controlledFailure=await pollJob(failureJob.job.id);
  assert.equal(controlledFailure.state,'failed');
  assert.equal(controlledFailure.attempts,2);
  assert.equal(controlledFailure.failure_reason,'browser_job_execution_failed');

  const durableEvidence={
    schema:'evercraft.browser.native-durable-proof.v1',
    execution_class:'native_user_playwright_ci_not_production',
    authorized_source:'https://example.com/',
    completed_job_id:successfulJob.id,
    evidence_receipt_sha256:successfulJob.result.evidence_receipt_sha256,
    screenshot_sha256:successfulJob.result.screenshot_sha256,
    text_sha256:successfulJob.result.text_sha256,
    observed_action_count:successfulJob.result.action_count,
    idempotent_duplicate_verified:true,
    controlled_failure_job_id:controlledFailure.id,
    controlled_failure_attempts:controlledFailure.attempts,
    failure_state:controlledFailure.state,
    simulated_restart_proved_by:'durable-jobs.test.mjs',
    production_deployment_verified:false,
  };
  fs.writeFileSync(path.join(state,'durable-proof.json'),JSON.stringify(durableEvidence,null,2)+'\n',{mode:0o600});
  if(process.env.GITHUB_STEP_SUMMARY){
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      '## Evercraft Browser native durable-job evidence\n'+
      '- Execution class: native user-space Chromium CI, not production\n'+
      '- Job: '+successfulJob.id+'\n'+
      '- Screenshot SHA-256: '+successfulJob.result.screenshot_sha256+'\n'+
      '- Evidence receipt SHA-256: '+successfulJob.result.evidence_receipt_sha256+'\n'+
      '- Controlled failure attempts: '+controlledFailure.attempts+'\n'+
      '- Production release gate: HOLD\n');
  }

  const session=await runtime.createAuthSession({
    url:'https://example.com/',
    viewport:{width:1024,height:768},
  });
  assert.equal(session.ok,true);
  assert.equal(session.mode,'human_authorized_ephemeral');
  assert.equal(session.persisted_profile,false);
  assert.equal(session.secret_text_returned,false);
  const handoff=new URL(session.handoff_path,'https://evercraft.invalid');
  const claim=new URLSearchParams(handoff.hash.slice(1)).get('claim');
  assert.ok(session.session_id);
  assert.ok(claim&&claim.length>=32);

  const delegation=await runtime.authDelegate(
    session.session_id,
    claim,
    {scopes:['read','same_origin_navigation','draft_form_fill','draft_save']}
  );
  assert.equal(delegation.ok,true);
  assert.equal(delegation.delegated,true);
  assert.equal(delegation.final_submission_authority,false);
  assert.equal(delegation.payment_authority,false);
  assert.equal(delegation.accepts_new_terms,false);

  const snapshot=await runtime.delegatedSnapshot(session.session_id);
  assert.equal(snapshot.ok,true);
  assert.equal(snapshot.mode,'competition_draft_automation');
  assert.equal(snapshot.delegation.final_submission_authority,false);

  const close=await runtime.authClose(session.session_id,claim);
  assert.equal(close.ok,true);
  assert.equal(close.closed,true);

  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.browser.native-runtime-proof.v1',
    mode:'native_user_playwright',
    chromium_version:prepared.chromium_version,
    browser_worker_health:true,
    durable_browser_job:durableEvidence,
    live_https_browse:true,
    authenticated_handoff:true,
    delegated_draft_automation:true,
    final_submission_authority:false,
    payment_authority:false,
    accepts_new_terms:false,
    sudo_used:false,
    system_package_manager_used:false,
    preflight_receipt_hash:prepared.receipt_hash,
  },null,2));
}finally{
  if(runtime){
    try{await runtime.close();}catch{}
  }
  if(ownsState) fs.rmSync(state,{recursive:true,force:true});
}
