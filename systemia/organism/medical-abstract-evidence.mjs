// Evercraft Biomedical Evidence Desk v2: bounded public PubMed abstract ingestion.
// Metadata is not a quality appraisal, verified breakthrough, or medical advice.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const PUBMED_EFETCH='https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi';
const hash=(s)=>'sha256:'+createHash('sha256').update(String(s)).digest('hex');
const pmid=(s)=>/^\d{1,12}$/.test(String(s??''))?String(s):null;
const trim=(s,n=8000)=>String(s??'').replace(/\s+/g,' ').trim().slice(0,n);
const escapeHtml=(s)=>String(s??'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const decode=(s)=>String(s||'').replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi,(all,v)=>{
  const dict={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};
  if(v in dict)return dict[v];
  const n=v.toLowerCase().startsWith('#x')?parseInt(v.slice(2),16):parseInt(v.slice(1),10);
  return n>0&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff)?String.fromCodePoint(n):'\ufffd';
});
const xmlText=(s)=>trim(decode(String(s||'').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/<[^>]*>/g,' ')));
const match=(s,re)=>String(s||'').match(re)?.[1]||'';
const list=(s,re)=>[...String(s||'').matchAll(re)].map(x=>xmlText(x[1])).filter(Boolean);
const design=(types)=>{
 const t=types.join(' ').toLowerCase();
 if(/retracted publication|retraction of publication/.test(t))return 'retraction_notice_type';
 if(/meta.analysis|systematic review/.test(t))return 'systematic_review_or_meta_analysis_type';
 if(/randomized controlled trial|controlled clinical trial/.test(t))return 'controlled_trial_type';
 if(/observational study|cohort studies|case.control studies/.test(t))return 'observational_type';
 if(/case reports/.test(t))return 'case_report_type';
 if(/clinical trial/.test(t))return 'clinical_trial_type';
 if(/review/.test(t))return 'review_type';
 return 'study_design_not_classified';
};

export function parsePubmedEfetch(xml, ids) {
 const allowed=new Set(ids.map(pmid).filter(Boolean)),rows=new Map();
 for(const found of String(xml||'').matchAll(/<PubmedArticle(?:\s[^>]*)?>[\s\S]*?<\/PubmedArticle>/g)){
  const raw=found[0],medline=match(raw,/<MedlineCitation\b[^>]*>([\s\S]*?)<\/MedlineCitation>/);
  const id=pmid(xmlText(match(medline,/<PMID\b[^>]*>([\s\S]*?)<\/PMID>/)));
  if(!id||!allowed.has(id)||rows.has(id))continue;
  const article=match(medline,/<Article\b[^>]*>([\s\S]*?)<\/Article>/);
  const abstract=match(article,/<Abstract\b[^>]*>([\s\S]*?)<\/Abstract>/);
  const sections=[...abstract.matchAll(/<AbstractText\b([^>]*)>([\s\S]*?)<\/AbstractText>/g)]
   .slice(0,24).map(m=>({
    label:trim(decode(match(m[1],/\bLabel="([^"]*)"/)||match(m[1],/\bNlmCategory="([^"]*)"/)||'Abstract'),70),
    text:xmlText(m[2]).slice(0,7500)
   })).filter(x=>x.text);
  const types=list(article,/<PublicationType\b[^>]*>([\s\S]*?)<\/PublicationType>/g).slice(0,18);
  const doiMatches=[...raw.matchAll(/<ArticleId\b([^>]*)>([\s\S]*?)<\/ArticleId>/g)]
   .filter(x=>/\bIdType="doi"/i.test(x[1]))
   .map(x=>xmlText(x[2])).filter(x=>/^10\.\d{4,9}\/\S{1,160}$/i.test(x));
  const corrections=[...raw.matchAll(/<CommentsCorrections\b([^>]*)>[\s\S]*?<\/CommentsCorrections>/g)]
   .map(x=>trim(match(x[1],/\bRefType="([^"]*)"/),70)).filter(Boolean).slice(0,20);
  const needsReview=types.some(x=>/retract|erratum|expression of concern|correct/i.test(x))||
    corrections.some(x=>/retract|erratum|expression of concern|correct/i.test(x));
  rows.set(id,{
   pmid:id,title:trim(xmlText(match(article,/<ArticleTitle\b[^>]*>([\s\S]*?)<\/ArticleTitle>/)),350)||'Title unavailable',
   doi:doiMatches[0]||null,publication_types:types,study_design_hint:design(types),
   abstract_status:sections.length?'present':'missing_or_unindexed',abstract_sections:sections,
   correction_signals:corrections,needs_correction_review:needsReview,
   source_url:'https://pubmed.ncbi.nlm.nih.gov/'+id+'/',
   verification:'abstract_metadata_only; article_not_independently_appraised'
  });
 }
 return rows;
}

async function fetchXml(url,fetcher) {
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
 try{
  const response=await fetcher(url,{signal:controller.signal,headers:{'user-agent':'Evercraft-Medical-Discovery/1.0 public-PubMed-research',accept:'application/xml,text/xml'}});
  if(!response?.ok)throw Error('pubmed_http_'+String(response?.status??'unknown'));
  const xml=await response.text();
  if(!xml||xml.length>3_000_000||!xml.includes('<PubmedArticle'))throw Error('empty_or_invalid_pubmed_xml');
  return {ok:true,xml};
 }catch(error){return{ok:false,reason:trim(error?.message||error,180)}}
 finally{clearTimeout(timer)}
}

export async function collectMedicalAbstractEvidence({watch,fetcher=globalThis.fetch,now=new Date(),maxRecords=10}={}){
 const lane=watch?.lanes?.medical_research,eligible=lane?.status==='observed'&&Array.isArray(lane.documents);
 const ids=[],seen=new Set(),cap=Math.min(10,Math.max(1,Number(maxRecords)||10));
 if(eligible)for(const row of lane.documents){
  const id=pmid(row?.pmid);if(id&&!seen.has(id)){seen.add(id);ids.push(id);}
  if(ids.length>=cap)break;
 }
 let sourceHold=eligible?'': 'upstream_pubmed_source_unavailable',parsed=new Map();
 if(!ids.length)sourceHold=sourceHold||'no_sampled_pmids';
 if(ids.length&&typeof fetcher!=='function')sourceHold='fetcher_unavailable';
 else if(ids.length){
  const u=new URL(PUBMED_EFETCH);
  u.searchParams.set('db','pubmed');u.searchParams.set('id',ids.join(','));u.searchParams.set('retmode','xml');
  const response=await fetchXml(u.toString(),fetcher);
  if(response.ok)parsed=parsePubmedEfetch(response.xml,ids);
  else sourceHold=response.reason;
 }
 const papers=ids.map((id)=>parsed.get(id)||{
  pmid:id,title:'EFetch record unavailable',doi:null,publication_types:[],
  study_design_hint:'study_design_not_classified',abstract_status:'missing_or_unindexed',
  abstract_sections:[],correction_signals:[],needs_correction_review:false,
  source_url:'https://pubmed.ncbi.nlm.nih.gov/'+id+'/',
  verification:'no_article_level_evidence'
 });
 const abstracts=papers.filter(x=>x.abstract_status==='present').length;
 const status=sourceHold?'held_source_unavailable':abstracts===ids.length?'abstracts_observed_unreviewed':'partial_abstract_coverage';
 const body={
  schema:'evercraft.medical.abstract-evidence.v1',observed_at:now.toISOString(),
  upstream_receipt:watch?.receipt_hash||null,source:PUBMED_EFETCH,status,
  sampled_records:ids.length,abstracts_retrieved:abstracts,missing_abstracts:ids.length-abstracts,
  correction_review_queue:papers.filter(x=>x.needs_correction_review).map(x=>x.pmid),
  source_hold:sourceHold||null,papers,
  scientific_limitations:[
   'PubMed abstracts and tags are preliminary source evidence; full methods and data were not reviewed.',
   'Publication type is a study-design hint, not proof of study quality, reliability or clinical benefit.',
   'Correction signals require verification. Absence of a flagged correction is not evidence that none exists.',
   'No efficacy, safety, treatment, cure or breakthrough claim is verified by this report.'
  ],
  evidence_review_state:'independent_scientific_appraisal_required',
  publication_disposition:'held_with_reason',
  publication_hold:sourceHold||'No independent scientific or editorial review has been completed.',
  privacy:'public_research_metadata_only; no patient data'
 };
 return {...body,receipt_hash:hash(JSON.stringify(body))};
}

export function renderMedicalAbstractMarkdown(r){
 const lines=['# Evercraft | Medical Abstract Evidence Desk','',
  '**Status:** '+r.status,'**Observed:** '+r.observed_at,
  '**Upstream receipt:** '+(r.upstream_receipt||'unavailable'),
  '**Abstracts:** '+r.abstracts_retrieved+' / '+r.sampled_records,
  '**Clinical findings independently verified:** 0',
  '**Publication:** HELD: '+r.publication_hold,'','## Source-linked abstract queue'];
 for(const p of r.papers){
  lines.push('','### PMID '+p.pmid+' | '+p.title.replace(/[\r\n#]/g,' '),
   'Original source: '+p.source_url,'DOI: '+(p.doi||'not supplied'),
   'Publication types: '+(p.publication_types.join(', ')||'not supplied'),
   'Design hint: '+p.study_design_hint,'Correction review: '+(p.needs_correction_review?'required':'no signal observed'),
   'Abstract: '+p.abstract_status);
  for(const a of p.abstract_sections)lines.push('- '+a.label+': '+a.text);
 }
 lines.push('','## Scientific limitations',...r.scientific_limitations.map(x=>'- '+x),'',
  'Never publish as a clinical breakthrough without source-level independent review.','');
 return lines.join('\n');
}

export function renderMedicalAbstractHTML(r){
 const css=[
  ':root{color-scheme:dark;background:#071321;color:#eef8ff;font-family:Inter,system-ui,sans-serif}',
  '*{box-sizing:border-box}body{margin:0}.wrap{max-width:1100px;margin:auto;padding:30px 24px 70px}',
  '.brand{font-size:12px;letter-spacing:.2em;font-weight:900;color:#8be3ff}',
  '.hero{background:radial-gradient(circle at 90% 5%,#226078,transparent 45%),linear-gradient(125deg,#15324a,#091827);border:1px solid #386078;border-radius:26px;padding:52px;margin:28px 0}',
  'h1{font-size:clamp(40px,6vw,76px);line-height:1.02;letter-spacing:-.06em;max-width:760px;margin:14px 0}',
  '.eyebrow{font-size:12px;color:#7ddbf6;letter-spacing:.15em;font-weight:800;text-transform:uppercase}',
  '.intro{line-height:1.65;color:#c5d8e7;max-width:720px;font-size:17px}',
  '.hold{border:1px solid #d0a778;border-radius:24px;padding:9px 13px;color:#ffdbb5;display:inline-block;font-size:12px;font-weight:800}',
  '.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:45px}',
  '.stat,.card,.limits{border:1px solid #294963;background:#0e2135;border-radius:19px;padding:25px}',
  '.num{font-size:40px;font-weight:900;letter-spacing:-.06em}.label{color:#a4bed3;font-size:12px}',
  '.cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:15px}',
  'h2{font-size:28px;letter-spacing:-.04em}h3{font-size:21px;letter-spacing:-.025em;line-height:1.3;margin:16px 0}',
  '.meta{font-size:11px;text-transform:uppercase;color:#70d8fa;font-weight:750;letter-spacing:.08em}',
  'a{color:inherit;text-decoration:none}a:hover{color:#8be3ff}',
  '.abstract{border-top:1px solid #28435b;margin-top:18px;padding-top:14px;color:#d5e6f2;font-size:14px;line-height:1.7}',
  '.section-label{font-size:11px;color:#86ddfa;text-transform:uppercase;letter-spacing:.1em;font-weight:800}',
  '.warning{color:#ffd3a6;font-size:13px}.minor{color:#95b4cb;font-size:12px;line-height:1.7}',
  '.limits{margin-top:48px;color:#c4d6e5;line-height:1.75}footer{margin-top:48px;color:#789ab5;font-size:12px}',
  '@media(max-width:750px){.wrap{padding:20px 15px}.hero{padding:34px 24px}.cards,.stats{grid-template-columns:1fr}}',
  '@media print{:root{color-scheme:light;background:white;color:#111}.hero,.stat,.card,.limits{background:#f3f7fa;color:#172a3b}.intro,.abstract,.minor{color:#344b5c}.card{break-inside:avoid}}'
 ].join('');
 const cards=r.papers.map(p=>{
  const sections=p.abstract_sections.map(a=>'<div class="abstract"><div class="section-label">'+escapeHtml(a.label)+'</div><p>'+escapeHtml(a.text)+'</p></div>').join('');
  return '<article class="card"><div class="meta">PMID '+p.pmid+' | '+escapeHtml(p.study_design_hint.replaceAll('_',' '))+'</div>'+
   '<h3><a href="'+p.source_url+'" target="_blank" rel="noopener noreferrer">'+escapeHtml(p.title)+'</a></h3>'+
   '<p class="minor">DOI: '+escapeHtml(p.doi||'not supplied')+'</p>'+
   (p.needs_correction_review?'<p class="warning">Correction/retraction signal requires verification.</p>':'')+
   (sections||'<p class="warning">Abstract unavailable. No findings inferred.</p>')+
   '<p class="minor">Unreviewed source metadata, not a clinical conclusion.</p></article>';
 }).join('');
 return '<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>'+
  '<title>Evercraft Medical Discovery | Abstract Evidence</title><style>'+css+'</style></head><body><main class="wrap">'+
  '<div class="brand">EVERCRAFT / MEDICAL DISCOVERY</div><section class="hero">'+
  '<div class="eyebrow">PUBMED ORIGINAL ABSTRACTS / EVIDENCE DESK</div>'+
  '<h1>Behind the headline.<br/>Into the evidence.</h1>'+
  '<p class="intro">Explore abstract sections, study-design indicators, persistent DOI identifiers, and correction review signals. Each item links to PubMed. No independent clinical claims are made.</p>'+
  '<span class="hold">JOURNAL PUBLICATION HELD</span></section>'+
  '<div class="stats"><div class="stat"><div class="num">'+r.sampled_records+'</div><div class="label">Source records sampled</div></div>'+
  '<div class="stat"><div class="num">'+r.abstracts_retrieved+'</div><div class="label">Abstracts available</div></div>'+
  '<div class="stat"><div class="num">'+r.correction_review_queue.length+'</div><div class="label">Correction signals to review</div></div></div>'+
  '<h2>Evidence reading queue</h2><p class="minor">Source state: '+escapeHtml(r.status)+'. Every publication claim requires independent scientific review.</p>'+
  '<section class="cards">'+(cards||'<p class="warning">No source-backed abstract records available.</p>')+'</section>'+
  '<div class="limits"><h2>Scientific firewall</h2><ul>'+r.scientific_limitations.map(x=>'<li>'+escapeHtml(x)+'</li>').join('')+
  '</ul><p>Publication hold: '+escapeHtml(r.publication_hold)+'</p></div>'+
  '<footer>Observed '+escapeHtml(r.observed_at)+' | upstream receipt '+escapeHtml(r.upstream_receipt||'unavailable')+
  '<p>Public biomedical metadata only. No patient records, diagnosis, efficacy findings, or verified Journal publication.</p></footer></main></body></html>';
}

export async function writeMedicalAbstractEvidence({watch,fetcher=globalThis.fetch,now=new Date(),outDir=path.join(process.cwd(),'artifacts/medical-abstract-evidence')}={}){
 const report=await collectMedicalAbstractEvidence({watch,fetcher,now});
 fs.mkdirSync(outDir,{recursive:true});
 fs.writeFileSync(path.join(outDir,'latest.json'),JSON.stringify(report,null,2)+'\n');
 fs.writeFileSync(path.join(outDir,'abstract-review.md'),renderMedicalAbstractMarkdown(report));
 fs.writeFileSync(path.join(outDir,'index.html'),renderMedicalAbstractHTML(report));
 return report;
}

if(import.meta.url==='file://'+process.argv[1]){
 const input=process.argv[2]||'artifacts/science-hazard-watch/latest.json';
 const source=JSON.parse(fs.readFileSync(input,'utf8'));
 const result=await writeMedicalAbstractEvidence({watch:source});
 console.log(JSON.stringify({status:result.status,abstracts:result.abstracts_retrieved,hold:result.source_hold,receipt:result.receipt_hash}));
}
