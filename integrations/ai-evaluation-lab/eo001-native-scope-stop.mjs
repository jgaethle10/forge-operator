/**
 * EO-001 Gate 1: source-only opt-in native exact-user-scope STOP controller.
 *
 * This is an OFFLINE SIMULATION component, not a live stop controller.
 * Importing it has no effects. In-memory fake stop calls require a scoped
 * Ed25519 test permit, pinned fake checkout and a private one-use audit sink.
 * There is NO native systemd stop adapter: a name-based StopUnit remains
 * unsafe under unit replacement races. No production keys/runner are wired.
 *
 * This cannot guarantee manager unit identity against replacement races,
 * enforce a private sink's true durability, attest a host or prove physical
 * cleanup. The supervisor must separately verify post-stop kernel evidence.
 * NO numeric PID/group signals, retries, model/provider or production effects.
 */
import {createPublicKey,verify,createHash} from 'node:crypto';
import {parseExactScopeProperties} from './eo001-cgroup-supervisor-observer.mjs';
import {parseStableProcIdentity} from './eo001-stable-scope-lifecycle.mjs';

const refuse=code=>{const e=new Error(code);e.code=code;throw e;};
const requireThat=(p,code)=>{if(!p)refuse(code);};
const UNIT=/^eo001-g1-synthetic-[a-f0-9]{32}\.scope$/;
const SHA40=/^[a-f0-9]{40}$/;
const HEX32=/^[a-f0-9]{32}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const numeric=n=>typeof n==='string'&&/^[1-9][0-9]*$/.test(n);
const safeInt=n=>Number.isSafeInteger(n)&&n>=0;
const sha=v=>createHash('sha256').update(v).digest('hex');
const DOMAIN='evercraft.eo001.synthetic-scope-stop-permit.v1\n';
const hold=(state,reason,step,stopIssued=false,extra={})=>Object.freeze({
  schema:'evercraft.eo001.gate1.native-stop-blocked.v1',
  state,reason,step,stop_request_issued:stopIssued,
  exact_scope_cleanup_verified:false,independent_host_attestation:false,
  model_execution_authorized:false,provider_effects_authorized:false,
  ...extra
});
function checkPermit({permit,signatures,trust,proposal,now}){
  const fields=['action','boot_id','cgroup_path','device','inode',
    'nonce','schema','scope_unit','source_revision','stop_budget_ms',
    'valid_from_ms','valid_until_ms'];
  requireThat(permit&&typeof permit==='object'&&!Array.isArray(permit)&&
    Object.keys(permit).sort().join('|')===fields.sort().join('|'),
    'STOP_PERMIT_FIELDS_NOT_EXACT');
  requireThat(permit?.schema==='evercraft.eo001.synthetic-stop-permit.v1'&&
    permit.action==='EXACT_USER_SCOPE_STOP_ONLY'&&
    UNIT.test(permit.scope_unit||'')&&
    SHA40.test(permit.source_revision||'')&&
    UUID.test(permit.boot_id||'')&&
    HEX32.test(permit.nonce||'')&&
    numeric(permit.device)&&numeric(permit.inode)&&
    typeof permit.cgroup_path==='string'&&
    safeInt(permit.valid_from_ms)&&safeInt(permit.valid_until_ms)&&
    permit.valid_until_ms>=permit.valid_from_ms&&
    permit.valid_until_ms-permit.valid_from_ms<=300000&&
    safeInt(now)&&now>=permit.valid_from_ms&&now<=permit.valid_until_ms&&
    permit.stop_budget_ms===proposal.proposed_unit_control?.timeout_ms&&
    permit.source_revision===proposal.reviewed_source_revision&&
    permit.scope_unit===proposal.scope_unit&&
    permit.cgroup_path===proposal.cgroup_path&&
    signatures&&trust,
    'STOP_PERMIT_INVALID_OR_EXPIRED');
  requireThat(permit.stop_budget_ms>=500&&permit.stop_budget_ms<=5000&&
    signatures.owner&&signatures.reviewer&&
    typeof trust.owner==='string'&&typeof trust.reviewer==='string'&&
    trust.owner!==trust.reviewer,
    'STOP_PERMIT_ROLES_NOT_INDEPENDENT');
  const bytes=Buffer.from(DOMAIN+JSON.stringify(permit));
  const normalized=[];
  for(const role of ['owner','reviewer']){
    const signature=signatures[role];
    requireThat(typeof signature==='string'&&
      /^[A-Za-z0-9+/]+={0,2}$/.test(signature)&&signature.length<512,
      'STOP_PERMIT_SIGNATURE_INVALID');
    let ok=false;
    try{
      const sig=Buffer.from(signature,'base64');
      const key=createPublicKey(trust[role]);
      normalized.push(key.export({format:'der',type:'spki'}).toString('hex'));
      ok=sig.length===64&&key.asymmetricKeyType==='ed25519'&&
        verify(null,bytes,key,sig);
    }catch{}
    requireThat(ok,'STOP_PERMIT_SIGNATURE_INVALID');
  }
  requireThat(normalized.length===2&&normalized[0]!==normalized[1],
    'STOP_PERMIT_ROLES_NOT_INDEPENDENT');
  return sha(bytes);
}
function checkProposal(p){
  requireThat(p?.schema==='evercraft.eo001.gate1.exact-scope-stop-review.v1'&&
    p.state==='FIXED_SYNTHETIC_STOP_CANDIDATE_REQUIRES_INDEPENDENT_REVIEW'&&
    p.requires_fresh_explicit_owner_approval===true&&
    p.execution_authorized===false&&p.actual_stop_performed===false&&
    p.executable_implementation_reviewed===false&&
    UNIT.test(p.scope_unit||'')&&SHA40.test(p.reviewed_source_revision||'')&&
    p.proposed_unit_control?.program==='systemctl'&&
    JSON.stringify(p.proposed_unit_control.args)===
      JSON.stringify(['--user','stop',p.scope_unit]),
    'NATIVE_STOP_UNREVIEWED_PROPOSAL');
}
function checkWitnessPre(pre,permit){
  requireThat(pre&&pre.boot_id===permit.boot_id&&
    pre.cgroup?.path===permit.cgroup_path&&
    String(pre.cgroup.device)===permit.device&&
    String(pre.cgroup.inode)===permit.inode&&
    pre.cgroup.swap?.observed_value==='0'&&
    Number.isSafeInteger(pre.worker?.pid)&&
    Number.isSafeInteger(pre.detached?.pid)&&
    pre.worker.pid!==pre.detached.pid&&
    pre.worker.cgroup==='0::'+permit.cgroup_path+'\n'&&
    pre.detached.cgroup==='0::'+permit.cgroup_path+'\n'&&
    pre.cgroup.process_ids?.includes(pre.worker.pid)&&
    pre.cgroup.process_ids?.includes(pre.detached.pid),
    'NATIVE_STOP_WITNESS_SCOPE_MISMATCH');
  const w=parseStableProcIdentity({raw:pre.worker.stat,
    expectedPid:pre.worker.pid,bootId:pre.boot_id});
  const d=parseStableProcIdentity({raw:pre.detached.stat,
    expectedPid:pre.detached.pid,bootId:pre.boot_id});
  requireThat(!['Z','X','x'].includes(w.state)&&
    !['Z','X','x'].includes(d.state)&&
    d.parent_pid===w.pid&&d.group_id===d.pid&&d.session_id===d.pid&&
    w.session_id!==d.session_id,
    'NATIVE_STOP_LIVE_DETACHED_PROCESS_NOT_ESTABLISHED');
  return {worker:w,detached:d};
}
function verifyImmediateKernelReadback(io,permit,pre,identities){
  const sys=parseExactScopeProperties(io.show(permit.scope_unit));
  requireThat(sys.ControlGroup===permit.cgroup_path,
    'NATIVE_STOP_MANAGER_SCOPE_CHANGED');
  requireThat(io.boot()===permit.boot_id,
    'NATIVE_STOP_HOST_BOOT_CHANGED');
  const cg=io.identity(permit.cgroup_path,permit.scope_unit);
  requireThat(cg?.device===permit.device&&cg?.inode===permit.inode,
    'NATIVE_STOP_KERNEL_SCOPE_CHANGED');
  requireThat(io.selfCgroup()!== '0::'+permit.cgroup_path+'\n'&&
    !io.selfCgroup().startsWith('0::'+permit.cgroup_path+'/'),
    'NATIVE_STOP_OBSERVER_INSIDE_TARGET');
  for(const role of ['worker','detached']){
    const old=identities[role],raw=io.procStat(old.pid);
    const fresh=parseStableProcIdentity({raw,expectedPid:old.pid,
      bootId:permit.boot_id});
    requireThat(fresh.start_ticks===old.start_ticks&&
      fresh.group_id===old.group_id&&
      fresh.session_id===old.session_id&&
      fresh.parent_pid===old.parent_pid&&
      !['Z','X','x'].includes(fresh.state)&&
      io.procCgroup(old.pid)==='0::'+permit.cgroup_path+'\n',
      'NATIVE_STOP_PROCESS_IDENTITY_CHANGED');
  }
  return io.monotonic();
}
/**
 * Native host I/O is deliberately absent until a reviewed stable target
 * binding mechanism is approved for an exact synthetic unit.
 */
// No production native I/O adapter is admitted. The older source used a
// by-name systemctl stop after a readback, which is not an atomic identity
// binding. This component now accepts only injected, explicitly labeled
// offline simulation responses. A future owned field runner needs a
// separately reviewed stop primitive, trust roots, and explicit host approval.
/**
 * Side effects require ALL external dependencies. A mere user approval
 * sentence/boolean or CI green status is never one-shot field permission.
 * io/sink can be mocked in CI; this is not remote independent attestation.
 */
export function attemptApprovedExactSyntheticScopeStop({
  proposal,permit,signatures,trust,witness,
  sink,io
}={}){
  // Refuse before even reading systemd if the caller lacks a private sink.
  requireThat(witness&&typeof witness.before==='function'&&
    typeof witness.finish==='function'&&
    typeof witness.close==='function',
    'NATIVE_STOP_PERSISTENCE_OR_WITNESS_MISSING');
  if(!sink||typeof sink.reserve!=='function'||
    typeof sink.record!=='function'){
    try{witness.close();}catch{}
    refuse('NATIVE_STOP_PERSISTENCE_OR_WITNESS_MISSING');
  }
  if(!io||io.executionMode!=='OFFLINE_SYNTHETIC_IO'){
    try{witness.close();}catch{}
    return hold('NATIVE_EXACT_SCOPE_STOP_HELD',
      'NATIVE_STOP_MANAGER_ATOMIC_BINDING_UNAVAILABLE',
      'PRE_ADMISSION',false,{
        offline_simulation_only:true,
        stop_permit_reserved:false,
        local_failure_record_persisted:false
      });
  }
  let issued=false,reserved=false,stage='PRE_ADMISSION';
  let approvedDigest=null,localIO=null,pre=null;
  let stopStart=null,stopEnd=null,stopResult=null;
  let witnessFinished=false;
  const record=(receipt)=>{
    const ok=sink.record(receipt);
    requireThat(ok===true,'NATIVE_STOP_PRIVATE_RECEIPT_NOT_DURABLE');
  };
  try{
    checkProposal(proposal);
    localIO=io;
    approvedDigest=checkPermit({permit,signatures,trust,
      proposal,now:localIO.now()});
    requireThat(localIO.cleanCommit(permit.source_revision)===true,
      'NATIVE_STOP_SOURCE_NOT_PINNED_CLEAN');
    pre=witness.before();
    const identities=checkWitnessPre(pre,permit);
    stage='FRESH_TARGET_REVALIDATION';
    const recheck=verifyImmediateKernelReadback(localIO,permit,pre,identities);
    requireThat(localIO.monotonic()-recheck<=200,
      'NATIVE_STOP_MANAGER_RECHECK_STALE');
    // External sink must guarantee durable, one-use reservation of digest.
    // This module cannot verify that a mocked or owner-run sink does so.
    stage='PRE_STOP_DURABLE_RESERVATION';
    requireThat(sink.reserve(approvedDigest)===true,
      'NATIVE_STOP_PERMIT_REPLAY_OR_RESERVATION_FAILED');
    reserved=true;
    record({schema:'evercraft.eo001.native-stop-prestop.v1',
      state:'PRESTOP_APPROVAL_AND_SCOPE_METADATA_RECORDED',
      permit_digest_sha256:approvedDigest,
      scope_unit:permit.scope_unit,source_revision:permit.source_revision,
      actual_stop_performed:false,physical_proof:false});
    // Reservation/audit may block: re-read the *same* active unit and
    // exact worker identities immediately before the native stop request.
    stage='FINAL_PRESTOP_REVALIDATION';
    const secondRead=verifyImmediateKernelReadback(localIO,permit,pre,identities);
    requireThat(localIO.monotonic()-secondRead<=200,
      'NATIVE_STOP_FINAL_RECHECK_STALE');
    stage='EXACT_UNIT_STOP';
    stopStart=localIO.monotonic();
    issued=true;
    stopResult=localIO.stopExact(permit.scope_unit,permit.stop_budget_ms);
    stopEnd=localIO.monotonic();
    requireThat(stopResult&&stopResult.status===0&&
      stopResult.timedOut===false&&
      stopEnd>=stopStart&&stopEnd-stopStart<=permit.stop_budget_ms,
      'NATIVE_STOP_NOT_ACKNOWLEDGED_OR_TIMEOUT');
    stage='POSTSTOP_SUPERVISOR_READBACK';
    witnessFinished=true;
    const observed=witness.finish({
      method:'systemd-user-exact-unit-control-group',
      unit:permit.scope_unit,start_monotonic_ms:stopStart,
      end_monotonic_ms:stopEnd,cleanup_budget_ms:permit.stop_budget_ms,
      outcome:'stop-request-acknowledged'
    });
    // The observer can only return internally consistent, non-attested proof.
    requireThat(observed?.state===
      'READ_ONLY_LIFECYCLE_CONSISTENCY_REVIEW_REQUIRED'&&
      observed.verdict?.execution_authorized===false&&
      observed.verdict?.actual_process_death_independently_proven===false,
      'NATIVE_STOP_POSTSTOP_EVIDENCE_NOT_VERIFIED');
    stage='FINAL_PRIVATE_RECEIPT';
    record({schema:'evercraft.eo001.native-stop-observation.v1',
      state:'STOP_ACK_AND_SUPERVISOR_METADATA_CONSISTENT_REVIEW_REQUIRED',
      permit_digest_sha256:approvedDigest,
      scope_unit:permit.scope_unit,source_revision:permit.source_revision,
      packet_sha256:observed.raw_capture_sha256,
      actual_stop_performed_by_controller:true,
      independently_attested:false,
      full_scope_cleanup_independently_proven:false});
    return hold('SYNTHETIC_STOP_ACK_METADATA_REVIEW_REQUIRED',
      'NOT_INDEPENDENT_HOST_ATTESTATION','COMPLETE',true,{
      permit_digest_sha256:approvedDigest,
      stop_request_acknowledged:true,
      local_supervisor_metadata_consistent:true
    });
  }catch(error){
    // Even a failed/timeout systemctl stop may have changed the cgroup.
    // Attempt one independent readback using the held original cgroup FD,
    // but never treat it as cleanup success or run another stop/kill.
    let postFailure=error?.private_negative_receipt||null;
    if(issued&&!witnessFinished){
      witnessFinished=true;
      try{
        const outcome=witness.finish({
          method:'systemd-user-exact-unit-control-group',
          unit:permit.scope_unit,start_monotonic_ms:stopStart,
          end_monotonic_ms:stopEnd??localIO.monotonic(),
          cleanup_budget_ms:permit.stop_budget_ms,
          outcome:'stop-failed-or-unknown'
        });
        // A mismatched supplied witness should not become a success here.
        if(outcome)postFailure={
          state:'POSTSTOP_CAPTURE_SUPPLIED_BUT_STOP_NOT_ACKNOWLEDGED'
        };
      }catch(secondary){
        postFailure=secondary?.private_negative_receipt||{
          state:'POSTSTOP_KERNEL_OBSERVATION_MISSING_OR_UNVERIFIED'
        };
      }
    }
    const reason=/^[A-Z_]+$/.test(error?.code||'')?error.code:
      /^[A-Z_]+$/.test(error?.message||'')?error.message:
      'NATIVE_STOP_UNKNOWN_FAILURE';
    const blocked=hold('NATIVE_EXACT_SCOPE_STOP_HELD',reason,stage,issued,{
      permit_digest_sha256:approvedDigest,
      private_negative_observation_supplied:Boolean(postFailure)
    });
    // A ledger with one-use semantics must refuse record() before
    // reserve(). Early validation or replay failure therefore has no
    // write authorization. Keep the precise denial reason visible, rather
    // than rewriting it as an unrelated disk-persistence failure.
    if(!reserved){
      return hold('NATIVE_EXACT_SCOPE_STOP_HELD',reason,stage,issued,{
        permit_digest_sha256:approvedDigest,
        private_negative_observation_supplied:Boolean(postFailure),
        local_failure_record_persisted:false,
        stop_permit_reserved:false
      });
    }
    try{
      // NO retries, numeric PID kills or broad cleanup from this path.
      // The caller's private sink must retain the full error receipt itself.
      record({...blocked,private_negative_receipt:postFailure});
    }catch{
      return hold('NATIVE_EXACT_SCOPE_STOP_HELD',
        'NATIVE_STOP_PRIVATE_RECEIPT_NOT_DURABLE',stage,issued,{
        permit_digest_sha256:approvedDigest
      });
    }
    return blocked;
  }finally{
    try{witness.close();}catch{}
  }
}
