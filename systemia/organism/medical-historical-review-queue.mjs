// Medical Discovery v9: independent historical-source review preparation.
// The queue links published papers, source-confirmed trial IDs and owned observations.
// It DOES NOT retrieve or infer historic protocol versions or approve medical claims.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const hash=x=>'sha256:'+createHash('sha256').update(JSON.stringify(x)).digest('hex');
const clean=(v,n=400)=>String(v??'').replace(/\s+/g,' ').trim().slice(0,n);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
const validNct=x=>/^NCT\d{8}$/.test(String(x??''));
const validPmid=x=>/^\d{1,12}$/.test(String(x??''));

const REQUIRED_REVIEW=[
 {id:'official_first_version',title:'Verify the earliest available posted protocol version',
  evidence:'ClinicalTrials.gov Record History version identifier, posting date and original primary outcomes'},
 {id:'pre_enrollment_timing',title:'Establish whether the registered outcomes predated enrollment',
  evidence:'Recruitment/enrollment start date, original outcome record and independent date evidence'},
 {id:'amendment_chronology',title:'Review intervening trial amendments',
  evidence:'Version-by-version change dates, changed measures and reasons, if documented'},
 {id:'publication_full_text',title:'Compare the complete published methods and primary outcomes',
  evidence:'Full text and supplements with exact primary outcome definitions, times and analyses'},
 {id:'bias_and_corrections',title:'Review study quality and source corrections',
  evidence:'Risk-of-bias evaluation, corrections/retractions, statistical plan and external appraisal'},
 {id:'independent_editorial_review',title:'Obtain independent scientific and editorial authorization',
  evidence:'Named accountable reviewer, evidence receipts, decision timestamp and approved claim scope'}
];

export function buildMedicalHistoricalReviewQueue({
  registry,history,outcomeAudit,now=new Date()
}={}) {
  const linked=Boolean(
    registry?.source_status==='source_bound' &&
    /^sha256:[0-9a-f]{64}$/.test(String(registry?.receipt_hash??'')) &&
    history?.status==='observations_recorded_unreviewed' &&
    history?.input_registry_receipt===registry.receipt_hash &&
    /^sha256:[0-9a-f]{64}$/.test(String(history?.state_receipt??'')) &&
    outcomeAudit?.source_status==='source_linked_unreviewed' &&
    outcomeAudit?.input_receipts?.registry===registry.receipt_hash &&
    /^sha256:[0-9a-f]{64}$/.test(String(outcomeAudit?.receipt_hash??''))
  );
  const known=new Map();
  if(linked && Array.isArray(history.known_evercraft_records)){
    for(const r of history.known_evercraft_records)
      if(validNct(r?.nct_id) && !known.has(r.nct_id))known.set(r.nct_id,r);
  }
  const tasks=[];
  const seen=new Set();
  const audits=linked && Array.isArray(outcomeAudit.audits)?outcomeAudit.audits:[];
  if(linked && Array.isArray(registry.checks))for(const check of registry.checks.slice(0,5)){
    const nct=check?.nct_id;
    if(!validNct(nct)||seen.has(nct))continue;
    seen.add(nct);
    if(check.check_status!=='registry_identifier_confirmed'||
      check?.record?.nct_id!==nct)continue;
    const snapshot=known.get(nct);
    if(!snapshot)continue;
    const citedIds=new Set(Array.isArray(check.source_pubmed_ids)?
      check.source_pubmed_ids.filter(validPmid).map(String):[]);
    const related=audits.filter(a=>
      a.nct_id===nct && a.verified_registry_identity===true &&
      validPmid(a.pmid) && citedIds.has(String(a.pmid))).slice(0,8);
    if(!related.length)continue;
    const primary=Array.isArray(check.record.protocol_primary_outcomes)?
      check.record.protocol_primary_outcomes.slice(0,12).map(x=>({
       measure:clean(x?.measure,260),time_frame:clean(x?.time_frame,220)||null
      })).filter(x=>x.measure):[];
    const articles=related.map(a=>({
      pmid:String(a.pmid),article_url:'https://pubmed.ncbi.nlm.nih.gov/'+a.pmid+'/',
      title:clean(a.article_title,350),
      structured_abstract_results_present:Array.isArray(a.abstract_reported_excerpts)&&a.abstract_reported_excerpts.length>0,
      reviewer_state:clean(a.scientific_review_state,140)
    }));
    const gates=REQUIRED_REVIEW.map(g=>({
      gate_id:g.id,question:g.title,required_evidence:g.evidence,
      status:'unreviewed',evidence_version:null,evidence_receipt:null,
      adjudicated_by:null,decision_at:null
    }));
    const status=Number(snapshot.retained_change_count)>0?
      'evercraft_delta_needs_historical_version_review':
      'first_observation_not_original_protocol';
    tasks.push({
      task_id:'MED-HISTORY-'+nct,
      nct_id:nct,status,
      record_history_url:'https://clinicaltrials.gov/study/'+nct+'?tab=history',
      registry_current_url:'https://clinicaltrials.gov/study/'+nct,
      current_registry_receipt:registry.receipt_hash,
      evercraft_first_observed_at:snapshot.first_observed_at,
      evercraft_last_observed_at:snapshot.last_observed_at,
      evercraft_snapshot_digest:snapshot.current_snapshot_digest,
      evercraft_observed_changes:Number(snapshot.retained_change_count)||0,
      published_papers:articles,
      current_primary_outcomes:primary,
      registry_results_posted:check.record.registry_results_posted===true,
      review_gates:gates,
      earliest_original_protocol_verified:false,
      historical_amendments_verified:0,
      independent_outcome_claims_verified:0,
      publication_eligible:false
    });
  }
  const body={
    schema:'evercraft.medical.historical-review-queue.v1',
    generated_at:now.toISOString(),
    status:linked?'source_linked_review_required':'upstream_source_or_receipt_hold',
    input_receipts:{
      registry:registry?.receipt_hash||null,
      observed_history:history?.receipt_hash||null,
      outcome_audit:outcomeAudit?.receipt_hash||null
    },
    counts:{
      official_nct_history_tasks:tasks.length,
      unique_trial_ids:tasks.length,
      cited_papers:tasks.reduce((n,t)=>n+t.published_papers.length,0),
      current_primary_outcome_rows:tasks.reduce((n,t)=>n+t.current_primary_outcomes.length,0),
      history_gates_unreviewed:tasks.reduce((n,t)=>n+t.review_gates.length,0),
      historical_protocols_verified:0,
      verified_outcome_switches:0,
      independent_clinical_claims_verified:0,
      approved_for_publication:0
    },
    tasks,
    methodology:[
      'This report is a research work queue, not evidence that historical protocol amendments occurred.',
      'The first Evercraft observation is never classified as the original trial registration.',
      'The Record History link opens ClinicalTrials.gov. This code does not fabricate a history version or rely on an undocumented history API.',
      'A field change observed by Evercraft is not itself a verified original-protocol amendment or evidence of outcome switching.',
      'Matching a PubMed PMID to an NCT identifier is metadata identity, not independent clinical verification.',
      'All named historical evidence gates remain unreviewed until source records and an accountable independent reviewer establish them.',
      'No patient data; no effectiveness or safety conclusions; no automated Journal or Clip publishing.'
    ],
    editorial:{journal:'held_with_reason',clip:'held_with_reason',
      hold:'Original preregistration history, study quality, clinical outcomes and independent editorial authorization not established.'}
  };
  return {...body,receipt_hash:hash(body)};
}
export function renderHistoricalReviewMarkdown(r){
  const lines=[
   '# EVERCRAFT | Historical Trial Evidence Review Queue','',
   '**Status:** '+r.status,'**Tasks:** '+r.counts.official_nct_history_tasks,
   '**Historically verified protocols:** 0',
   '**Scientific claims approved:** 0','**Journal / Clip:** HELD','',
   '## Trial-by-trial verification tasks'];
  for(const t of r.tasks){
    lines.push('','### '+t.nct_id+' · '+t.status,
      'Official Record History: '+t.record_history_url,
      'Evercraft first observed: '+t.evercraft_first_observed_at,
      'Evercraft snapshot receipt: '+t.evercraft_snapshot_digest,
      'Observed field changes (not verified amendments): '+t.evercraft_observed_changes,
      'PubMed PMIDs: '+t.published_papers.map(p=>p.pmid).join(', '));
    for(const o of t.current_primary_outcomes)lines.push(
      '- Current primary outcome: '+o.measure+'; time frame: '+(o.time_frame||'not supplied'));
    lines.push('','**Evidence gates still required:**');
    for(const g of t.review_gates)lines.push(
      '- [ ] '+g.question+' | needed: '+g.required_evidence);
  }
  lines.push('','## Limitations',...r.methodology.map(x=>'- '+x),
    '','Publication remains blocked.','');
  return lines.join('\n');
}
export function renderHistoricalReviewHTML(r){
 const css=':root{font-family:Inter,system-ui,Arial,sans-serif;background:#f5f8fc;color:#12263b}'+
 '*{box-sizing:border-box}body{margin:0}.wrap{max-width:1160px;margin:auto;padding:25px 20px 75px}'+
 '.eyebrow{letter-spacing:.15em;color:#336a86;font-size:11px;font-weight:850}'+
 '.hero{background:linear-gradient(132deg,#091b31,#1d506d);color:white;border-radius:25px;padding:48px;margin:24px 0}'+
 '.hero h1{font-size:clamp(36px,6vw,66px);line-height:1.05;letter-spacing:-.05em;margin:20px 0}'+
 '.hero p{font-size:17px;color:#d3e7f2;line-height:1.6;max-width:760px}'+
 '.pill{border:1px solid #bddbe8;border-radius:30px;font-size:11px;padding:8px 12px;color:#e2f8ff;display:inline-block}'+
 '.stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:20px 0 30px}'+
 '.stat,.card,.notes{background:white;border:1px solid #d0e1eb;border-radius:17px;padding:22px}'+
 '.stat strong{font-size:39px;display:block}.stat span{font-size:11px;color:#517288;text-transform:uppercase}'+
 '.cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px}'+
 '.card h3{margin:12px 0;font-size:24px}.sub{font-size:12px;color:#4e6c81;line-height:1.75}'+
 '.gate{border-top:1px solid #e0eaf2;padding:10px 0;font-size:13px;line-height:1.6}'+
 '.tag{font-size:10px;color:#805c2b;font-weight:800;letter-spacing:.07em}'+
 'a{color:#126087}ul{padding-left:20px}li{padding:5px 0;line-height:1.6}'+
 '@media(max-width:700px){.hero{padding:33px 23px}.cards,.stats{grid-template-columns:1fr}}'+
 '@media print{.card,.stat,.notes{break-inside:avoid}}';
 const stat=(num,label)=>'<div class="stat"><strong>'+num+'</strong><span>'+label+'</span></div>';
 const cards=r.tasks.map(t=>'<article class="card"><div class="eyebrow">'+esc(t.nct_id)+
  '</div><h3><a href="'+t.record_history_url+'" target="_blank" rel="noopener noreferrer">Record History</a></h3>'+
  '<p class="sub">First Evercraft capture: '+esc(t.evercraft_first_observed_at)+
  '<br>Published papers: '+t.published_papers.map(p=>'<a target="_blank" rel="noopener noreferrer" href="'+p.article_url+'">PMID '+esc(p.pmid)+'</a>').join(', ')+
  '<br>Current primary outcome measures: '+t.current_primary_outcomes.length+
  '<br>Evercraft-observed changes: '+t.evercraft_observed_changes+'</p>'+
  '<div class="tag">HISTORICAL RESEARCH REQUIRED</div>'+
  t.review_gates.map(g=>'<div class="gate">□ '+esc(g.question)+
  '<div class="sub">'+esc(g.required_evidence)+'</div></div>').join('')+
  '</article>').join('');
 return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"/>'+
  '<title>Evercraft | Historical Research Queue</title><style>'+css+'</style></head><body><main class="wrap">'+
  '<div class="eyebrow">EVERCRAFT / MEDICAL DISCOVERY / HISTORICAL REVIEW</div><header class="hero">'+
  '<span class="pill">PUBLIC RESEARCH · INDEPENDENT APPRAISAL REQUIRED</span>'+
  '<h1>Proof has a history.</h1><p>For each trial, link the actual PubMed evidence and Evercraft observations to official ClinicalTrials.gov Record History. Every missing historical fact remains a visible question, not a medical conclusion.</p></header>'+
  '<section class="stats">'+stat(r.counts.official_nct_history_tasks,'Trials awaiting historical review')+
  stat(r.counts.history_gates_unreviewed,'Evidence gates still open')+
  stat(r.counts.approved_for_publication,'Publication approvals')+'</section>'+
  '<h2>Trial investigation queue</h2><div class="cards">'+
  (cards||'<p>No source-confirmed trial tasks ready. Upstream evidence remains held or empty.</p>')+
  '</div><section class="notes"><h2>Evidence firewall</h2><ul>'+
  r.methodology.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>'+
  '<p class="sub">Receipt: '+esc(r.receipt_hash)+' · '+esc(r.editorial.hold)+'</p></section>'+
  '</main></body></html>';
}
export function writeMedicalHistoricalReviewQueue({
 registry,history,outcomeAudit,now=new Date(),
 outDir=path.join(process.cwd(),'artifacts/medical-registered-trials/historical-review')
}={}){
 const report=buildMedicalHistoricalReviewQueue({registry,history,outcomeAudit,now});
 fs.mkdirSync(outDir,{recursive:true});
 fs.writeFileSync(path.join(outDir,'latest.json'),JSON.stringify(report,null,2)+'\n');
 fs.writeFileSync(path.join(outDir,'review.md'),renderHistoricalReviewMarkdown(report));
 fs.writeFileSync(path.join(outDir,'index.html'),renderHistoricalReviewHTML(report));
 return report;
}
