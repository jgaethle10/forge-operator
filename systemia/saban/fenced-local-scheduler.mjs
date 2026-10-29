/**
 * Opt-in, zero-external-effects scheduler integration canary.
 *
 * This path runs the existing Saban adapter interface and work-state leasing,
 * but serializes ONE local worker through the fenced acknowledgement journal.
 * It is deliberately NOT eligible for general live products or remote nodes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {leaseNext, complete, fail, saveWorkState, loadWorkState} from './work-state.mjs';
import {SabanFencedAckJournal} from './fenced-ack-journal.mjs';

const hash = value => 'sha256:' + createHash('sha256').update(JSON.stringify(value)).digest('hex');

function assertCandidate({state,plan,contract,physicalWorkers,statePath,journal,adapter}) {
  if (state?.schema !== 'evercraft.saban.work-state.v1' || !state?.jobs ||
      !contract || !plan || !adapter || typeof adapter.runAssignment !== 'function') {
    throw new Error('fenced_scheduler_invalid_kernel_inputs');
  }
  // No automatic enablement for existing production software. This is a
  // separate source-audit-only candidate contract until explicit review.
  if (contract.software_id !== 'saban-fenced-readonly-canary' ||
      plan.software_id !== contract.software_id ||
      state.software_id !== contract.software_id ||
      contract.fenced_local_candidate !== 'read_only_no_external_effects' ||
      contract.side_effects?.external_network !== false ||
      contract.side_effects?.payment_obligation !== false ||
      contract.side_effects?.unsolicited_human_outreach !== false ||
      contract.side_effects?.automatic_checkout !== false ||
      contract.side_effects?.public_discovery_file_updates !== false) {
    throw new Error('fenced_scheduler_candidate_contract_required');
  }
  if (Number(physicalWorkers) !== 1) throw new Error('fenced_scheduler_requires_one_local_worker');
  if (typeof statePath !== 'string' || !statePath.trim() ||
      !(journal instanceof SabanFencedAckJournal) ||
      typeof journal.secret !== 'string' || journal.secret.length < 16 ||
      journal.maxAttempts !== 1) {
    throw new Error('fenced_scheduler_durable_state_and_journal_required');
  }
  if (Object.keys(state.jobs).length === 0 || Object.keys(state.jobs).length > 32) {
    throw new Error('fenced_scheduler_bounded_work_required');
  }
  for (const [jobId,job] of Object.entries(state.jobs)) {
    if (jobId !== job.job_id || job.software_id !== contract.software_id ||
        !['queued','completed','dead_letter'].includes(job.state) ||
        job.lease !== null || !Number.isSafeInteger(job.attempts) ||
        job.attempts < 0 || job.attempts > 3 || job.max_attempts !== 1 ||
        job.role !== 'source_readiness_auditor') {
      // If a crash left any active lease or mismatch, halt the whole run.
      throw new Error('fenced_scheduler_state_requires_independent_reconciliation');
    }
  }
}

function workDigest(job) {
  return hash({
    schema:'evercraft.saban.fenced-scheduler-work.v1',
    job_id:job.job_id,
    software_id:job.software_id,
    idempotency_key:job.idempotency_key,
    agent_id:job.agent_id,
    role:job.role,
    work:job.work,
    item:job.item
  });
}

function checkPersistentState(statePath,state) {
  if (!fs.existsSync(statePath)) return;
  const recorded=loadWorkState(statePath);
  if (hash(recorded)!==hash(state)) throw new Error('fenced_scheduler_stale_in_memory_state');
}

function preflight(state,journal) {
  // Submission is idempotent, but every journal state must match persisted
  // Saban state BEFORE any adapter is called.
  for (const job of Object.values(state.jobs)) {
    const journalState=journal.submit({
      jobKey:job.job_id,
      workloadClass:'saban-fenced-readonly-canary',
      workDigest:workDigest(job)
    });
    if (job.state==='queued' && !(journalState.state==='queued' &&
        journalState.attempts===job.attempts)) {
      throw new Error('fenced_scheduler_ambiguous_state_hold');
    }
    if (job.state==='completed' && !(journalState.state==='ack_recorded' &&
        journalState.attempts===job.attempts &&
        journalState.result_digest===hash(job.result===undefined?null:job.result) &&
        journalState.receipt_ref==='local-source-check:'+journalState.result_digest.slice(7,31))) {
      throw new Error('fenced_scheduler_completed_receipt_mismatch');
    }
    if (job.state==='dead_letter' && !['held','ambiguous_expired','ack_recorded','leased'].includes(journalState.state)) {
      throw new Error('fenced_scheduler_terminal_state_mismatch');
    }
  }
}

function boundedSummary(state) {
  const counts={};
  for(const j of Object.values(state.jobs)) counts[j.state]=(counts[j.state]||0)+1;
  return {software_id:state.software_id,total:Object.keys(state.jobs).length,counts};
}

export async function runFencedLocalScheduler({
  state,adapter,physicalWorkers,plan,contract,rootDir=process.cwd(),
  statePath,journal
}={}) {
  assertCandidate({state,adapter,physicalWorkers,plan,contract,statePath,journal});
  const target=path.resolve(statePath);
  fs.mkdirSync(path.dirname(target),{recursive:true,mode:0o700});
  const lock=target+'.fenced-run.lock';
  // Fail closed on stale process lock. Never steal a potentially active job.
  try {fs.mkdirSync(lock,{mode:0o700});}
  catch(e) {
    if(e?.code==='EEXIST')throw new Error('fenced_scheduler_another_runner_or_crash_hold');
    throw e;
  }
  try {
    checkPersistentState(target,state);
    preflight(state,journal);
    if(!fs.existsSync(target))saveWorkState(target,state);
    const workerId='worker-001';
    let executed=0;
    while(true) {
      const leased=leaseNext(state,{workerId});
      if(!leased)break;
      saveWorkState(target,state);
      // Crash between the Saban lease write and journal acquisition is HOLD
      // on next preflight. Never run the adapter without both durable leases.
      let token;
      try{
        token=journal.acquire({
          jobKey:leased.job_id,workerId,
          leaseMs:Math.min(600000,Math.max(1000,leased.lease_seconds*1000))
        }).lease_token;
      }catch(e){
        fail(state,{jobId:leased.job_id,workerId,retry:false,
          error:{code:'fenced_journal_acquisition_hold',message:'No execution without a journal lease'}});
        saveWorkState(target,state);
        throw e;
      }
      const started=Date.now();
      try{
        const result=await adapter.runAssignment({
          assignment:{
            agent_id:leased.agent_id,idempotency_key:leased.idempotency_key||null,
            role:leased.role,work:leased.work,item:leased.item
          },plan,contract,rootDir
        });
        // An acknowledgment is NOT independent verification of external
        // effects. The path admits only an explicitly read-only canary.
        const digest=hash(result===undefined?null:result);
        journal.acknowledge({
          jobKey:leased.job_id,workerId,leaseToken:token,
          resultDigest:digest,
          receiptRef:'local-source-check:'+digest.slice(7,31)
        });
        complete(state,{jobId:leased.job_id,workerId,result,metrics:{
          duration_ms:Math.max(0,Date.now()-started),worker_id:workerId
        }});
        saveWorkState(target,state);
        executed++;
      }catch(e) {
        try {journal.hold({
          jobKey:leased.job_id,workerId,leaseToken:token,
          reason:'read_only_adapter_or_ack_failed'
        });} catch {}
        // A crash may have happened after the local effect/ack; no retry.
        if(state.jobs[leased.job_id].state==='leased') {
          fail(state,{jobId:leased.job_id,workerId,retry:false,
            error:{code:'fenced_ambiguous_completion_hold',
              message:'Review journal before any new attempt'}});
          saveWorkState(target,state);
        }
        throw new Error('fenced_scheduler_ambiguous_completion_hold',{cause:e});
      }
    }
    return {
      schema:'evercraft.saban.fenced-local-scheduler-receipt.v1',
      state:'source_only_candidate',
      executed_assignments:executed,
      summary:boundedSummary(state),
      actual_external_effects_verified:false,
      physical_devices_used:false,
      production_dispatch_authorized:false,
      automatic_retries_enabled:false,
      live_passport_execution_permits_consumed:false,
      state
    };
  }finally {
    fs.rmdirSync(lock);
  }
}
