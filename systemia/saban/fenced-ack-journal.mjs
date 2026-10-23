/**
 * Saban's non-executing, crash-evident acknowledgment journal.
 *
 * Local proof / candidate API only. No worker dispatch, Passport authority,
 * checkout, remote capacity lease, or provider receipt validation occurs here.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash, createHmac, randomBytes } from 'node:crypto';

const SCHEMA = 'evercraft.saban.fenced-ack-event.v1';
const KEY = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,190}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const sleep = new Int32Array(new SharedArrayBuffer(4));
const stamp = ms => new Date(ms).toISOString();
const hex = input => createHash('sha256').update(input).digest('hex');

function assertKey(value, field) {
  if (typeof value !== 'string' || !KEY.test(value)) throw new Error(field + '_invalid');
  return value;
}
function assertHash(value, field) {
  if (typeof value !== 'string' || !DIGEST.test(value)) throw new Error(field + '_invalid');
  return value;
}
function nowMs(value) {
  const ms = value instanceof Date ? value.getTime() : Number(value ?? Date.now());
  if (!Number.isSafeInteger(ms) || ms < 0) throw new Error('journal_clock_invalid');
  return ms;
}
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  }
  return JSON.stringify(value);
}
function sanitized(state, now) {
  if (!state) return null;
  const out = structuredClone(state);
  // Only the cryptographic digest of the lease capability is persisted.
  // The capability itself is returned solely by acquire() to that caller.
  if (out.lease) {
    delete out.lease.token_hash;
    if (out.state === 'leased' && now > out.lease.expires_ms) {
      out.state = 'ambiguous_expired';
      out.reason = 'worker_may_have_performed_effect_before_ack';
    }
  }
  return {
    schema: 'evercraft.saban.fenced-ack-status.v1',
    ...out,
    external_effect_verified: false,
    systemia_execution_authorized: false,
    physical_worker_dispatched: false,
    automatic_replay_allowed: false
  };
}

export class SabanFencedAckJournal {
  constructor({stateDir, integritySecret = '', maxAttempts = 3} = {}) {
    if (!stateDir) throw new Error('journal_state_dir_required');
    this.root = path.resolve(stateDir);
    this.secret = String(integritySecret);
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 16) {
      throw new Error('saban_ack_max_attempts_invalid');
    }
    this.maxAttempts = maxAttempts;
    fs.mkdirSync(this.root, {recursive:true,mode:0o700});
  }
  filename(jobKey) {
    assertKey(jobKey, 'job_key');
    return path.join(this.root, 'job-' + hex(jobKey) + '.ndjson');
  }
  hash(event) {
    const bytes = canonical(event);
    return (this.secret
      ? createHmac('sha256', this.secret)
      : createHash('sha256')).update(bytes).digest('hex');
  }
  withLock(jobKey, fn) {
    const lock = this.filename(jobKey) + '.lock';
    const until = Date.now() + 3000;
    while (true) {
      try { fs.mkdirSync(lock,{mode:0o700});break; }
      catch (e) {
        if (e?.code !== 'EEXIST') throw e;
        if (Date.now() >= until) throw new Error('saban_ack_journal_lock_held');
        Atomics.wait(sleep,0,0,10);
      }
    }
    try { return fn(); }
    finally { fs.rmdirSync(lock); }
  }
  replay(jobKey) {
    const file = this.filename(jobKey);
    if (!fs.existsSync(file)) return {state:null,count:0,last_hash:null};
    let raw;
    try {raw = fs.readFileSync(file,'utf8');}
    catch {throw new Error('saban_ack_journal_integrity_hold');}
    if (!raw || !raw.endsWith('\n')) throw new Error('saban_ack_journal_integrity_hold');
    let state = null, prior = null, seq = 0;
    try {
      for (const line of raw.split('\n').slice(0,-1)) {
        const item = JSON.parse(line);
        if (!item || item.schema !== SCHEMA || item.job_key !== jobKey ||
            item.seq !== seq + 1 || item.prev_hash !== prior ||
            !DIGEST.test('sha256:' + String(item.receipt_hash ?? ''))) {
          throw new Error('invalid_event');
        }
        const {receipt_hash, ...body} = item;
        if (this.hash(body) !== receipt_hash) throw new Error('digest_mismatch');
        state = apply(state, body);
        seq = item.seq; prior = receipt_hash;
      }
    } catch {
      throw new Error('saban_ack_journal_integrity_hold');
    }
    return {state,count:seq,last_hash:prior};
  }
  append(jobKey, type, details, atMs) {
    const {state,count,last_hash} = this.replay(jobKey);
    const body = {schema:SCHEMA,seq:count+1,job_key:jobKey,
      prev_hash:last_hash,at_ms:atMs,type,...details};
    const next = apply(state,body);
    const event = {...body,receipt_hash:this.hash(body)};
    const fd = fs.openSync(this.filename(jobKey),'a',0o600);
    try {
      fs.writeSync(fd,JSON.stringify(event)+'\n');
      fs.fsyncSync(fd);
    } finally {fs.closeSync(fd);}
    return {state:next,event};
  }
  submit({jobKey,workloadClass,workDigest,now}={}) {
    const key=assertKey(jobKey,'job_key');
    const cls=assertKey(workloadClass,'workload_class');
    const digest=assertHash(workDigest,'work_digest');
    const at=nowMs(now);
    return this.withLock(key,()=>{
      const prior=this.replay(key).state;
      if (prior) {
        if (prior.workload_class!==cls || prior.work_digest!==digest) {
          throw new Error('saban_ack_journal_idempotency_conflict');
        }
        return {...sanitized(prior,at),deduplicated:true};
      }
      const next=this.append(key,'submitted',{workload_class:cls,work_digest:digest,max_attempts:this.maxAttempts},at);
      return {...sanitized(next.state,at),deduplicated:false};
    });
  }
  acquire({jobKey,workerId,leaseMs=30000,now}={}) {
    const key=assertKey(jobKey,'job_key');
    const worker=assertKey(workerId,'worker_id');
    const ms=Number(leaseMs);
    if(!Number.isSafeInteger(ms)||ms<1000||ms>600000)throw new Error('lease_duration_invalid');
    const at=nowMs(now);
    return this.withLock(key,()=>{
      const current=this.replay(key).state;
      if(!current) throw new Error('saban_ack_job_not_found');
      if(current.state==='leased' && at>current.lease.expires_ms) {
        throw new Error('saban_ack_ambiguous_completion_requires_review');
      }
      if(current.state!=='queued')throw new Error('saban_ack_job_not_queued');
      if(current.attempts >= current.max_attempts)throw new Error('saban_ack_retry_budget_exhausted');
      const token=randomBytes(32).toString('hex');
      const next=this.append(key,'leased',{
        worker_id:worker,token_hash:hex(token),expires_ms:at+ms
      },at);
      return {...sanitized(next.state,at),lease_token:token};
    });
  }
  acknowledge({jobKey,workerId,leaseToken,resultDigest,receiptRef,now}={}) {
    const key=assertKey(jobKey,'job_key');
    const worker=assertKey(workerId,'worker_id');
    const result=assertHash(resultDigest,'result_digest');
    const receipt=assertKey(receiptRef,'receipt_ref');
    const tokenHash=hex(assertKey(leaseToken,'lease_token'));
    const at=nowMs(now);
    return this.withLock(key,()=>{
      const current=this.replay(key).state;
      if(!current)throw new Error('saban_ack_job_not_found');
      if(current.state==='ack_recorded' &&
          current.last_worker_id===worker &&
          current.last_token_hash===tokenHash &&
          current.result_digest===result &&
          current.receipt_ref===receipt) {
        return {...sanitized(current,at),deduplicated:true};
      }
      if(current.state!=='leased' || current.lease.worker_id!==worker ||
          current.lease.token_hash!==tokenHash) {
        throw new Error('saban_ack_stale_or_unowned_lease');
      }
      if(at>current.lease.expires_ms)throw new Error('saban_ack_lease_expired_hold');
      const next=this.append(key,'ack_recorded',{
        worker_id:worker,token_hash:tokenHash,
        result_digest:result,receipt_ref:receipt
      },at);
      return {...sanitized(next.state,at),deduplicated:false};
    });
  }
  hold({jobKey,workerId,leaseToken,reason,now}={}) {
    const key=assertKey(jobKey,'job_key');
    const worker=assertKey(workerId,'worker_id');
    const token=hex(assertKey(leaseToken,'lease_token'));
    const why=assertKey(reason,'hold_reason');
    const at=nowMs(now);
    return this.withLock(key,()=>{
      const current=this.replay(key).state;
      if(current?.state!=='leased'||current.lease.worker_id!==worker||
          current.lease.token_hash!==token)throw new Error('saban_ack_stale_or_unowned_lease');
      if (at>current.lease.expires_ms) throw new Error('saban_ack_lease_expired_hold');
      const next=this.append(key,'held',{reason:why,token_hash:token},at);
      return sanitized(next.state,at);
    });
  }
  reviewRetry({jobKey,approvalRef,evidenceRef,now}={}) {
    const key=assertKey(jobKey,'job_key');
    const approval=assertKey(approvalRef,'approval_ref');
    const evidence=assertKey(evidenceRef,'evidence_ref');
    const at=nowMs(now);
    return this.withLock(key,()=>{
      const current=this.replay(key).state;
      if(!current) throw new Error('saban_ack_job_not_found');
      if(current.state!=='held' &&
          !(current.state==='leased'&&at>current.lease.expires_ms)) {
        throw new Error('saban_ack_review_requires_held_or_expired_work');
      }
      if(current.attempts >= current.max_attempts) {
        throw new Error('saban_ack_retry_budget_exhausted');
      }
      const next=this.append(key,'retry_reviewed',{
        approval_ref:approval,evidence_ref:evidence
      },at);
      return sanitized(next.state,at);
    });
  }
  inspect({jobKey,now}={}) {
    const key=assertKey(jobKey,'job_key');
    const at=nowMs(now);
    const r=this.replay(key);
    return {...sanitized(r.state,at),journal_events:r.count,
      last_receipt_hash:r.last_hash};
  }
}

function apply(previous,e) {
  switch(e.type) {
    case 'submitted':
      if(previous)throw new Error('duplicate_submit_event');
      assertKey(e.workload_class,'workload_class');
      assertHash(e.work_digest,'work_digest');
      if(!Number.isInteger(e.max_attempts)||e.max_attempts<1||e.max_attempts>16)
        throw new Error('invalid_retry_budget');
      return {job_key:e.job_key,workload_class:e.workload_class,
        work_digest:e.work_digest,state:'queued',attempts:0,max_attempts:e.max_attempts,lease:null};
    case 'leased':
      if(previous?.state!=='queued'||previous.attempts>=previous.max_attempts||
          !Number.isSafeInteger(e.expires_ms) ||
          e.expires_ms<=e.at_ms || !/^[0-9a-f]{64}$/.test(e.token_hash) ||
          !KEY.test(e.worker_id))throw new Error('invalid_lease_event');
      return {...previous,state:'leased',attempts:previous.attempts+1,
        lease:{worker_id:e.worker_id,token_hash:e.token_hash,
          expires_ms:e.expires_ms}};
    case 'ack_recorded':
      if(previous?.state!=='leased'||previous.lease.worker_id!==e.worker_id||
          previous.lease.token_hash!==e.token_hash ||
          e.at_ms>previous.lease.expires_ms)throw new Error('invalid_ack_event');
      assertHash(e.result_digest,'result_digest');
      assertKey(e.receipt_ref,'receipt_ref');
      return {...previous,state:'ack_recorded',lease:null,
        last_worker_id:e.worker_id,last_token_hash:e.token_hash,result_digest:e.result_digest,
        receipt_ref:e.receipt_ref};
    case 'held':
      if(previous?.state!=='leased'||previous.lease.token_hash!==e.token_hash)
        throw new Error('invalid_hold_event');
      assertKey(e.reason,'hold_reason');
      return {...previous,state:'held',lease:null,reason:e.reason};
    case 'retry_reviewed':
      if(previous?.state!=='held'&&
          !(previous?.state==='leased'&&e.at_ms>previous.lease.expires_ms))
        throw new Error('invalid_retry_event');
      if(previous.attempts>=previous.max_attempts)throw new Error('retry_budget_exhausted');
      assertKey(e.approval_ref,'approval_ref');
      assertKey(e.evidence_ref,'evidence_ref');
      return {...previous,state:'queued',lease:null,reason:'retry_review_recorded',
        retry_approval_ref:e.approval_ref,retry_evidence_ref:e.evidence_ref};
    default: throw new Error('unsupported_journal_event');
  }
}
