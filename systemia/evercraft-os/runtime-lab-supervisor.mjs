/**
 * Evercraft OS offline LAB-only process supervisor candidate.
 * This is not a production execution gateway, sandbox, container runtime, Passport integration,
 * or remote execution API. It only invokes a hash-pinned, owner-provided Node fixture script.
 * Do not pass untrusted scripts or use as a runtime for customer applications.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash, createPublicKey, randomUUID, verify } from 'node:crypto';
import { captureCurrentProcessInstance, observeProcessInstance } from './process-instance.mjs';
import { EvercraftOsLabLifecycleJournal } from './runtime-lab-journal.mjs';
import {EvercraftOsLabExternalWitnessGate} from './runtime-lab-external-witness.mjs';

const RESULT_SCHEMA = 'evercraft.os.lab-supervisor-result.v1';
const PERMIT_SCHEMA = 'evercraft.os.lab-runtime-permit.v1';
const BODY_SCHEMA = 'evercraft.os.lab-runtime-permit-body.v1';
const MAX_PERMIT_MS = 60_000;
const BASE_ENV = Object.freeze({ PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C' });
function canon(x) { return Array.isArray(x) ? x.map(canon) : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map(k => [k,canon(x[k])])) : x; }
function sha(x) { return 'sha256:' + createHash('sha256').update(x).digest('hex'); }
function hashFile(name) { return sha(fs.readFileSync(name)); }
function fail(reason) { return {schema: RESULT_SCHEMA,state:'held',reason,process_started:false,production_authority_granted:false}; }
function stamp(x) { if(typeof x!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(x)||!Number.isFinite(Date.parse(x))||new Date(x).toISOString()!==x)throw Error('permit_timestamp_invalid');return Date.parse(x); }
function id(x) { if(typeof x!=='string'||!/^[-_a-zA-Z0-9.:]{1,120}$/.test(x))throw Error('permit_id_invalid');return x; }
function exactKeys(object,keys) { return object && typeof object==='object'&&!Array.isArray(object)&&Object.keys(object).sort().join('|')===keys.slice().sort().join('|'); }
function fsyncDirectory(folder) { const fd=fs.openSync(folder,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);} }
function checkedDir(folder) { const parts=path.resolve(folder).split(path.sep); let current=path.sep;for(const part of parts){if(!part)continue; current=path.join(current,part);const st=fs.lstatSync(current);if(st.isSymbolicLink()||!st.isDirectory())throw Error('lab_directory_not_real');}return path.resolve(folder); }
function checkedFile(file) { const full=path.resolve(file); checkedDir(path.dirname(full));const s=fs.lstatSync(full);if(s.isSymbolicLink()||!s.isFile())throw Error('lab_fixture_not_regular');return full; }
function saveExclusive(file,obj) { const fd=fs.openSync(file,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL,0o600);try{fs.writeFileSync(fd,JSON.stringify(obj)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fsyncDirectory(path.dirname(file)); }
function appendEvent(file,obj) { const fd=fs.openSync(file,fs.constants.O_WRONLY|fs.constants.O_APPEND|fs.constants.O_CREAT,0o600);try{fs.writeFileSync(fd,JSON.stringify(obj)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);} }
function sameProcess(expected) { return observeProcessInstance(expected).state==='same_process_alive'; }

export class EvercraftOsLabRuntimeSupervisor {
  /** Keys provided by local test harness, never package/config/plan metadata. */
  constructor({labEnabled=false,authorityKey,gateVerifier,ledgerDirectory,fixtureScript,fixtureSha256,nodeBinary=process.execPath,now=()=>new Date(),witnessMode='legacy_local',witnessGate=null}={}) {
    if(labEnabled!==true) throw Error('lab_supervisor_disabled_by_default');
    if(process.platform!=='linux')throw Error('lab_supervisor_linux_only');
    if(typeof process.getuid==='function'&&process.getuid()===0)throw Error('lab_supervisor_refuses_root_execution');
    if(!gateVerifier||typeof gateVerifier.verify!=='function')throw Error('lab_gate_verifier_required');
    if(typeof now!=='function')throw Error('lab_clock_required');
    if(typeof authorityKey!=='string')throw Error('lab_authority_key_required');
    this.key=createPublicKey(authorityKey);
    if(this.key.asymmetricKeyType!=='ed25519')throw Error('lab_authority_key_must_be_ed25519');
    this.gates=gateVerifier;
    if(!['legacy_local','external_required'].includes(witnessMode))throw Error('lab_witness_mode_invalid');
    if(witnessMode==='external_required'&&!(witnessGate instanceof EvercraftOsLabExternalWitnessGate))throw Error('lab_external_witness_gate_required');
    this.witnessMode=witnessMode;this.witnessGate=witnessGate;
    this.now=now;
    this.fixture=checkedFile(fixtureScript);
    if(!/^sha256:[a-f0-9]{64}$/.test(fixtureSha256)||hashFile(this.fixture)!==fixtureSha256)throw Error('lab_fixture_integrity_failed');
    this.fixtureHash=fixtureSha256;
    this.binary=checkedFile(nodeBinary);
    // Explicit, measured Node runtime. This is a test prerequisite, NOT a production exec integrity primitive.
    this.binaryHash=hashFile(this.binary);
    fs.mkdirSync(ledgerDirectory,{recursive:true,mode:0o700});
    this.root=checkedDir(ledgerDirectory);
    this.locks=path.join(this.root,'locks');
    this.permits=path.join(this.root,'permits');
    this.events=path.join(this.root,'events');
    for(const dir of [this.locks,this.permits,this.events]) {fs.mkdirSync(dir,{mode:0o700});checkedDir(dir);}
    this.journal=new EvercraftOsLabLifecycleJournal(this.root);
    this.active=new Map();
    this.jobs=new Map();
  }
  #validatePermit(envelope,{scope,plan,subjectRef,jobId,instanceHash=null,now}) {
    if(!exactKeys(envelope,['schema','signature_algorithm','body','signature_base64'])||envelope.schema!==PERMIT_SCHEMA||envelope.signature_algorithm!=='ed25519'||!exactKeys(envelope.body,
      ['schema','permit_id','scope','plan_fingerprint','node_id','product_key','subject_ref','job_id','instance_hash','fixture_sha256','issued_at','expires_at']))throw Error('lab_permit_schema_invalid');
    const b=envelope.body;
    id(b.permit_id);id(b.job_id);
    if(b.schema!==BODY_SCHEMA||b.scope!==scope||b.plan_fingerprint!==plan.request_fingerprint||b.node_id!==plan.node_id||b.product_key!==plan.product_key||b.subject_ref!==subjectRef||b.job_id!==jobId||b.instance_hash!==instanceHash||b.fixture_sha256!==this.fixtureHash)throw Error('lab_permit_binding_invalid');
    const issued=stamp(b.issued_at),expires=stamp(b.expires_at),at=now.getTime();
    if(!Number.isFinite(at)||issued>at||expires<=at||expires<=issued||expires-issued>MAX_PERMIT_MS||issued<stamp(plan.prepared_at))throw Error('lab_permit_stale');
    if(typeof envelope.signature_base64!=='string'||!(/^[A-Za-z0-9+/]{86}==$/.test(envelope.signature_base64)))throw Error('lab_permit_signature_invalid');
    const signature=Buffer.from(envelope.signature_base64,'base64');
    if(signature.length!==64||!verify(null,Buffer.from(JSON.stringify(canon(b))),this.key,signature))throw Error('lab_permit_signature_invalid');
    return b;
  }
  #event(jobId,event) {this.journal.append({job_id:jobId,...event});}
  #checkJournal() {
    const state=this.journal.inspect();
    if(state.state==='held')throw Error('lab_journal_integrity_held:'+state.reason);
    if(fs.existsSync(this.journal.writer))throw Error('lab_journal_writer_ambiguous');
    if(this.witnessMode==='external_required'){
      const witness=this.witnessGate.inspect(state);
      if(witness.state!=='witnessed_exact_checkpoint')throw Error('lab_external_witness_held:'+witness.reason);
    }
    return state;
  }
  #releaseLock(lockFile,lockToken) {
    try {
      const meta=fs.lstatSync(lockFile);
      if(!meta.isFile()||meta.isSymbolicLink())return;
      const record=JSON.parse(fs.readFileSync(lockFile,'utf8'));
      if(record.lock_token!==lockToken)return;
      fs.unlinkSync(lockFile);fsyncDirectory(this.locks);
    }catch(error){/* Preserve ambiguity for manual recovery if unlink or readback fails. */}
  }
  #checkFixture() {if(checkedFile(this.fixture)!==this.fixture||hashFile(this.fixture)!==this.fixtureHash||checkedFile(this.binary)!==this.binary||hashFile(this.binary)!==this.binaryHash)throw Error('lab_fixture_or_binary_changed');}
  /** Real subprocess spawn, bounded to a pinned test fixture and lab-only permit. */
  async launch({plan,subjectRef,attestations,permit,jobId,timeoutMs=1500}={}) {
    let lockFile,job,lockToken,lockOwned=false,permitConsumedHere=false;
    try {
      const at=new Date(this.now());
      id(jobId);
      if(!Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>10000)throw Error('lab_timeout_invalid');
      const gate=this.gates.verify({plan,subjectRef,attestations,now:at});
      if(gate.state!=='independent_evidence_verified_for_passport_review')throw Error('lab_gate_held:'+gate.reason);
      const body=this.#validatePermit(permit,{scope:'lab.runtime.launch',plan,subjectRef,jobId,now:at});
      this.#checkFixture();
      this.#checkJournal(); // Read-only preflight, before lock and permit consumption.
      lockFile=path.join(this.locks,sha(plan.node_id+':'+plan.product_key).slice(7)+'.json');
      lockToken=randomUUID();
      // Atomic lock reservation precedes one-use permit consumption. No auto stale-lock breaking.
      saveExclusive(lockFile,{schema:'evercraft.os.lab-lock.v1',job_id:jobId,permit_id:body.permit_id,lock_token:lockToken,created_at:at.toISOString()});
      lockOwned=true;
      const permitFile=path.join(this.permits,sha(body.permit_id).slice(7)+'.json');
      // Durable single use: crashes after this point hold rather than re-spawn or reissue.
      saveExclusive(permitFile,{schema:'evercraft.os.lab-consumption.v1',scope:body.scope,job_id:jobId,permit_id:body.permit_id,plan_fingerprint:plan.request_fingerprint,consumed_at:at.toISOString()});
      permitConsumedHere=true;
      this.#event(jobId,{state:'intent_recorded',job_id:jobId,plan_fingerprint:plan.request_fingerprint,permit_id:body.permit_id,at:at.toISOString(),production_authority_granted:false});
      // A second check reduces, but does not eliminate, TOCTOU. No claim of production-grade atomic exec.
      this.#checkFixture();
      const challenge=randomUUID();
      const child=spawn(this.binary,[this.fixture],{shell:false,cwd:path.dirname(this.fixture),stdio:['ignore','ignore','ignore','ipc'],env:{...BASE_ENV,EVERCRAFT_LAB_CHALLENGE:challenge},windowsHide:true,detached:false});
      job={child,jobId,plan,lockFile,lockToken,challenge,started:false,ready:false,instance:null,stopped:false};
      this.jobs.set(jobId,job);
      // Wire exit/error and IPC before awaiting spawn, so even immediate exits are observed.
      child.on('message',message=>{if(message&&message.schema==='evercraft.os.lab-fixture-ipc.v1'&&message.kind==='ready'&&message.challenge===challenge)job.ready=true;});
      child.once('exit',(code,signal)=>{job.stopped=true;job.exit={code,signal};this.active.delete(jobId);try{this.#event(jobId,{state:'exit_observed',code,signal,at:new Date(this.now()).toISOString()});this.#releaseLock(lockFile,lockToken);}catch{ /* Missing audit evidence must leave lock held. */ }});
      this.active.set(jobId,job);
      await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});
      job.started=true;
      if(job.stopped)throw Error('lab_process_exited_before_instance_capture');
      job.instance=captureCurrentProcessInstance({pid:child.pid});
      this.#event(jobId,{state:'spawn_observed',pid:child.pid,instance:job.instance,at:new Date(this.now()).toISOString()});
      // Time-limited fixture readiness report; never claim application health from it.
      const deadline=Date.now()+timeoutMs;
      while(!job.ready&&!job.stopped&&Date.now()<deadline)await new Promise(r=>setTimeout(r,10));
      if(!job.ready) {await this.#terminate(job,150);return fail('lab_fixture_did_not_report_ready');}
      return {schema:RESULT_SCHEMA,state:'lab_fixture_started',job_id:jobId,process_instance:job.instance,
        fixture_ipc_readiness_reported:true,local_process_identity_verified:sameProcess(job.instance),
        production_authority_granted:false,runtime_health_verified:false,permit_consumed_in_lab:true,process_started:true};
    } catch(error) {
      if(job?.started&&!job.stopped)await this.#terminate(job,150);
      else if(lockOwned&&!permitConsumedHere) {
        // Never delete an existing lock belonging to another process or replay.
        this.#releaseLock(lockFile,lockToken);
      }
      return fail(String(error?.message||error));
    }
  }
  inspect({jobId}={}) {
    const job=this.jobs.get(jobId);
    if(!job)return fail('lab_job_unknown_or_not_owned');
    const observed=job.instance?observeProcessInstance(job.instance):null;
    const journal=this.journal.inspect();
    if(journal.state==='held')return {...fail('lab_journal_integrity_held:'+journal.reason),job_id:jobId,process_observation:observed};
    return {schema:RESULT_SCHEMA,state:job.stopped?'lab_fixture_exited':observed?.state==='same_process_alive'?'lab_fixture_alive':'held',
      job_id:jobId,process_observation:observed,fixture_ipc_readiness_reported:job.ready,
      runtime_health_verified:false,production_authority_granted:false,exit:job.exit||null};
  }
  /** Read-only operator evidence for a restarted supervisor; never clears locks or signals PIDs. */
  inspectRecovery() {
    const journal=this.journal.inspect();
    if(journal.state==='held')return {state:'held',reason:'lab_journal_integrity_held:'+journal.reason,mutation_performed:false};
    if(fs.existsSync(this.journal.writer))return {state:'held',reason:'lab_journal_writer_ambiguous',mutation_performed:false};
    if(this.witnessMode==='external_required'){
      const witness=this.witnessGate.inspect(journal);
      if(witness.state!=='witnessed_exact_checkpoint')return {state:'held',reason:'lab_external_witness_held:'+witness.reason,mutation_performed:false};
    }
    const records=[];
    try {
      for(const entry of fs.readdirSync(this.locks).sort()) {
        if(!/^[a-f0-9]{64}\.json$/.test(entry))throw Error('lab_lock_filename_invalid');
        const file=path.join(this.locks,entry),stat=fs.lstatSync(file);
        if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1)throw Error('lab_lock_nonregular');
        const lock=JSON.parse(fs.readFileSync(file,'utf8'));
        if(lock.schema!=='evercraft.os.lab-lock.v1'||typeof lock.job_id!=='string'||typeof lock.permit_id!=='string'||typeof lock.lock_token!=='string')throw Error('lab_lock_schema_ambiguous');
        const related=journal.events.filter(ev=>ev.job_id===lock.job_id);
        const spawned=related.filter(ev=>ev.state==='spawn_observed').at(-1);
        const observation=spawned?.instance?observeProcessInstance(spawned.instance):null;
        // Even an absent process does not authorize deleting an old lock.
        records.push({job_id:lock.job_id,permit_id:lock.permit_id,
          observation:observation?.state||'not_observed',state:'held_manual_recovery_required'});
      }
      return {state:records.length?'held_ambiguous_locks':'no_locks_observed',records,events_verified:journal.count,
        mutation_performed:false,production_recovery_authorized:false};
    }catch(e){return {state:'held',reason:String(e.message||e),mutation_performed:false};}
  }
  async #terminate(job,timeoutMs) {
    if(job.stopped)return;
    if(!job.instance||!sameProcess(job.instance))return; // Never signal an unknown/reused PID.
    job.child.kill('SIGTERM');
    let until=Date.now()+timeoutMs;
    while(!job.stopped&&Date.now()<until)await new Promise(r=>setTimeout(r,10));
    if(!job.stopped&&sameProcess(job.instance))job.child.kill('SIGKILL');
    until=Date.now()+1000;
    while(!job.stopped&&Date.now()<until)await new Promise(r=>setTimeout(r,10));
  }
  /** Stop is separately authorized; no implicit kill, signal, or privileged escalation. */
  async stop({jobId,subjectRef,plan,attestations,permit}={}) {
    try {
      const job=this.active.get(jobId);
      if(!job)throw Error('lab_stop_job_not_active');
      if(plan?.request_fingerprint!==job.plan.request_fingerprint)throw Error('lab_stop_plan_mismatch');
      const at=new Date(this.now());
      const gate=this.gates.verify({plan,subjectRef,attestations,now:at});
      if(gate.state!=='independent_evidence_verified_for_passport_review')throw Error('lab_stop_gate_held:'+gate.reason);
      const instanceHash=sha(JSON.stringify(canon(job.instance)));
      const body=this.#validatePermit(permit,{scope:'lab.runtime.stop',plan,subjectRef,jobId,instanceHash,now:at});
      if(!sameProcess(job.instance))throw Error('lab_stop_process_instance_not_current');
      this.#checkJournal();
      saveExclusive(path.join(this.permits,sha(body.permit_id).slice(7)+'.json'),{schema:'evercraft.os.lab-consumption.v1',scope:body.scope,job_id:jobId,consumed_at:at.toISOString()});
      this.#event(jobId,{state:'authorized_stop_intent',permit_id:body.permit_id,at:at.toISOString()});
      await this.#terminate(job,400);
      if(!job.stopped)throw Error('lab_stop_completion_unverified');
      return {schema:RESULT_SCHEMA,state:'lab_fixture_stopped',job_id:jobId,production_authority_granted:false,runtime_health_verified:false,stop_permit_consumed_in_lab:true};
    }catch(error){return fail(String(error?.message||error));}
  }
}

export const LAB_RUNTIME_PERMIT_SCHEMA=PERMIT_SCHEMA;
export const LAB_RUNTIME_PERMIT_BODY_SCHEMA=BODY_SCHEMA;
