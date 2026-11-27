#!/usr/bin/env node
// Read-only local witness for the EXISTING short-lived dispatcher. Not an
// attestation of loaded JS, imports, process memory, hardware, or job outcomes.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

export const ENTRY = 'systemia/saban/ambient-job-dispatcher.mjs';
export const UNIT = 'evercraft-saban-dispatch.service';
const MAX = 1024 * 1024;
const HASH = /^sha256:[a-f0-9]{64}$/;
const sha = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const hold = (receipt, reason) => ({...receipt, status:'hold', reason});

function boundedRead(file, limit) {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const data = Buffer.alloc(limit + 1);
    let used = 0;
    while (used < data.length) {
      const n = fs.readSync(fd, data, used, data.length - used, null);
      if (!n) break;
      used += n;
    }
    if (used > limit) throw Error('read_limit');
    return data.subarray(0, used);
  } finally { fs.closeSync(fd); }
}
function processIdentity(pid) {
  const raw = boundedRead('/proc/'+pid+'/stat', 8192).toString('utf8');
  const end = raw.lastIndexOf(')');
  const fields = raw.slice(end+2).trim().split(/\s+/);
  if (end < 0 || !raw.startsWith(pid+' (') || !/^\d+$/.test(fields[19]||'') ||
      ['Z','X','x'].includes(fields[0])) throw Error('process_unavailable');
  return fields[19]; // Linux proc stat field 22, process start ticks.
}
const sameFile = (a,b) => a.dev===b.dev && a.ino===b.ino &&
  a.size===b.size && a.mtimeNs===b.mtimeNs && a.ctimeNs===b.ctimeNs;
const fingerprint = file => fs.statSync(file,{bigint:true});
function absoluteEntrypoint(repo) {
  if (typeof repo!=='string' || !path.isAbsolute(repo) ||
      fs.realpathSync(repo)!==repo) throw Error('canonical_repo_required');
  const entry = path.join(repo,ENTRY);
  if (fs.realpathSync(entry)!==entry) throw Error('canonical_entrypoint_required');
  return entry;
}
export function pinnedDispatcherExpectation(repo, commit) {
  if (!/^[a-f0-9]{40}$/.test(commit||'')) throw Error('exact_commit_required');
  absoluteEntrypoint(repo);
  const options = {timeout:5000,maxBuffer:MAX+4096,stdio:['ignore','pipe','ignore']};
  const type = execFileSync('git',['-C',repo,'cat-file','-t',commit],options).toString().trim();
  if (type!=='commit') throw Error('not_commit');
  const tree = execFileSync('git',['-C',repo,'ls-tree','-z',commit,'--',ENTRY],options).toString();
  if (!/^(100644|100755) blob [a-f0-9]{40}\t/.test(tree) ||
      !tree.endsWith('\t'+ENTRY+'\0')) throw Error('regular_blob_required');
  const bytes = execFileSync('git',['-C',repo,'show',commit+':'+ENTRY],options);
  if (bytes.length>MAX) throw Error('blob_too_large');
  return sha(bytes);
}
export function observeDispatcherProcess({pid,repo,expectedSha256}={}) {
  const receipt = {
    schema:'evercraft.saban.dispatch-entrypoint-witness.v1',
    status:'hold',reason:null,pid:null,process_identity_stable:false,
    entrypoint_path_matched:false,process_view_file_matched:false,
    current_entrypoint_bytes_matched:false,loaded_code_verified:false,
    complete_release_verified:false,physical_hardware_verified:false,
    work_completed_verified:false,service_changes:false,
    scheduler_created:false,private_arguments_returned:false,
  };
  if (!Number.isSafeInteger(pid)||pid<1||!HASH.test(expectedSha256||''))
    return hold(receipt,'invalid_expectation_or_pid');
  receipt.pid=pid;
  try {
    const entry=absoluteEntrypoint(repo);
    const start=processIdentity(pid);
    const proc='/proc/'+pid;
    const executable=fs.readlinkSync(proc+'/exe');
    if (!['node','nodejs'].includes(path.basename(executable)))
      return hold(receipt,'unexpected_process_executable');
    const args=boundedRead(proc+'/cmdline',65536).toString('utf8').split('\0');
    if (args[1]!==entry) return hold(receipt,'entrypoint_argument_mismatch');
    receipt.entrypoint_path_matched=true;
    const visible=proc+'/root'+entry;
    const before=fingerprint(entry);
    if (!before.isFile()||before.size>BigInt(MAX)||!sameFile(before,fingerprint(visible)))
      return hold(receipt,'process_view_file_mismatch');
    receipt.process_view_file_matched=true;
    const bytes=boundedRead(entry,MAX);
    const after=fingerprint(entry);
    if (!sameFile(before,after)||!sameFile(after,fingerprint(visible))||
        bytes.length!==Number(after.size))
      return hold(receipt,'entrypoint_changed_during_observation');
    const end=processIdentity(pid);
    const argsAfter=boundedRead(proc+'/cmdline',65536).toString('utf8').split('\0');
    if (start!==end||argsAfter[1]!==entry||fs.readlinkSync(proc+'/exe')!==executable)
      return hold(receipt,'process_identity_changed');
    receipt.process_identity_stable=true;
    if (sha(bytes)!==expectedSha256)
      return hold(receipt,'entrypoint_digest_mismatch');
    receipt.current_entrypoint_bytes_matched=true;
    return {...receipt,status:'observed_entrypoint_matched'};
  } catch { return hold(receipt,'process_or_source_unavailable'); }
}
function currentUnit() {
  const raw=execFileSync('systemctl',['show',UNIT,'--no-pager',
    '-p','LoadState','-p','ActiveState','-p','MainPID'],
    {encoding:'utf8',timeout:5000,maxBuffer:8192,stdio:['ignore','pipe','ignore']});
  const fields=Object.fromEntries(raw.trim().split('\n').map(x=>x.split('=')));
  const pid=Number(fields.MainPID);
  if (fields.LoadState!=='loaded'||!['active','activating'].includes(fields.ActiveState)||
      !Number.isSafeInteger(pid)||pid<1) throw Error('dispatcher_not_running');
  return pid;
}
if (process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  let receipt;
  try {
    const [repo,commit]=process.argv.slice(2);
    if (process.argv.length!==4) throw Error('invalid_args');
    const expectedSha256=pinnedDispatcherExpectation(repo,commit);
    const pid=currentUnit();
    receipt=observeDispatcherProcess({pid,repo,expectedSha256});
    if(currentUnit()!==pid) throw Error('unit_pid_changed');
    receipt={...receipt,unit:UNIT,pinned_git_commit:commit,
      unit_pid_stable:true,expected_sha256:expectedSha256};
  } catch {
    receipt={schema:'evercraft.saban.dispatch-entrypoint-witness.v1',
      status:'hold',reason:'unit_or_pin_unavailable',loaded_code_verified:false,
      work_completed_verified:false,service_changes:false,scheduler_created:false,
      private_arguments_returned:false};
  }
  process.stdout.write(JSON.stringify(receipt,null,2)+'\n');
  if(receipt.status!=='observed_entrypoint_matched') process.exitCode=3;
}
