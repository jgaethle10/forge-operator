// Evercraft Medical Discovery v6: a bounded, source-indexed registered-trial discovery lane.
// Search provenance: NLM PubMed documents clinicaltrials.gov[si] (Secondary Source ID).
// No publication or medical outcome validation is performed by this module.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { parsePubmedEfetch, PUBMED_EFETCH } from './medical-abstract-evidence.mjs';
import { buildMedicalReviewPacket, renderMedicalReviewMarkdown } from './medical-review-packet.mjs';
import { crosscheckClinicalRegistrations, renderRegistryHTML, renderRegistryMarkdown } from './medical-registry-crosscheck.mjs';

export const PUBMED_SEARCH='https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi';
export const REGISTERED_TRIAL_QUERY='clinicaltrials.gov[si]';
const hash=(v)=>'sha256:'+createHash('sha256').update(JSON.stringify(v)).digest('hex');
const safeId=(v)=>/^\d{1,12}$/.test(String(v??''))?String(v):null;
const clamp=(x,lo,hi,fallback)=>Number.isFinite(Number(x))?
  Math.max(lo,Math.min(hi,Math.floor(Number(x)))):fallback;
const hold=(reason,source)=>({ok:false,reason,source});
const defaultPause=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));
const RESEARCH_POLICY=[
 'This discovery lane uses PubMed Secondary Source ID indexing, not speculative title-matching.',
 'An explicit NCT ID in the PubMed source is a reported association, not an independently appraised connection between study methods and outcomes.',
 'A ClinicalTrials.gov ID match confirms only official registry identifier metadata, not efficacy, safety, treatment success or approval.',
 'Missing or stale source data is a HOLD; no registration, abstract or outcome is invented.',
 'Journal and Evercraft Clip publication stay blocked pending full-text appraisal, independent clinical evidence review and signed editorial authorization.'
];

async function boundedJson(url,fetcher) {
 const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),12000);
 try {
  const response=await fetcher(url,{signal:controller.signal,headers:{
   accept:'application/json','user-agent':'Evercraft-Medical-Discovery/1.0 registered-trial-literature'
  }});
  if(!response?.ok)return hold('http_'+String(response?.status??'unknown'),url);
  const raw=await response.text();
  if(raw.length>450000 || !raw.length)return hold('empty_or_oversized_search',url);
  try{return{ok:true,data:JSON.parse(raw)};}
  catch{return hold('invalid_json',url);}
 }catch(error){return hold(String(error?.message||error).slice(0,120),url);}
 finally{clearTimeout(timer);}
}
async function boundedXml(url,fetcher) {
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
 try {
  const response=await fetcher(url,{signal:controller.signal,headers:{
   accept:'application/xml,text/xml','user-agent':'Evercraft-Medical-Discovery/1.0 registered-trial-literature'
  }});
  if(!response?.ok)return hold('http_'+String(response?.status??'unknown'),url);
  const raw=await response.text();
  if(!raw.length||raw.length>3000000||!raw.includes('<PubmedArticle'))return hold('invalid_or_oversized_efetch',url);
  return {ok:true,xml:raw};
 }catch(error){return hold(String(error?.message||error).slice(0,120),url);}
 finally{clearTimeout(timer);}
}

// NCBI E-utilities enforces request-rate limits. Retry only transient throttling/outages;
// never silently retry malformed JSON or identifiers, and retain explicit source holds.
async function withSourceRetry(request,url,fetcher,pause){
 let result;
 for(let attempt=0;attempt<3;attempt++){
  if(attempt>0)await pause(attempt===1?1500:3200);
  result=await request(url,fetcher);
  if(result.ok || !['http_429','http_503'].includes(result.reason))break;
 }
 return result;
}

export function registeredTrialSearchUrl({days=120,retmax=30}={}) {
 const u=new URL(PUBMED_SEARCH);
 u.searchParams.set('db','pubmed');
 u.searchParams.set('term',REGISTERED_TRIAL_QUERY);
 u.searchParams.set('reldate',String(clamp(days,1,365,120)));
 u.searchParams.set('datetype','edat');
 u.searchParams.set('retmax',String(clamp(retmax,5,40,30)));
 u.searchParams.set('sort','pub+date');
 u.searchParams.set('retmode','json');
 return u.toString();
}

export function eligibleSearchIds(data) {
 const payload=data?.esearchresult;
 if(!payload || !Array.isArray(payload.idlist) || !Number.isFinite(Number(payload.count)))
  return null;
 return {total:Number(payload.count),ids:[...new Set(payload.idlist.map(safeId).filter(Boolean))].slice(0,40)};
}

export async function discoverRegisteredTrialLiterature({
 fetcher=globalThis.fetch,pause=defaultPause,now=new Date(),days=120,retmax=30,maxCandidates=8
}={}) {
 const observed=now.toISOString();
 const url=registeredTrialSearchUrl({days,retmax});
 let sourceHold=null,total=null,ids=[],inspected=0,readable=0;
 const eligible=[];
 if(typeof fetcher!=='function')sourceHold='fetcher_unavailable';
 else {
  // The regular PubMed watch and EFetch run just before this lane. Yield the
  // NLM rate window before initiating another E-utilities call.
  await pause(1200);
  const search=await withSourceRetry(boundedJson,url,fetcher,pause);
  if(!search.ok)sourceHold='pubmed_esearch_'+search.reason;
  else {
   const parsed=eligibleSearchIds(search.data);
   if(!parsed)sourceHold='pubmed_esearch_invalid_response';
   else {total=parsed.total;ids=parsed.ids;}
  }
 }
 if(!sourceHold){
  for(let offset=0;offset<ids.length;offset+=15) {
   if(eligible.length>=clamp(maxCandidates,1,12,8))break;
   const chunk=ids.slice(offset,offset+15);
   const u=new URL(PUBMED_EFETCH);
   u.searchParams.set('db','pubmed');
   u.searchParams.set('id',chunk.join(','));
   u.searchParams.set('retmode','xml');
   await pause(450);
   const result=await withSourceRetry(boundedXml,u.toString(),fetcher,pause);
   if(!result.ok){sourceHold='pubmed_efetch_'+result.reason;break;}
   const parsed=parsePubmedEfetch(result.xml,chunk);
   inspected+=chunk.length;
   for(const id of chunk){
    const paper=parsed.get(id);
    if(!paper)continue;
    if(paper.abstract_status==='present')readable++;
    if(Array.isArray(paper.registry_ids) && paper.registry_ids.length>0)eligible.push(paper);
    if(eligible.length>=clamp(maxCandidates,1,12,8))break;
   }
  }
 }
 const selected=eligible.slice(0,clamp(maxCandidates,1,12,8));
 // On any failed source batch, drop the incomplete cohort rather than implying exhaustive search.
 const papers=sourceHold?[]:selected;
 const body={
  schema:'evercraft.medical.registered-trial-discovery.v1',
  observed_at:observed,query_field:'PubMed Secondary Source ID [si]',
  query:REGISTERED_TRIAL_QUERY,search_url:url,lookback_days:clamp(days,1,365,120),
  source_status:sourceHold?'held_source_unavailable':'source_indexed_unreviewed',
  source_hold:sourceHold,
  pubmed_search_total:total,
  pubmed_ids_sampled:ids.length,
  fetched_records:inspected,
  readable_abstracts_inspected:readable,
  explicitly_registered_papers:papers.length,
  papers,
  source_limitations:RESEARCH_POLICY,
  journal_and_clip_publication:'held_with_reason'
 };
 return {...body,receipt_hash:hash(body)};
}

export function buildRegisteredTrialReview(discovery,{now=new Date()}={}) {
 const eligible=discovery?.source_status==='source_indexed_unreviewed';
 const paperList=eligible && Array.isArray(discovery?.papers)?discovery.papers:[];
 const source={
  schema:'evercraft.medical.registered-trial-review-source.v1',
  status:eligible?'abstracts_observed_unreviewed':'held_source_unavailable',
  observed_at:now.toISOString(),
  papers:paperList,
  originating_discovery_receipt:discovery?.receipt_hash||null
 };
 source.receipt_hash=hash(source);
 // This explicitly IS NOT the longitudinal triage queue. There is no "new to science" or
 // "first seen" claim, and no outcome assertion.
 const queue={
  source_status:eligible?'observed_unreviewed':'source_hold',
  upstream_abstract_receipt:source.receipt_hash,
  queue:paperList.map(p=>({
   pmid:p.pmid,review_state:'independent_scientific_appraisal_required',
   delta:'registry_indexed_discovery_not_longitudinal_triage',
   evidence_digest:hash({pmid:p.pmid,doi:p.doi,abstract_sections:p.abstract_sections})
  }))
 };
 queue.receipt_hash=hash(queue);
 const review=buildMedicalReviewPacket(source,queue,{now,maxCandidates:8});
 return {source,review};
}

export async function runRegisteredTrialLane({
 fetcher=globalThis.fetch,pause=defaultPause,now=new Date(),days=120,retmax=30,maxCandidates=8,
 outDir=path.join(process.cwd(),'artifacts/medical-registered-trials')
}={}) {
 const discovery=await discoverRegisteredTrialLiterature({fetcher,pause,now,days,retmax,maxCandidates});
 const {source,review}=buildRegisteredTrialReview(discovery,{now});
 const registry=await crosscheckClinicalRegistrations({
  abstracts:source,review,fetcher,now,maxRegistrations:3
 });
 const body={
  schema:'evercraft.medical.registered-trial-lane.v1',
  observed_at:now.toISOString(),discovery,
  review_receipt:review.receipt_hash,registry_receipt:registry.receipt_hash,
  input_receipts:{source:source.receipt_hash,discovery:discovery.receipt_hash},
  reviewed_full_text:0,
  independently_verified_outcomes:0,
  official_nct_ids_confirmed:registry.counts.confirmed_identifiers,
  publication_disposition:'held_with_reason',
  publication_hold:'Source-linked trial registry metadata is not independent outcome verification.'
 };
 const report={...body,receipt_hash:hash(body)};
 fs.mkdirSync(outDir,{recursive:true});
 fs.writeFileSync(path.join(outDir,'latest.json'),JSON.stringify(report,null,2)+'\n');
 fs.writeFileSync(path.join(outDir,'review.json'),JSON.stringify(review,null,2)+'\n');
 fs.writeFileSync(path.join(outDir,'registry.json'),JSON.stringify(registry,null,2)+'\n');
 fs.writeFileSync(path.join(outDir,'review.md'),renderMedicalReviewMarkdown(review));
 fs.writeFileSync(path.join(outDir,'registry.md'),renderRegistryMarkdown(registry));
 fs.writeFileSync(path.join(outDir,'index.html'),renderRegistryHTML(registry));
 return report;
}
