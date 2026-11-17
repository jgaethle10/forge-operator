#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { leaseNext, complete, fail, expireLeases, summarizeWorkState } from '../saban/work-state.mjs';
import { runPrivateSourceAudit } from './private-source-worker.mjs';

const WORK_STATE = 'evercraft.saban.work-state.v1';
const SLATE = 'evercraft.production.parallel-slate.v1';

function privateRoot(dir) {
  if (typeof dir !== 'string' || !path.isAbsolute(dir)) throw Error('Absolute private directory required');
  let p = path.resolve(dir);
  while (p !== path.dirname(p)) {
    if (fs.existsSync(path.join(p, '.git'))) throw Error('Refusing to run on private data in source checkout');
    p = path.dirname(p);
  }
  const st = fs.lstatSync(dir);
  if (!st.isDirectory() || st.isSymbolicLink() || (st.mode & 0o077) !== 0) {
    throw Error('Private directory must be 0700 and must not be symlinked');
  }
  return fs.realpathSync(dir);
}
function readPrivate(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) {
    throw Error('Expected an owner-only private JSON file');
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function persist(file, data) {
  const temp = file + '.pending-' + crypto.randomBytes(6).toString('hex');
  let fd;
  try {
    fd = fs.openSync(temp, 'wx', 0o600);
    fs.writeFileSync(fd, JSON.stringify(data, null, 2) + '\n');
    fs.fsyncSync(fd);
    fs.closeSync(fd); fd = null;
    fs.renameSync(temp, file);
    const dfd = fs.openSync(path.dirname(file), 'r');
    try { fs.fsyncSync(dfd); } finally { fs.closeSync(dfd); }
  } finally {
    if (fd !== undefined && fd !== null) fs.closeSync(fd);
    if (fs.existsSync(temp)) fs.rmSync(temp);
  }
}

/**
 * Executes real private read-only source-audit work across a bounded worker pool.
 * Each lease and terminal result is synchronously persisted BEFORE the next
 * asynchronous worker step. After interruption a later run may recover expired
 * leases, but an active lease is never silently stolen or reset.
 */
export async function runOwnedParallelSourceWave({
  privateDir, maxInFlight = null, now = () => Date.now(), worker = runPrivateSourceAudit
} = {}) {
  const root = privateRoot(privateDir);
  const lock = path.join(root, '.parallel-worker.lock');
  let lockFd;
  try { lockFd = fs.openSync(lock, 'wx', 0o600); }
  catch (e) {
    if (e?.code === 'EEXIST') throw Error('Parallel worker lock exists; inspect owner before recovery');
    throw e;
  }
  try {
    const plan = readPrivate(path.join(root, 'parallel-slate.json'));
    if (plan.schema !== SLATE || plan.dispatched !== false || !plan.queue?.jobs
      || plan.queue.schema !== WORK_STATE) throw Error('Untrusted private parallel slate');
    const limit = maxInFlight ?? plan.max_in_flight;
    if (!Number.isInteger(limit) || limit < 2 || limit > 12) throw Error('Parallelism must be 2..12');

    const stateFile = path.join(root, 'saban-work-state.json');
    const state = fs.existsSync(stateFile)
      ? readPrivate(stateFile)
      : structuredClone(plan.queue);
    if (state.schema !== WORK_STATE ||
        state.software_id !== plan.queue.software_id ||
        Object.keys(state.jobs).length !== Object.keys(plan.queue.jobs).length ||
        Object.keys(state.jobs).some(k => !plan.queue.jobs[k])) {
      throw Error('Persisted Saban state does not match admitted private slate');
    }
    // The source data and job work contracts are immutable once admitted.
    for (const [id, original] of Object.entries(plan.queue.jobs)) {
      const job = state.jobs[id];
      if (!job || job.job_id !== id ||
        job.work?.key !== original.work?.key ||
        job.work?.kind !== original.work?.kind ||
        job.agent_id !== original.agent_id ||
        job.item?.release_authorized !== false) throw Error('Saban job mutation refused');
    }
    expireLeases(state, now());
    persist(stateFile, state);
    const failures = [];
    let active = 0, peak = 0;
    const runners = Array.from({length:Math.min(limit,Object.keys(state.jobs).length)},(_,i)=>(async()=>{
      const workerId = 'owned-private-source-worker-' + (i+1);
      for (;;) {
        const job = leaseNext(state, {workerId, now:now()});
        if (!job) break;
        persist(stateFile, state); // durable lease BEFORE file work begins
        active++; peak = Math.max(active, peak);
        try {
          const result = await worker(job, {privateDir:root});
          if (result?.schema !== 'evercraft.production.artifact-result.v1'
            || result?.project_id !== job.work?.key || result?.action_kind !== job.work?.kind
            || !/^[a-f0-9]{64}$/.test(result?.artifact_sha256 || '')
            || result?.publication_performed !== false || result?.canon_modified !== false
            || result?.release_claimed !== false) throw Error('Missing or unsafe artifact result');
          complete(state,{jobId:job.job_id,workerId,result,now:now()});
          persist(stateFile,state); // durable completion BEFORE next job
        } catch (_error) {
          // Existing retry ceiling applies; individual failures cannot cancel
          // other lanes. Do not publish private error strings to the console.
          fail(state,{jobId:job.job_id,workerId,retry:false,
            error:{code:'private_source_audit_failed',message:'Private audit failed or lacked required inputs'},
            now:now()});
          persist(stateFile,state);
          failures.push({project_id:job.work.key,reason:'private_audit_failed'});
        } finally {active--;}
      }
    })());
    await Promise.all(runners);
    const summary = summarizeWorkState(state,now());
    persist(stateFile,state);
    return {
      schema:'evercraft.production.parallel-source-wave-receipt.v1',
      job_total:summary.total,completed_audits:summary.counts.completed||0,
      failed_audits:summary.counts.dead_letter||0,
      queued_or_leased:(summary.counts.queued||0)+(summary.counts.leased||0),
      peak_in_flight:peak, failures, post_wave_reconciliation_required:true,
      source_audit_execution_verified:peak>0,
      publication_performed:false,canon_modified:false,
      writer_or_media_generation_performed:false,
    };
  } finally {
    fs.closeSync(lockFd);
    fs.unlinkSync(lock);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const i=process.argv.indexOf('--private-dir');
  const directory=i<0?path.join(os.homedir(),'.local/share/evercraft/production-continuity'):process.argv[i+1];
  runOwnedParallelSourceWave({privateDir:directory})
    .then(receipt=>console.log(JSON.stringify(receipt,null,2)))
    .catch(err=>{console.error('Private parallel wave refused:',err?.message||'unknown error');process.exitCode=1;});
}
