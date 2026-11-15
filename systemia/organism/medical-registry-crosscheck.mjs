// Medical Discovery independent registration crosscheck.
// ClinicalTrials.gov registry metadata is an external source, NOT independently verified efficacy.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const REGISTRY_API='https://clinicaltrials.gov/api/v2/studies/';
const hash=(v)=>'sha256:'+createHash('sha256').update(JSON.stringify(v)).digest('hex');
const text=(v,n=500)=>String(v??'').replace(/\s+/g,' ').trim().slice(0,n);
const html=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const isNct=(v)=>/^NCT\d{8}$/.test(String(v??''));
const cleanList=(v,max=15)=>Array.isArray(v)?v.slice(0,max).map(x=>text(x,140)).filter(Boolean):[];

function findCitedTrials(paper) {
  // Accept registration IDs that appeared in verified original PubMed EFetch fields.
  // Never search by a similar title and call that an exact registry match.
  const ids=Array.isArray(paper?.registry_ids)?paper.registry_ids:[];
  return [...new Set(ids.filter(isNct))].slice(0,6);
}

export function normalizeClinicalTrialsStudy(record, expectedId) {
  const protocol=record?.protocolSection;
  const identification=protocol?.identificationModule;
  const id=identification?.nctId;
  if(!isNct(expectedId)||id!==expectedId)return null;
  const status=protocol?.statusModule||{};
  const design=protocol?.designModule||{};
  const conditions=protocol?.conditionsModule||{};
  const sponsor=protocol?.sponsorCollaboratorsModule?.leadSponsor;
  const results=record?.hasResults===true;
  return {
    nct_id:expectedId,
    registry_url:'https://clinicaltrials.gov/study/'+expectedId,
    brief_title:text(identification?.briefTitle,350)||null,
    overall_status:text(status.overallStatus,80)||null,
    last_posted_update:status.studyFirstPostDateStruct?.date
      ? text(status.studyFirstPostDateStruct.date,30) : null,
    last_update_posted:status.lastUpdatePostDateStruct?.date
      ? text(status.lastUpdatePostDateStruct.date,30):null,
    study_type:text(design.studyType,60)||null,
    phases:cleanList(design.phases,8),
    conditions:cleanList(conditions.conditions,12),
    lead_sponsor:text(sponsor?.name,160)||null,
    registry_results_posted:results,
    metadata_identity:'NCT_identifier_matches_registry_record',
    clinical_conclusion:'none; registry linkage does not verify paper results or treatment benefit'
  };
}

async function getStudy(id,fetcher) {
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),9000);
  try {
    const resp=await fetcher(REGISTRY_API+id,{signal:controller.signal,headers:{
      accept:'application/json','user-agent':'Evercraft-Medical-Discovery/1.0 public-registry-audit'
    }});
    if(resp?.status===404)return{status:'registration_not_found',reason:'registry_404'};
    if(!resp?.ok)return{status:'registry_source_unavailable',reason:'http_'+String(resp?.status??'unknown')};
    const raw=await resp.text();
    if(!raw||raw.length>700000)return{status:'registry_source_unavailable',reason:'invalid_size'};
    let data;
    try{data=JSON.parse(raw);}catch{return{status:'registry_source_unavailable',reason:'unparseable_json'};}
    const normalized=normalizeClinicalTrialsStudy(data,id);
    if(!normalized)return{status:'registry_identity_mismatch',reason:'returned_NCT_identifier_mismatch'};
    return{status:'registry_identifier_confirmed',reason:null,record:normalized};
  }catch(error) {
    return{status:'registry_source_unavailable',reason:text(error?.message||error,120)};
  }finally{clearTimeout(timer);}
}

export async function crosscheckClinicalRegistrations({
  abstracts,review,fetcher=globalThis.fetch,now=new Date(),maxRegistrations=3
}={}) {
  const verifiedInput=Boolean(abstracts?.receipt_hash && review?.input_receipts?.abstracts===abstracts.receipt_hash &&
    review?.source_status==='source_quoted_unreviewed' &&
    ['abstracts_observed_unreviewed','partial_abstract_coverage'].includes(abstracts?.status));
  const ids=new Map(),papers=Array.isArray(abstracts?.papers)?abstracts.papers:[];
  if(verifiedInput) for(const paper of papers) {
    if(!/^\d{1,12}$/.test(String(paper?.pmid??'')))continue;
    for(const id of findCitedTrials(paper)) {
      if(!ids.has(id))ids.set(id,new Set());
      ids.get(id).add(String(paper.pmid));
    }
  }
  const bounded=[...ids.entries()].slice(0,Math.max(1,Math.min(5,Math.floor(Number(maxRegistrations)||3))));
  const checks=[];
  for(const [nctId,pmids] of bounded) {
    const attempt=typeof fetcher==='function'?await getStudy(nctId,fetcher):
      {status:'registry_source_unavailable',reason:'fetcher_unavailable'};
    checks.push({
      nct_id:nctId,source_pubmed_ids:[...pmids],
      registry_url:'https://clinicaltrials.gov/study/'+nctId,
      check_status:attempt.status,source_hold:attempt.reason||null,
      record:attempt.record||null,
      outcome_verification:'not_performed',
      paper_registry_linkage_review:'not_independently_confirmed'
    });
  }
  const missing=[...ids.keys()].slice(bounded.length);
  const body={
    schema:'evercraft.medical.registry-crosscheck.v1',checked_at:now.toISOString(),
    external_source:REGISTRY_API,source_status:verifiedInput?'source_bound':'held_upstream_receipt_or_status',
    input_receipts:{abstracts:abstracts?.receipt_hash||null,review:review?.receipt_hash||null},
    registration_ids_observed:verifiedInput?ids.size:0,
    lookup_limit:Math.max(1,Math.min(5,Math.floor(Number(maxRegistrations)||3))),
    registrations_not_checked_due_to_limit:missing,
    checks,
    counts:{
      lookup_attempts:checks.length,
      confirmed_identifiers:checks.filter(x=>x.check_status==='registry_identifier_confirmed').length,
      registry_not_found:checks.filter(x=>x.check_status==='registration_not_found').length,
      holds:checks.filter(x=>x.check_status==='registry_source_unavailable' || x.check_status==='registry_identity_mismatch').length,
      registry_results_posted:checks.filter(x=>x.record?.registry_results_posted===true).length,
      verified_outcome_claims:0
    },
    scientific_boundaries:[
      'Only explicit NCT identifiers from the original PubMed abstract or ClinicalTrials.gov DataBank are checked.',
      'Matching a registration identifier does not establish that the article faithfully reports the registered trial.',
      'Registry results posted means a result record exists, not that the results prove efficacy, safety or causality.',
      'No listed NCT ID means no explicit registration was found in the sampled EFetch fields; unregistered research is not implied.',
      'A source outage, HTTP 404 or identity mismatch is not proof that an article is false or fraudulent.',
      'Full-text appraisal, actual registered outcomes, corrections, risk of bias and independent review are still required.'
    ],
    editorial_disposition:'held_with_reason',
    publication_hold:'Registry metadata verification cannot approve any clinical claims or Journal/Clip publication.',
    privacy:'public_metadata_only; no_patient_records'
  };
  return {...body,receipt_hash:hash(body)};
}

export function renderRegistryMarkdown(r) {
  const lines=['# Evercraft Medical Discovery | Independent Registry Crosscheck','',
    '**Registry:** ClinicalTrials.gov','**Source status:** '+r.source_status,
    '**Explicit NCT references:** '+r.registration_ids_observed,
    '**Exact identifiers confirmed:** '+r.counts.confirmed_identifiers,
    '**Confirmed medical outcomes:** 0',
    '**Journal / Clip:** HELD','',
    '## ClinicalTrials.gov lookup receipts'];
  if(!r.checks.length) lines.push('No explicit NCT identifier qualified for registry lookup in this source sample.');
  for(const check of r.checks) {
    lines.push('','### '+check.nct_id+' | '+check.check_status,
      'Registry URL: '+check.registry_url,'PubMed PMIDs naming this ID: '+check.source_pubmed_ids.join(', '),
      'Study title: '+(check.record?.brief_title||'Not available'),
      'Registry recruitment/status: '+(check.record?.overall_status||'Not available'),
      'Registry results posted: '+(check.record?String(check.record.registry_results_posted):'Unknown'),
      'Registry source issue: '+(check.source_hold||'None recorded'),
      'Independent outcome verification: NOT PERFORMED');
  }
  lines.push('','## Evidence boundaries',...r.scientific_boundaries.map(s=>'- '+s),
    '','Publication hold: '+r.publication_hold,'');
  return lines.join('\n');
}

export function renderRegistryHTML(r) {
  const css=[
    ':root{font-family:Inter,system-ui,Arial,sans-serif;background:#f4f9ff;color:#12293f}',
    '*{box-sizing:border-box}body{margin:0}.wrap{max-width:1080px;margin:auto;padding:26px 24px 70px}',
    '.brand{font-size:12px;font-weight:900;letter-spacing:.17em;color:#236687}',
    '.hero{margin:28px 0;padding:48px;border-radius:25px;background:linear-gradient(132deg,#062a48,#135a7c);color:white}',
    'h1{font-size:clamp(40px,6vw,68px);letter-spacing:-.055em;line-height:1.06;margin:18px 0}',
    '.lead{font-size:17px;color:#d6effc;line-height:1.65;max-width:800px}',
    '.badge{display:inline-block;border:1px solid #bddce9;color:#e8f6ff;border-radius:18px;font-size:11px;font-weight:800;padding:9px 13px}',
    '.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:17px 0 35px}',
    '.stat,.card,.limits{background:white;border:1px solid #d4e4f0;border-radius:17px;padding:22px;box-shadow:0 5px 20px #1c46730a}',
    '.n{font-size:42px;font-weight:850;letter-spacing:-.07em}.l{font-size:11px;color:#617f98;text-transform:uppercase;font-weight:750}',
    '.cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px}',
    '.k{font-size:11px;color:#267b9d;font-weight:800;letter-spacing:.08em}',
    'h2{font-size:28px;letter-spacing:-.03em;margin-top:35px}h3{font-size:21px;line-height:1.32}',
    'a{color:#165e85;text-decoration:none}a:hover{text-decoration:underline}',
    '.small{color:#47647a;font-size:13px;line-height:1.7}',
    '.hold{color:#855c28;font-size:12px;font-weight:800}',
    '.limits li{margin:8px 0;font-size:13px;color:#345671;line-height:1.65}',
    'footer{color:#5b788d;border-top:1px solid #cbdde9;margin-top:40px;padding-top:18px;font-size:12px;line-height:1.65}',
    '@media(max-width:720px){.wrap{padding:18px 13px}.hero{padding:34px 25px}.cards,.stats{grid-template-columns:1fr}}',
    '@media print{.card,.stat,.limits{box-shadow:none;break-inside:avoid}}'
  ].join('');
  const cards=r.checks.map(c=>'<article class="card"><div class="k">'+html(c.nct_id)+' / '+html(c.check_status)+'</div>'+
    '<h3><a target="_blank" rel="noopener noreferrer" href="'+c.registry_url+'">'+html(c.record?.brief_title||'Open registry record')+'</a></h3>'+
    '<p class="small">PubMed records: '+c.source_pubmed_ids.map(html).join(', ')+
    '<br>Study type: '+html(c.record?.study_type||'Not available')+
    '<br>Status: '+html(c.record?.overall_status||'Not available')+
    '<br>Registry results posted: '+(c.record?String(c.record.registry_results_posted):'unknown')+'</p>'+
    '<p class="hold">Clinical result verification: NOT PERFORMED'+(c.source_hold?' | '+html(c.source_hold):'')+'</p></article>').join('');
  const stat=(n,label)=>'<div class="stat"><div class="n">'+n+'</div><div class="l">'+label+'</div></div>';
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<title>Evercraft | Clinical Registry Evidence</title><style>'+css+'</style></head><body><main class="wrap">'+
    '<div class="brand">EVERCRAFT / MEDICAL DISCOVERY</div><header class="hero">'+
    '<div class="badge">INDEPENDENT SOURCE CHECK · NO CLINICAL CLAIMS APPROVED</div>'+
    '<h1>The paper. The registry.<br>The evidence gap.</h1>'+
    '<p class="lead">For explicitly named clinical trial registrations, compare a PubMed source with the corresponding ClinicalTrials.gov record. This is an external identity crosscheck, not proof of results.</p></header>'+
    '<section class="stats">'+stat(r.registration_ids_observed,'NCT references found')+
    stat(r.counts.confirmed_identifiers,'Registry IDs verified')+
    stat(r.counts.verified_outcome_claims,'Clinical outcomes verified')+'</section>'+
    '<h2>External source check</h2><div class="cards">'+
    (cards||'<p class="small">No explicit NCT identifiers were available in this sample. No registry match is implied.</p>')+
    '</div><section class="limits"><h2>What this cannot prove</h2><ul>'+
    r.scientific_boundaries.map(s=>'<li>'+html(s)+'</li>').join('')+'</ul>'+
    '<p class="hold">Journal and Clip held: '+html(r.publication_hold)+'</p></section>'+
    '<footer>Checked '+html(r.checked_at)+' · PubMed receipt '+html(r.input_receipts.abstracts||'unavailable')+
    ' · Reviewer packet receipt '+html(r.input_receipts.review||'unavailable')+
    '<p>Public research registries only. No patient data, independent efficacy finding or published medical recommendation.</p></footer>'+
    '</main></body></html>';
}

export async function writeRegistryCrosscheck({
  abstracts,review,fetcher=globalThis.fetch,now=new Date(),
  outDir=path.join(process.cwd(),'artifacts/medical-registry-crosscheck')
}={}) {
  const report=await crosscheckClinicalRegistrations({abstracts,review,fetcher,now});
  fs.mkdirSync(outDir,{recursive:true});
  fs.writeFileSync(path.join(outDir,'latest.json'),JSON.stringify(report,null,2)+'\n');
  fs.writeFileSync(path.join(outDir,'review.md'),renderRegistryMarkdown(report));
  fs.writeFileSync(path.join(outDir,'index.html'),renderRegistryHTML(report));
  return report;
}
