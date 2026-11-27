// Shadow-only two-role Saban reconciliation. This does NOT dispatch agents.
// Caller-provided predeclared expectations are not a substitute for an actual
// Systemia admission, signed identity, or independently established truth.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {evaluateDeclaredArtifact} from './declared-artifact-evidence.mjs';
import {verifyRemoteSourceObservation} from './remote-source-observation.mjs';
import {checkSalesReport} from '../../public/work-saban/report/engine.mjs';

const SHA=/^sha256:[a-f0-9]{64}$/;
const ID=/^[a-z0-9][a-z0-9._-]{5,79}$/;
const ROLES=['analyst','auditor'];
const sha=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
const fail=(receipt,reason)=>({...receipt,status:'hold',reason});

function expectedEntries(mission,entries) {
  if(!Array.isArray(entries)||entries.length!==2)throw new Error('two_roles_required');
  const byRole=new Map();
  const workers=new Set();
  const paths=new Set();
  for(const entry of entries){
    if(!ROLES.includes(entry?.role)||byRole.has(entry.role))
      throw new Error('unique_analyst_and_auditor_required');
    if(!ID.test(String(entry.agent_id||''))||workers.has(entry.agent_id))
      throw new Error('distinct_worker_identity_required');
    if(entry.task_id!==mission+':'+entry.role||
       entry.idempotency_key!=='saban:'+entry.task_id)
      throw new Error('assignment_binding_mismatch');
    if(!SHA.test(String(entry.expected_sha256||''))||
       !Number.isSafeInteger(entry.expected_bytes)||entry.expected_bytes<0||
       entry.expected_bytes>1024*1024)
      throw new Error('artifact_expectation_invalid');
    if(typeof entry.relative_path!=='string'||paths.has(entry.relative_path))
      throw new Error('distinct_artifact_paths_required');
    paths.add(entry.relative_path);
    workers.add(entry.agent_id);
    byRole.set(entry.role,entry);
  }
  return ROLES.map(role=>byRole.get(role));
}

export function reconcileShadowSalesDelegation({
  root,csvText,manifest,workerReports=[],sourcePages,
}={}){
  // No writes and no model calls. User-supplied CSV remains local to caller.
  const receipt={
    schema:'evercraft.saban.shadow-sales-reconciliation.v1',
    mission_id:manifest?.mission_id??null,
    status:'hold',reason:null,verified_artifacts:0,
    roles:[],source_sha256:null,
    deterministic_sales_check_passed:false,
    runtime_dispatched:false,
    independent_worker_identity_verified:false,
    live_systemia_admission_verified:false,
    customer_data_transmitted:false,
    remote_source_observation_status:'not_requested',
    remote_source_pages_verified:0,
    remote_node_identity_attested:false,
  };
  try{
    const mission=manifest?.mission_id;
    if(typeof mission!=='string'||!ID.test(mission))
      return fail(receipt,'mission_id_invalid');
    if(typeof csvText!=='string')
      return fail(receipt,'source_csv_required');
    const sourceHash=sha(Buffer.from(csvText,'utf8'));
    receipt.source_sha256=sourceHash;
    if(!SHA.test(String(manifest.source_sha256||''))||
       sourceHash!==manifest.source_sha256)
      return fail(receipt,'source_identity_mismatch');
    // Optional, explicit source-read quality gate. When a coordinator
    // declares a remote source, omission of pages is itself a hold.
    // This path only verifies source bytes, never model/task semantics.
    if(Object.hasOwn(manifest,'source_observation')||sourcePages!==undefined){
      const bound=manifest.source_observation;
      if(!bound||typeof bound!=='object'){
        receipt.remote_source_observation_status='hold';
        return fail(receipt,'source_observation_binding_missing');
      }
      const source=verifyRemoteSourceObservation({
        missionId:mission,sourceId:bound.source_id,
        rootKey:bound.root_key,relativePath:bound.relative_path,
        expectedSha256:sourceHash,
        expectedBytes:Buffer.byteLength(csvText,'utf8'),
        pages:sourcePages,
      });
      receipt.remote_source_observation_status=source.status;
      receipt.remote_source_pages_verified=source.pages_verified;
      if(source.status!=='source_bytes_verified'){
        return fail(receipt,'source_observation_'+source.reason);
      }
    }
    const entries=expectedEntries(mission,manifest.entries);
    if(!Array.isArray(workerReports)||workerReports.length!==2)
      return fail(receipt,'two_worker_reports_required');
    const byId=new Map();
    for(const report of workerReports){
      if(!report||byId.has(report.task_id))return fail(receipt,'duplicate_or_missing_worker_report');
      byId.set(report.task_id,report);
    }
    for(const entry of entries){
      const reported=byId.get(entry.task_id);
      if(!reported||reported.agent_id!==entry.agent_id||
        reported.role!==entry.role||
        reported.idempotency_key!==entry.idempotency_key||
        reported.mission_id!==mission||
        reported.source_sha256!==sourceHash){
        return fail(receipt,'worker_report_binding_mismatch');
      }
      const checked=evaluateDeclaredArtifact({
        root,relativePath:entry.relative_path,
        expectedSha256:entry.expected_sha256,
        expectedBytes:entry.expected_bytes,
        agentId:entry.agent_id,
        idempotencyKey:entry.idempotency_key,
        workerReport:reported,
      });
      receipt.roles.push({
        role:entry.role,task_id:entry.task_id,agent_id:entry.agent_id,
        artifact_sha256:checked.observed_sha256,
        artifact_status:checked.status,
        worker_claimed_complete:checked.worker_claimed_complete,
      });
      if(checked.status!=='declared_artifact_match')
        return fail(receipt,'artifact_'+entry.role+'_'+(checked.reason||'unverified'));
      receipt.verified_artifacts++;
    }
    // Defense-in-depth: recheck exact bytes after opening by the verifier.
    // This is a shadow harness, not a race-safe hostile-workspace transport.
    const read=(entry)=>{
      const bytes=fs.readFileSync(path.join(path.resolve(root),entry.relative_path));
      if(bytes.length!==entry.expected_bytes||sha(bytes)!==entry.expected_sha256)
        throw new Error('artifact_changed_after_check');
      return JSON.parse(bytes.toString('utf8'));
    };
    const analyst=read(entries[0]);
    const auditor=read(entries[1]);
    if(!checkSalesReport(csvText,analyst))
      return fail(receipt,'independent_sales_arithmetic_failed');
    if(auditor?.schema!=='evercraft.saban.shadow-audit.v1'||
       auditor.source_sha256!==sourceHash||
       auditor.analyst_sha256!==entries[0].expected_sha256||
       auditor.passed!==true)
      return fail(receipt,'auditor_claim_binding_mismatch');
    receipt.deterministic_sales_check_passed=true;
    receipt.status='shadow_artifacts_reconciled';
    return receipt;
  }catch(error){
    return fail(receipt,error?.code==='ENOENT'?'artifact_missing':
      String(error?.message||'unexpected_verification_error'));
  }
}
