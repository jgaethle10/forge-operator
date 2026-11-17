// Evercraft Medical Discovery v8: owned registry observation ledger.
// Evercraft's first snapshot is NOT the trial's original or preregistered protocol.
// Historical versions must be reviewed in ClinicalTrials.gov Record History.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const SCHEMA='evercraft.medical.registry-observation-ledger.v1';
const digest=(value)=>'sha256:'+createHash('sha256').update(JSON.stringify(value)).digest('hex');
const safe=(value,cap=300)=>String(value??'').replace(/\s+/g,' ').trim().slice(0,cap);
const e=(value)=>String(value??'').replace(/[&<>"']/g,c=>({
 '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
}[c]));
const isNct=(v)=>/^NCT\d{8}$/.test(String(v??''));
const FIELDS=['protocol_primary_outcomes','protocol_secondary_outcomes',
 'overall_status','registry_results_posted','last_update_posted'];
const clipRows=(rows,max)=>Array.isArray(rows)?rows.slice(0,max).map(x=>({
 type:safe(x?.type,60)||null,measure:safe(x?.measure,260)||null,
 time_frame:safe(x?.time_frame,220)||null,description:safe(x?.description,430)||null
 })).filter(x=>x.measure):[];

export function observationFromRegistry(record) {
 if(!record || !isNct(record.nct_id) ||
  record.metadata_identity!=='NCT_identifier_matches_registry_record' ||
  record.protocol_outcomes_status!=='observed_current_registry')return null;
 const snapshot={
  nct_id:record.nct_id,
  registry_url:'https://clinicaltrials.gov/study/'+record.nct_id,
  primary_outcomes:clipRows(record.protocol_primary_outcomes,12),
  secondary_outcomes:clipRows(record.protocol_secondary_outcomes,12),
  overall_status:safe(record.overall_status,80)||null,
  registry_results_posted:record.registry_results_posted===true,
  last_update_posted:safe(record.last_update_posted,30)||null
 };
 return {...snapshot,snapshot_digest:digest(snapshot)};
}

export function compareRegistryObservations(before,after) {
 if(!before || !after || before.nct_id!==after.nct_id)return [];
 const fields=[
  ['primary_outcomes','primary_outcome_text'],
  ['secondary_outcomes','secondary_outcome_text'],
  ['overall_status','recruitment_status'],
  ['registry_results_posted','results_posted_indicator'],
  ['last_update_posted','registry_post_date']
 ];
 return fields.filter(([key])=>JSON.stringify(before[key])!==JSON.stringify(after[key]))
  .map(([key,kind])=>({
    field:key,kind,from:before[key]??null,to:after[key]??null,
    meaning:'change_between_evercraft_observations_only',
    scientific_discrepancy_verified:false
  }));
}

export function updateRegistryObservationLedger({
 registry,previous=null,now=new Date(),maxRecords=200
}={}) {
 const observedAt=now.toISOString(),cap=Math.max(1,Math.min(500,Math.floor(Number(maxRecords)||200)));
 const previousOk=previous==null || (
  previous.schema===SCHEMA &&
  Array.isArray(previous.records) && previous.records.length<=500 &&
  previous.records.every(r=>isNct(r?.nct_id) && typeof r.first_observed_at==='string' &&
   r.last_snapshot?.nct_id===r.nct_id && Array.isArray(r.observed_changes))
 );
 const records=previousOk && Array.isArray(previous?.records)
  ? previous.records.map(x=>structuredClone(x)):[];
 const byId=new Map(records.map(x=>[x.nct_id,x]));
 const registryOk=registry?.source_status==='source_bound' &&
  typeof registry?.receipt_hash==='string' &&
  Array.isArray(registry?.checks);
 const checked=registryOk?registry.checks:[];
 let added=0,unchanged=0,changed=0,held=0,capacityHolds=0;
 const seen=new Set(),events=[];
 if(previousOk && registryOk)for(const check of checked){
  const id=check?.nct_id;
  if(!isNct(id)||seen.has(id))continue;
  seen.add(id);
  const exact=check.check_status==='registry_identifier_confirmed' &&
   check.record?.nct_id===id;
  const candidate=exact?observationFromRegistry(check.record):null;
  if(!candidate){
   held++;
   events.push({nct_id:id,status:'observation_held',
    reason:exact?'registry_protocol_outcomes_unavailable':'registry_identity_unconfirmed',
    previous_evidence_preserved:byId.has(id)});
   continue;
  }
  const entry=byId.get(id);
  if(!entry){
   if(records.length>=cap){capacityHolds++;events.push({nct_id:id,status:'capacity_hold'});continue;}
   const item={
    nct_id:id,first_observed_at:observedAt,last_observed_at:observedAt,
    last_source_receipt:registry.receipt_hash,
    observation_count:1,last_snapshot:candidate,observed_changes:[]
   };
   records.push(item);byId.set(id,item);added++;
   events.push({nct_id:id,status:'evercraft_first_capture',
    first_observed_at:observedAt,snapshot_digest:candidate.snapshot_digest,
    registry_record_history_url:candidate.registry_url,
    historical_preregistration_verified:false});
   continue;
  }
  const previousObservedAt=entry.last_observed_at;
  entry.last_observed_at=observedAt;
  entry.last_source_receipt=registry.receipt_hash;
  entry.observation_count=(Number(entry.observation_count)||1)+1;
  if(entry.last_snapshot.snapshot_digest===candidate.snapshot_digest){
   unchanged++;
   events.push({nct_id:id,status:'unchanged_since_prior_evercraft_capture',
    snapshot_digest:candidate.snapshot_digest});
   continue;
  }
  const differences=compareRegistryObservations(entry.last_snapshot,candidate);
  if(!differences.length){
   held++;events.push({nct_id:id,status:'snapshot_digest_mismatch_without_field_delta_hold'});
   continue;
  }
  const change={
   observed_at:observedAt,
   prior_snapshot_digest:entry.last_snapshot.snapshot_digest,
   new_snapshot_digest:candidate.snapshot_digest,
   prior_evercraft_observed_at:previousObservedAt,
   source_receipt:registry.receipt_hash,
   differences,
   verified_registry_amendment:false,
   requires_official_record_history_review:true
  };
  entry.observed_changes.push(change);
  entry.observed_changes=entry.observed_changes.slice(-10);
  entry.last_snapshot=candidate;changed++;
  events.push({nct_id:id,status:'observed_snapshot_delta',
   changed_fields:differences.map(x=>x.field),
   historical_preregistration_verified:false,
   prior_snapshot_digest:change.prior_snapshot_digest,
   new_snapshot_digest:change.new_snapshot_digest});
 }
 const status=!previousOk?'invalid_prior_ledger_hold':
  !registryOk?'source_hold_preserving_history':'observations_recorded_unreviewed';
 const stateBody={
  schema:SCHEMA,
  observed_at:observedAt,
  records,
  first_recorded_by:'Evercraft owned observation ledger; no historical completeness claimed',
  source_scope:'current official ClinicalTrials.gov v2 study snapshots only',
  publishing:'held_with_reason'
 };
 const state={...stateBody,receipt_hash:digest(stateBody)};
 const body={
  schema:'evercraft.medical.registry-observation-report.v1',
  observed_at:observedAt,status,
  input_registry_receipt:registry?.receipt_hash||null,
  previous_state_receipt:previous?.receipt_hash||null,
  state_receipt:state.receipt_hash,
  counts:{
   observed_this_cycle:seen.size,
   ledger_records:records.length,
   first_captures:added,
   unchanged_observations:unchanged,
   observed_deltas:changed,
   held_observations:held,
   capacity_holds:capacityHolds,
   independently_verified_amendments:0,
   verified_outcome_switches:0,
   publication_approvals:0
  },
  events,
  known_evercraft_records:records.map(x=>({
   nct_id:x.nct_id,first_observed_at:x.first_observed_at,
   last_observed_at:x.last_observed_at,
   observation_count:x.observation_count,
   retained_change_count:x.observed_changes.length,
   current_snapshot_digest:x.last_snapshot.snapshot_digest,
   registry_url:'https://clinicaltrials.gov/study/'+x.nct_id
  })),
  limitations:[
   'The first Evercraft observation is NOT original preregistration evidence.',
   'Current ClinicalTrials.gov API responses do not provide complete historical protocol versions.',
   'Detected field changes describe differences between two Evercraft captures; their exact amendment dates and meaning are not established.',
   'Source outages, absent NCT IDs, or missing outcome fields cannot erase prior evidence or imply a registry modification.',
   'Even after observed field changes, efficacy, misconduct, outcome switching and scientific discrepancies remain unverified.',
   'Independent review must inspect the ClinicalTrials.gov Record History tab and original study protocol, amendments, full text and statistical plan.'
  ],
  journal_and_clip:'held_with_reason',
  privacy:'public_registry_metadata_only; no_patient_records'
 };
 return {report:{...body,receipt_hash:digest(body)},state,can_persist:previousOk};
}

export function renderRegistryHistoryMarkdown(r) {
 const lines=['# Evercraft | Clinical Trial Registry Observation History','',
  '**Status:** '+r.status,
  '**Observed:** '+r.observed_at,
  '**Current Evercraft ledger records:** '+r.counts.ledger_records,
  '**First captures this cycle:** '+r.counts.first_captures,
  '**Observed field differences:** '+r.counts.observed_deltas,
  '**Verified historical amendments:** 0',
  '**Publication:** HELD','',
  '## Official Record History review'];
 for(const ev of r.events) {
  lines.push('','### '+ev.nct_id+' | '+ev.status,
   'Official registry: https://clinicaltrials.gov/study/'+ev.nct_id,
   'Compare historical versions using the study Record History tab.',
   'Established preregistration version: NO');
  if(ev.changed_fields)lines.push('Observed fields: '+ev.changed_fields.join(', '));
  if(ev.reason)lines.push('Source hold: '+ev.reason);
 }
 lines.push('','## Scientific limitations',...r.limitations.map(x=>'- '+x),
  '','No automated Journal or Clip authorization.','');
 return lines.join('\n');
}
export function renderRegistryHistoryHTML(r) {
 const css=':root{font:15px/1.55 system-ui;background:#061625;color:#edf5fd}'+
 '*{box-sizing:border-box}body{margin:0}.wrap{max-width:1160px;margin:auto;padding:30px 20px 90px}'+
 '.brand{font-size:11px;letter-spacing:.18em;font-weight:900;color:#8edfff}'+
 'header{background:radial-gradient(circle at top right,#26627c,transparent 58%),#0c2841;padding:50px;border:1px solid #37617b;border-radius:24px;margin:22px 0}'+
 'h1{font-size:clamp(35px,6vw,68px);letter-spacing:-.055em;line-height:1.08;margin:15px 0}'+
 'p{color:#bed4e5}.hold{display:inline-block;border:1px solid #b3956b;border-radius:17px;color:#ffdfba;font-size:12px;padding:8px 12px;font-weight:800}'+
 '.stats,.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.stats{margin:20px 0 37px}'+
 '.stat,.card,.notes{background:#102b45;border:1px solid #2e5068;border-radius:17px;padding:22px}'+
 '.stat strong{font-size:40px;display:block}.stat span{font-size:11px;text-transform:uppercase;color:#a8c9dc}'+
 '.cards{grid-template-columns:repeat(2,1fr)}h2{font-size:28px;letter-spacing:-.025em;margin:36px 0 14px}'+
 'a{color:#91e8ff}.title{font-size:12px;color:#9de7fb;font-weight:850;letter-spacing:.08em}'+
 '.notes li{margin:9px 0;color:#c1d9e7}.sm{font-size:12px;color:#aec8d8}'+
 '@media(max-width:740px){header{padding:32px 22px}.stats,.cards{grid-template-columns:1fr}}'+
 '@media print{:root{background:white;color:#172c40}.stat,.card,.notes,header{background:#eaf3f9;color:#172c40;break-inside:avoid}.sm,p,.notes li{color:#445d70}}';
 const stat=(n,s)=>'<div class="stat"><strong>'+n+'</strong><span>'+s+'</span></div>';
 const cards=r.events.map(x=>'<article class="card"><div class="title">'+e(x.nct_id)+' · '+e(x.status)+'</div>'+
  '<h3><a rel="noopener noreferrer" target="_blank" href="https://clinicaltrials.gov/study/'+e(x.nct_id)+'">'+e(x.nct_id)+'</a></h3>'+
  '<p class="sm">'+(x.changed_fields?'Observed fields: '+e(x.changed_fields.join(', '))+
  '. These are not proven historical amendments.':
  'Source observation only; no original protocol version verified.')+'</p>'+
  '<p class="sm">Open the official Record History tab for earlier versions.</p></article>').join('');
 return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
 '<title>Evercraft | Registry Change History</title><style>'+css+'</style></head><body><main class="wrap">'+
 '<div class="brand">EVERCRAFT / MEDICAL DISCOVERY / HISTORICAL REVIEW</div><header>'+
 '<div class="brand">TRIAL RECORD OBSERVATION LEDGER</div><h1>What changed?<br>What can we prove?</h1>'+
 '<p>Timestamped differences in actual registry responses. No invented past protocols, no implied outcome switching, and no unsupported treatment claims.</p>'+
 '<span class="hold">INDEPENDENT HISTORICAL REVIEW REQUIRED</span></header>'+
 '<div class="stats">'+stat(r.counts.ledger_records,'Studies in Evercraft ledger')+
 stat(r.counts.observed_deltas,'Observed changes this cycle')+
 stat(r.counts.independently_verified_amendments,'Historically verified amendments')+'</div>'+
 '<h2>Observed records</h2><div class="cards">'+(cards||'<p>No complete registry observations in this cycle.</p>')+'</div>'+
 '<section class="notes"><h2>Evidence boundaries</h2><ul>'+
 r.limitations.map(x=>'<li>'+e(x)+'</li>').join('')+'</ul>'+
 '<p class="sm">Journal and Clip: HELD. Source receipts: '+e(r.input_registry_receipt||'none')+
 ' / '+e(r.previous_state_receipt||'none')+'</p></section>'+
 '</main></body></html>';
}

export function writeRegistryObservationLedger({
 registry,now=new Date(),
 outDir=path.join(process.cwd(),'artifacts/medical-registered-trials/history'),
 previous=null,maxRecords=200
}={}) {
 fs.mkdirSync(outDir,{recursive:true});
 const stateFile=path.join(outDir,'state.json');
 let previousValue=previous;
 let corrupt=false;
 if(previous==null && fs.existsSync(stateFile)){
  try{previousValue=JSON.parse(fs.readFileSync(stateFile,'utf8'));}
  catch{corrupt=true;previousValue={schema:'invalid_persisted_state'};}
 }
 const result=updateRegistryObservationLedger({registry,previous:previousValue,now,maxRecords});
 // Do NOT overwrite corrupt or unverifiable prior state with a fabricated first cycle.
 if(result.can_persist && !corrupt)fs.writeFileSync(stateFile,JSON.stringify(result.state,null,2)+'\n');
 fs.writeFileSync(path.join(outDir,'latest.json'),JSON.stringify(result.report,null,2)+'\n');
 fs.writeFileSync(path.join(outDir,'review.md'),renderRegistryHistoryMarkdown(result.report));
 fs.writeFileSync(path.join(outDir,'index.html'),renderRegistryHistoryHTML(result.report));
 return result.report;
}
