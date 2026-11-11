/**
 * EO-001 offline-only hard-stop supervisor proof.
 *
 * Runs ONLY the fixed synthetic child fixture included next to this module.
 * A real four-case Qwen experiment cannot be launched from this code. It
 * tests bounded subprocess lifetime, process-group cleanup, private failure
 * receipts, refusal to promote late output and refusal of pass-only reruns.
 *
 * Requires Linux (including NextGen WSL2), never alters Systemia/Node002
 * resident services, production permissions or external messaging.
 */
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {performance} from 'node:perf_hooks';
import {fileURLToPath,pathToFileURL} from 'node:url';

const folder=path.dirname(fileURLToPath(import.meta.url));
const childFile=path.join(folder,'eo001-hardstop-synthetic-child.mjs');
const allowed=new Set(['success','crash','stall','ignore-term',
  'late-result','oversize','partial','descendant-stall']);
const MAX_STREAM_BYTES=16384;
const hash=value=>createHash('sha256').update(value).digest('hex');

function privateDirectory(dir){
  if(typeof dir!=='string'||!path.isAbsolute(dir))throw Error('PRIVATE_ABSOLUTE_DIRECTORY_REQUIRED');
  const stat=fs.lstatSync(dir);
  if(!stat.isDirectory()||stat.isSymbolicLink()||
    (typeof process.getuid==='function'&&stat.uid!==process.getuid())||
    (stat.mode&0o077)!==0)throw Error('PRIVATE_0700_DIRECTORY_REQUIRED');
}

/**
 * An evidence writer is deliberately restricted to a fixed filename for
 * each synthetic test case: do not silently retry an unsuccessful decision
 * under the same identity until it passes.
 */
function privateWrite(dir,mode,receipt){
  const filename=path.join(dir,'eo001-hardstop-fixture-'+mode+'.json');
  fs.writeFileSync(filename,JSON.stringify(receipt,null,2)+'\n',
    {flag:'wx',mode:0o600});
  const verify=fs.statSync(filename);
  if((verify.mode&0o777)!==0o600)throw Error('PRIVATE_RECEIPT_PERMISSIONS');
  return filename;
}

function safeFixtureResult(bytes,mode){
  try{
    const value=JSON.parse(bytes.toString('utf8').trim());
    return value&&typeof value==='object'&&!Array.isArray(value)&&
      Object.keys(value).sort().join('|')===
      ['schema','mode','result','model_inference_executed'].sort().join('|')&&
      value.schema==='evercraft.eo001.synthetic-child.v1'&&
      value.mode===mode&&value.result==='FIXTURE_ONLY'&&
      value.model_inference_executed===false;
  }catch{return false;}
}

function signalGroup(child,signal){
  if(!Number.isSafeInteger(child.pid)||child.pid<=0)return false;
  try{
    // The child was spawned detached: true on Linux, giving it a private PGID.
    // Signal the process group, including descendants, not our own process.
    process.kill(-child.pid,signal);
    return true;
  }catch{
    try{return child.kill(signal);}catch{return false;}
  }
}

/**
 * Timing is measured around the *whole child worker*, including startup.
 * An eventual synthetic child result after the deadline is NEVER accepted.
 * No user-supplied command, child script or model prompt can be passed.
 */
export async function runSyntheticHardstop({
  mode,receiptDir,deadlineMs=15000,graceMs=100,clock=()=>performance.now()
}={}){
  if(process.platform!=='linux')throw Error('LINUX_PROCESS_GROUPS_REQUIRED');
  if(!allowed.has(mode))throw Error('UNAPPROVED_SYNTHETIC_MODE');
  if(!Number.isSafeInteger(deadlineMs)||deadlineMs<80||deadlineMs>15000)
    throw Error('DEADLINE_OUT_OF_BOUNDS');
  if(!Number.isSafeInteger(graceMs)||graceMs<20||graceMs>500)
    throw Error('KILL_GRACE_OUT_OF_BOUNDS');
  privateDirectory(receiptDir);
  const out=path.join(receiptDir,'eo001-hardstop-fixture-'+mode+'.json');
  // Never run a child if a receipt already exists. No retries to replace a
  // failure or cherry-pick a successful model output.
  if(fs.existsSync(out))throw Error('IMMUTABLE_RECEIPT_ALREADY_EXISTS');
  const workerSource=fs.readFileSync(childFile);
  const started=clock();
  const result=await new Promise(resolve=>{
    let child;
    let done=false,timedOut=false,outputLimit=false,forcedKill=false;
    let stdout=Buffer.alloc(0),stderr=Buffer.alloc(0);
    let hardTimer=null,killTimer=null,exitCode=null,exitSignal=null;
    let spawnFailed=false;
    function requestStop(){
      if(done)return;
      signalGroup(child,'SIGTERM');
      if(killTimer===null)killTimer=setTimeout(()=>{
        if(done)return;
        forcedKill=true;
        signalGroup(child,'SIGKILL');
      },graceMs);
    }
    function recordChunk(which,chunk){
      if(done)return;
      const previous=which==='stdout'?stdout:stderr;
      const truncated=Buffer.concat([previous,chunk]).subarray(0,MAX_STREAM_BYTES+1);
      if(which==='stdout')stdout=truncated;else stderr=truncated;
      if(truncated.length>MAX_STREAM_BYTES){
        outputLimit=true;
        requestStop();
      }
    }
    function settle(){
      if(done)return;
      done=true;
      clearTimeout(hardTimer);
      clearTimeout(killTimer);
      const elapsed=Math.max(0,clock()-started);
      const overrun=timedOut||elapsed>=deadlineMs;
      const good=exitCode===0&&!overrun&&!outputLimit&&!spawnFailed&&
        safeFixtureResult(stdout,mode);
      const state=overrun?'DEADLINE_EXCEEDED_RETAINED':
        outputLimit?'OUTPUT_LIMIT_RETAINED':
        spawnFailed?'CHILD_START_FAILURE_RETAINED':
        exitCode!==0?'CHILD_EXIT_FAILURE_RETAINED':
        good?'SYNTHETIC_CHILD_COMPLETED':'INVALID_CHILD_RESULT_RETAINED';
      resolve({
        state,elapsed_wall_ms:elapsed,deadline_ms:deadlineMs,
        deadline_timer_fired:timedOut,
        termination_signal_attempted:timedOut||outputLimit,
        sigkill_escalation_attempted:forcedKill,
        child_exit_code:exitCode,
        child_exit_signal:exitSignal,
        stdout_sha256:hash(stdout.subarray(0,MAX_STREAM_BYTES)),
        stderr_sha256:hash(stderr.subarray(0,MAX_STREAM_BYTES)),
        stdout_exceeded_limit:stdout.length>MAX_STREAM_BYTES,
        stderr_exceeded_limit:stderr.length>MAX_STREAM_BYTES,
        no_result_accepted_after_deadline:overrun,
        fixture_result_accepted:good
      });
    }
    try{
      child=spawn(process.execPath,[childFile,mode],{
        cwd:folder,detached:true,stdio:['ignore','pipe','pipe'],
        env:{PATH:'/usr/bin:/bin',LC_ALL:'C',NODE_OPTIONS:''}
      });
    }catch{spawnFailed=true;settle();return;}
    hardTimer=setTimeout(()=>{
      timedOut=true;
      requestStop();
    },deadlineMs);
    child.stdout.on('data',data=>recordChunk('stdout',data));
    child.stderr.on('data',data=>recordChunk('stderr',data));
    child.on('error',()=>{spawnFailed=true;requestStop();});
    child.on('close',(code,signal)=>{
      exitCode=code;exitSignal=signal;
      settle();
    });
  });
  const receipt={
    schema:'evercraft.eo001.synthetic-hardstop-supervisor.v1',
    experiment:'OFFLINE_PROCESS_LIFECYCLE_TEST_ONLY',
    ...result,
    source_sha256:hash(workerSource),
    exactly_one_fixed_synthetic_child:true,
    model_inference_executed:false,
    original_hardware_attested:false,
    four_scenario_model_pass:false,
    private_evidence_released:false,
    external_actions_authorized:false,
    protocol_frozen:false,
    physical_run_authorized:false,
    negative_evidence_retained:result.state!=='SYNTHETIC_CHILD_COMPLETED'
  };
  privateWrite(receiptDir,mode,receipt);
  return receipt;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const [flag,mode,flag2,dir]=process.argv.slice(2);
  if(flag!=='--synthetic-mode'||flag2!=='--private-receipt-dir'||!allowed.has(mode)){
    process.stderr.write('BLOCKED: SYNTHETIC_FIXTURE_ONLY\n');
    process.exitCode=2;
  }else{
    try{
      const r=await runSyntheticHardstop({mode,receiptDir:dir});
      process.stdout.write(JSON.stringify({
        state:r.state,elapsed_wall_ms:r.elapsed_wall_ms,
        model_inference_executed:false,external_actions_authorized:false,
        physical_run_authorized:false
      })+'\n');
    }catch{
      process.stderr.write('BLOCKED: PRIVATE_OFFLINE_SUPERVISOR_PRECONDITION\n');
      process.exitCode=2;
    }
  }
}
