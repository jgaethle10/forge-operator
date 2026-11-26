// Bounded public-source observation for Earth Pulse on the *existing* company tick.
// Not a scheduler, Systemia admission, scientific finding, live data refresh,
// autonomous code worker, publishing decision, or private evidence exporter.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

export const EARTH_PULSE_SOURCE_PATHS=Object.freeze([
 'systemia/earth-pulse/photo-observation.mjs',
 'systemia/earth-pulse/repeat-review.mjs',
 'systemia/earth-pulse/waterway-context.mjs'
]);
const HASH=()=>createHash('sha256');
const BASE=Object.freeze({
 schema:'evercraft.kaidance.earth-pulse-source-observation.v1',
 project_key:'earth-pulse',
 lane_key:'earth-pulse',
 existing_draft_pr:2115,
 field_pilot_issue:2179,
 canonical_continuity_issue:1426,
 mission_admission_verified:false,
 researcher_execution_verified:false,
 field_data_validated:false,
 scientific_accuracy_verified:false,
 public_release_authorized:false,
 automated_alerts_authorized:false,
 worker_dispatched:false,
 physical_activity_authorized:false,
 source_authority:'repo_checkout_read_only',
});

export function inspectEarthPulseSource({root}={}){
 const report=(status,details={})=>({...BASE,status,
  required_file_count:EARTH_PULSE_SOURCE_PATHS.length,
  source_files_present:0,source_fingerprint:null,
  next_review_action:'review_existing_earth_pulse_pr_2115',
  ...details});
 if(typeof root!=='string'||!root) return report('held_invalid_root');
 let base;
 try{base=fs.realpathSync(root);if(!fs.statSync(base).isDirectory())return report('held_invalid_root')}
 catch{return report('held_invalid_root')}
 const hash=HASH(),missing=[];
 let present=0;
 try{
  for(const rel of EARTH_PULSE_SOURCE_PATHS){
   const filename=path.join(base,rel);
   let stats;
   try{stats=fs.lstatSync(filename)}
   catch(e){if(e?.code==='ENOENT'){missing.push(rel);continue}throw e}
   if(!stats.isFile()||stats.isSymbolicLink()||stats.size>256_000||
      fs.realpathSync(filename)!==filename) return report('held_invalid_source',{source_files_present:present});
   const buffer=fs.readFileSync(filename);
   // Reading the source bytes proves only local source presence, not execution.
   hash.update(rel);hash.update('\0');hash.update(buffer);hash.update('\0');
   present++;
  }
 }catch{return report('held_invalid_source',{source_files_present:present})}
 if(missing.length) return report('source_not_in_checkout',{
  source_files_present:present,missing_source_files:missing.length
 });
 return report('source_present_not_runtime_verified',{
  source_files_present:present,
  source_fingerprint:'sha256:'+hash.digest('hex'),
  next_review_action:'verify_existing_systemia_rd_export_and_real_research_receipt'
 });
}

export function earthPulseReviewCandidate(report){
 const valid=report?.schema===BASE.schema&&report.project_key==='earth-pulse';
 if(!valid||!['source_not_in_checkout','source_present_not_runtime_verified','held_invalid_source','held_invalid_root'].includes(report.status))
  throw Error('invalid_earth_pulse_source_observation');
 return {
  work_key:'earth-pulse:kaidance-research-continuity',
  lane_key:'earth-pulse',priority:2,
  action:report.next_review_action,
  authority:'systemia_private_mission_admission_and_human_review_required',
  admission_authorized:false,execution_authorized:false,
  publication_authorized:false,alert_authorized:false,
  changed_code_this_tick:false,
  source_status:report.status
 };
}
