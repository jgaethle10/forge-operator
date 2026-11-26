// Flight Sentinel is a source-only observation inside the EXISTING Kaidance tick.
// Does not admit missions, start workers/timers, fetch GitHub, control aviation,
// inspect live networks, dispatch experiments or publish research.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const REGISTRY='registry/kaidance-flight-sentinel-continuity.v1.json';
const SCHEMA='evercraft.kaidance.flight-sentinel-continuity.v1';
const PR_BY_KEY=Object.freeze({
 'flight-sentinel-aircraft':{pr:1882,lane:'science-research',
  prefix:'research/flight-sentinel/v0_6/'},
 'flight-sentinel-infrastructure':{pr:2112,lane:'infrastructure-watch',
  prefix:'research/flight-sentinel/infrastructure_guardian/v0_2/'}
});
const KEYS=Object.keys(PR_BY_KEY).sort();
const safeFile=(f,prefix)=>typeof f==='string'&&f.startsWith(prefix)&&
 /^[a-z0-9_./-]+\.py$/.test(f)&&!f.includes('..')&&!f.includes('//')&&f.length<=200;
const base=Object.freeze({schema:'evercraft.kaidance.flight-sentinel-source-observation.v1',
 source_authority:'repository_checkout_read_only',
 heartbeat_seconds:300,
 coverage_verified:false,
 systemia_mission_admission_verified:false,
 research_execution_verified:false,
 independent_experiment_receipt_verified:false,
 live_aircraft_protection:false,
 live_network_protection:false,
 worker_dispatched:false,
 code_changed_this_tick:false,
 external_io_performed:false,
 new_scheduler_created:false,
 publication_authorized:false,
 hardware_activity_authorized:false,
 automatic_network_isolation_authorized:false
});
const empty=(status)=>({...base,status,tracked_projects:0,projects:[],
 review_candidates:[]});

function parseRegistry(root){
 const filename=path.join(root,REGISTRY),stat=fs.lstatSync(filename);
 if(stat.isSymbolicLink()||!stat.isFile()||stat.size>32768||
    fs.realpathSync(filename)!==filename)throw Error('invalid_registry_file');
 const manifest=JSON.parse(fs.readFileSync(filename,'utf8'));
 if(manifest?.schema!==SCHEMA||manifest.heartbeat_seconds!==300||
    manifest.new_scheduler_authorized!==false||
    manifest.source_checks_only!==true||
    manifest.private_rd_export_required!==true||
    manifest.mission_admission_policy!=='existing_systemia_authority_only'||
    manifest.automatic_research_or_network_execution!==false||
    manifest.physical_or_aviation_activity_authorized!==false||
    manifest.external_publication_authorized!==false||
    !Array.isArray(manifest.projects)||manifest.projects.length!==2)
   throw Error('invalid_flight_sentinel_registry');
 const seen=new Set();
 for(const p of manifest.projects){
  const expected=PR_BY_KEY[p?.project_key];
  if(!expected||seen.has(p.project_key)||p.existing_pr!==expected.pr||
     p.lane_key!==expected.lane||!Array.isArray(p.source_files)||
     p.source_files.length!==2||new Set(p.source_files).size!==2||
     !p.source_files.every(f=>safeFile(f,expected.prefix))||
     p.review_work_key!==p.project_key+':systemia-research-continuity'||
     !/^[a-z0-9_]{5,100}$/.test(p.review_action||'')||
     typeof p.existing_branch!=='string'||!/^research\/[a-z0-9-]+$/.test(p.existing_branch))
    throw Error('invalid_flight_sentinel_project');
  seen.add(p.project_key);
 }
 if(KEYS.some(k=>!seen.has(k)))throw Error('missing_flight_sentinel_project');
 return manifest;
}
function checkProject(root,p){
 const h=createHash('sha256');
 let found=0;
 let missing=0;
 for(const rel of p.source_files){
  const filename=path.join(root,rel);
  let stat;
  try{stat=fs.lstatSync(filename)}
  catch(e){if(e?.code==='ENOENT'){missing++;continue}return {status:'held_invalid_source',found,missing}}
  try{
   if(stat.isSymbolicLink()||!stat.isFile()||stat.size>256000||
       fs.realpathSync(filename)!==filename)
    return {status:'held_invalid_source',found,missing};
   const bytes=fs.readFileSync(filename);
   h.update(rel);h.update('\0');h.update(bytes);h.update('\0');
   found++;
  }catch{return {status:'held_invalid_source',found,missing}}
 }
 return {status:missing?'source_not_in_checkout':'source_present_not_runtime_verified',
  found,missing,fingerprint:missing?null:'sha256:'+h.digest('hex')};
}
export function inspectFlightSentinelContinuity({root}={}){
 if(typeof root!=='string'||!root)return empty('held_invalid_root');
 let repo;
 try{repo=fs.realpathSync(root);if(!fs.statSync(repo).isDirectory())
  return empty('held_invalid_root')}
 catch{return empty('held_invalid_root')}
 let registry;
 try{registry=parseRegistry(repo)}catch{return empty('held_registry_unavailable_or_invalid')}
 const projects=registry.projects.map(p=>{
  const c=checkProject(repo,p);
  return {
   project_key:p.project_key,
   lane_key:p.lane_key,
   existing_research_pr:p.existing_pr,
   source_branch_reference_only:p.existing_branch,
   source_status:c.status,
   expected_source_files:p.source_files.length,
   source_files_present:c.found,
   source_files_missing:c.missing,
   source_fingerprint:c.fingerprint||null,
   mission_admission_verified:false,
   research_execution_verified:false,
   next_action:'reconcile_existing_project_with_systemia_and_actual_research_receipts'
  };
 });
 const review_candidates=registry.projects.map((p,i)=>({
  work_key:p.review_work_key,
  lane_key:p.lane_key,
  priority:2,
  action:p.review_action,
  research_pr:p.existing_pr,
  source_status:projects[i].source_status,
  authority:'existing_systemia_private_rd_admission_and_review_required',
  admission_authorized:false,
  execution_authorized:false,
  aircraft_operation_authorized:false,
  network_operation_authorized:false,
  publication_authorized:false
 }));
 return {...base,status:'source_only_review_required',
  tracked_projects:projects.length,projects,review_candidates,
  private_rd_export_status:'not_independently_verified_here',
  next_step:'use_existing_owner_private_rd_export_and_goal_checkpoint_matching'};
}
