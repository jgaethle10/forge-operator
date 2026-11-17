/**
 * EO-001 Gate 1 supervisor-side, READ-ONLY cgroup-v2 subtree observation.
 *
 * No systemd-run/systemctl, spawn, kill, models, network, secrets, or
 * authority change. A future, independently authorized supervisor can call
 * this twice, before and after its separately reviewed exact-scope stop.
 *
 * Key constraint: an unavailable or recreated scope after stop is UNKNOWN.
 * It must never count as evidence that cgroup descendants were cleaned up.
 */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const UNIT=/^eo001-g1-synthetic-[0-9a-f]{32}\.scope$/;
const SEGMENT=/^[a-zA-Z0-9_.@-]+$/;
const BOOT=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIMIT_NODES=40;
const LIMIT_DEPTH=6;
const LIMIT_TEXT=512;
const sha=value=>createHash('sha256').update(value).digest('hex');
const refuse=code=>{const e=new Error(code);e.code=code;throw e;};

export function parseStrictCgroupEvents(raw){
  if(typeof raw!=='string'||Buffer.byteLength(raw)>LIMIT_TEXT)
    refuse('CGROUP_EVENTS_UNAVAILABLE_OR_TOO_LARGE');
  const entries=raw.trim().split(/\r?\n/);
  const keys=new Set();
  let populated=null;
  for(const entry of entries){
    const parts=entry.match(/^([a-z_]+) ([0-9]+)$/);
    if(!parts||keys.has(parts[1]))refuse('CGROUP_EVENTS_INVALID');
    keys.add(parts[1]);
    if(parts[1]==='populated'){
      if(parts[2]!=='0'&&parts[2]!=='1')
        refuse('CGROUP_EVENTS_INVALID');
      populated=parts[2]==='1';
    }
  }
  if(populated===null)refuse('CGROUP_POPULATED_MISSING');
  return {populated};
}
function boundedString(io,file,size=LIMIT_TEXT){
  let value;
  try{value=io.readFileSync(file,'utf8');}catch{
    refuse('SUPERVISOR_READBACK_UNAVAILABLE');
  }
  if(typeof value!=='string'||Buffer.byteLength(value)>size)
    refuse('SUPERVISOR_READBACK_INVALID');
  return value.trim();
}
function actualDirectory(io,dir,root){
  let stat,real;
  try{
    stat=io.lstatSync(dir);
    real=io.realpathSync(dir);
  }catch{refuse('CGROUP_SUBTREE_UNAVAILABLE');}
  if(!stat.isDirectory()||stat.isSymbolicLink()||
    path.resolve(real)!==path.resolve(dir)||
    (dir!==root&&!path.resolve(dir).startsWith(path.resolve(root)+path.sep)))
    refuse('CGROUP_SUBTREE_UNTRUSTED');
  if(!Number.isSafeInteger(Number(stat.dev))||
     !Number.isSafeInteger(Number(stat.ino)))
    refuse('CGROUP_SUBTREE_IDENTITY_INVALID');
  return {dev:String(stat.dev),ino:String(stat.ino)};
}
export function validateSyntheticScopePath({controlGroup,scopeUnit}={}){
  if(typeof controlGroup!=='string'||!UNIT.test(scopeUnit))
    refuse('SCOPE_IDENTITY_INVALID');
  if(!controlGroup.startsWith('/')||controlGroup.length>512||
     /[\r\n\\]/.test(controlGroup))
    refuse('SCOPE_PATH_UNTRUSTED');
  const segments=controlGroup.slice(1).split('/');
  if(segments.length<2||segments.length>24||
     segments.at(-1)!==scopeUnit||
     segments.some(s=>!SEGMENT.test(s)||s==='.'||s==='..'))
    refuse('SCOPE_PATH_UNTRUSTED');
  return segments;
}
function parseLimits(io,leaf){
  const files=['memory.max','memory.swap.max','pids.max','cpu.max'];
  const values={};
  for(const name of files){
    const text=boundedString(io,path.join(leaf,name),96);
    if(name==='cpu.max'){
      if(!/^(?:max|[1-9][0-9]*) [1-9][0-9]*$/.test(text))
        refuse('RESOURCE_READBACK_INVALID');
    }else if(!/^(?:max|[0-9]+)$/.test(text)){
      refuse('RESOURCE_READBACK_INVALID');
    }
    values[name]=text;
  }
  return values;
}

/**
 * Reads a synthetic cgroup from the *supervisor*, not the child.
 * fsAPI/root injection is for synthetic test fixtures; production caller must
 * use the actual /sys/fs/cgroup root and a reviewed systemd ControlGroup.
 */
export function readSyntheticScopeSubtree({
  controlGroup,scopeUnit,fsAPI=fs,root='/sys/fs/cgroup',
  observedMonotonicMs
}={}){
  const segments=validateSyntheticScopePath({controlGroup,scopeUnit});
  if(typeof root!=='string'||!path.isAbsolute(root)||
     !Number.isFinite(observedMonotonicMs)||observedMonotonicMs<0)
    refuse('OBSERVATION_INPUT_INVALID');
  const base=path.resolve(root);
  actualDirectory(fsAPI,base,base);
  const scopePath=path.resolve(base,...segments);
  const rootIdentity=actualDirectory(fsAPI,scopePath,base);
  const bootId=boundedString(fsAPI,'/proc/sys/kernel/random/boot_id',64);
  if(!BOOT.test(bootId))refuse('HOST_BOOT_ID_UNAVAILABLE');
  const limits=parseLimits(fsAPI,scopePath);
  const nodes=[];
  const seen=new Set();
  function visit(dir,relative,depth){
    if(depth>LIMIT_DEPTH||nodes.length>=LIMIT_NODES)
      refuse('CGROUP_SUBTREE_COMPLEXITY_EXCEEDED');
    const id=actualDirectory(fsAPI,dir,base);
    const events=parseStrictCgroupEvents(
      boundedString(fsAPI,path.join(dir,'cgroup.events')));
    if(seen.has(relative))refuse('CGROUP_SUBTREE_DUPLICATE');
    seen.add(relative);
    nodes.push({
      relative,dev:id.dev,ino:id.ino,
      populated:events.populated
    });
    let entries;
    try{entries=fsAPI.readdirSync(dir,{withFileTypes:true});}
    catch{refuse('CGROUP_SUBTREE_UNAVAILABLE');}
    const children=entries.filter(e=>e.isDirectory()||e.isSymbolicLink())
      .sort((a,b)=>a.name.localeCompare(b.name));
    for(const child of children){
      if(!SEGMENT.test(child.name)||child.name==='.'||
         child.name==='..'||child.isSymbolicLink())
        refuse('CGROUP_SUBTREE_UNTRUSTED');
      visit(path.join(dir,child.name),
        relative==='.'?child.name:relative+'/'+child.name,depth+1);
    }
  }
  visit(scopePath,'.',0);
  const rootAgain=actualDirectory(fsAPI,scopePath,base);
  if(rootAgain.dev!==rootIdentity.dev||rootAgain.ino!==rootIdentity.ino)
    refuse('CGROUP_SUBTREE_CHANGED_DURING_READ');
  return {
    schema:'evercraft.eo001.synthetic-supervisor-subtree-capture.v1',
    scope_unit:scopeUnit,control_group_sha256:sha(controlGroup),
    boot_id:bootId,scope_dev:rootIdentity.dev,scope_ino:rootIdentity.ino,
    observed_monotonic_ms:observedMonotonicMs,
    resource_readback:limits,nodes,
    source:'supervisor_read_only_filesystem_capture',
    child_json_used:false,
    external_evidence_authenticated:false,
    systemd_stop_called_by_this_module:false,
    model_execution_authorized:false
  };
}

function identicalResources(before,plan){
  if(!plan||typeof plan!=='object'||Array.isArray(plan))
    refuse('FROZEN_RESOURCE_PLAN_REQUIRED');
  const keys=['memory.max','memory.swap.max','pids.max','cpu.max'];
  if(Object.keys(plan).sort().join('|')!==keys.sort().join('|'))
    refuse('FROZEN_RESOURCE_PLAN_INCOMPLETE');
  for(const key of keys){
    if(typeof plan[key]!=='string'||plan[key]!==before[key])
      refuse('FROZEN_RESOURCE_LIMIT_MISMATCH');
    // No unbounded limits can become a synthetic cleanup PASS through a
    // conveniently chosen frozen plan. A changed policy requires a new
    // jointly reviewed contract, never a silent fallback.
    if(key==='cpu.max'?plan[key].startsWith('max '):
       plan[key]==='max')
      refuse('FROZEN_RESOURCE_UNBOUNDED');
    if(key!=='cpu.max'&&key!=='memory.swap.max'&&
       (!/^[1-9][0-9]*$/.test(plan[key])))
      refuse('FROZEN_RESOURCE_LIMIT_INVALID');
  }
}

/**
 * Compares two read-only observations. The result is a consistency finding,
 * not proof that a specific systemd stop was issued or host is attested.
 */
export function assessSyntheticSubtreeCleanup({
  before,after,frozenResourcePlan,cleanupDeadlineMs=4000
}={}){
  if(!before||!after||
     before.schema!=='evercraft.eo001.synthetic-supervisor-subtree-capture.v1'||
     after.schema!==before.schema||
     !Number.isFinite(cleanupDeadlineMs)||cleanupDeadlineMs<=0||
     cleanupDeadlineMs>60000)
    refuse('CLEANUP_EVIDENCE_INCOMPLETE');
  identicalResources(before.resource_readback,frozenResourcePlan);
  if(before.scope_unit!==after.scope_unit||
     before.control_group_sha256!==after.control_group_sha256||
     before.boot_id!==after.boot_id||
     before.scope_dev!==after.scope_dev||
     before.scope_ino!==after.scope_ino)
    refuse('CLEANUP_CGROUP_IDENTITY_CHANGED');
  if(before.source!=='supervisor_read_only_filesystem_capture'||
     after.source!==before.source||
     before.child_json_used!==false||after.child_json_used!==false)
    refuse('CLEANUP_OBSERVER_PROVENANCE_INVALID');
  const elapsed=after.observed_monotonic_ms-before.observed_monotonic_ms;
  if(!Number.isFinite(elapsed)||elapsed<0||elapsed>cleanupDeadlineMs)
    refuse('CLEANUP_DEADLINE_UNVERIFIED');
  const original=before.nodes,following=after.nodes;
  if(!Array.isArray(original)||!Array.isArray(following)||
     !original.length||original.length!==following.length||
     original[0].relative!=='.'||original[0].populated!==true)
    refuse('CLEANUP_SUBTREE_BASELINE_INVALID');
  for(let i=0;i<original.length;i++){
    const prior=original[i],next=following[i];
    if(!next||prior.relative!==next.relative||
       prior.dev!==next.dev||prior.ino!==next.ino)
      refuse('CLEANUP_SUBTREE_IDENTITY_CHANGED');
    if(next.populated!==false)
      refuse('CLEANUP_SUBTREE_STILL_POPULATED_OR_UNKNOWN');
  }
  if(JSON.stringify(before.resource_readback)!==
     JSON.stringify(after.resource_readback))
    refuse('CLEANUP_RESOURCE_PLAN_DRIFT');
  return {
    schema:'evercraft.eo001.synthetic-supervisor-cleanup-comparison.v1',
    state:'TWO_SNAPSHOT_KERNEL_READBACK_CONSISTENT',
    pre_stop_subtree_populated:true,
    post_observed_subtree_zero:true,
    identity_and_boot_continuous:true,
    elapsed_monotonic_ms:elapsed,
    cleanup_deadline_ms:cleanupDeadlineMs,
    exact_resources_agreed:true,
    observed_node_count:following.length,
    // No operation/attestation claims from supplied or captured metadata.
    actual_systemd_stop_independently_observed:false,
    physical_host_independently_attested:false,
    execution_authorized:false,
    real_qwen_decision_proven:false,
    provider_effects_authorized:false
  };
}
