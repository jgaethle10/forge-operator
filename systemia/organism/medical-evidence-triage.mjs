// KAIDANCE Medical Discovery: source-bound longitudinal evidence review queue.
// This module does not perform clinical appraisal or authorize publication.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const sha = (v) => 'sha256:' + createHash('sha256').update(String(v)).digest('hex');
const clean = (v, n = 500) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const html = (v) => String(v ?? '').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pmid = (v) => /^\d{1,12}$/.test(String(v ?? '')) ? String(v) : null;
const validDate = (v) => v && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : null;

function normalize(raw) {
  const id = pmid(raw?.pmid);
  if (!id) return null;
  const sections = Array.isArray(raw?.abstract_sections) ? raw.abstract_sections.slice(0,25)
    .map(x=>({label:clean(x?.label,80),text:clean(x?.text,7500)})).filter(x=>x.text) : [];
  const types = Array.isArray(raw?.publication_types) ?
    raw.publication_types.slice(0,18).map(x=>clean(x,80)) : [];
  const corrections = Array.isArray(raw?.correction_signals) ?
    raw.correction_signals.slice(0,20).map(x=>clean(x,100)).filter(Boolean) : [];
  const present = raw?.abstract_status === 'present' && sections.length > 0;
  const canonical = {
    pmid:id, title:clean(raw?.title,350), doi:clean(raw?.doi,190)||null,
    publication_types:types, study_design_hint:clean(raw?.study_design_hint,100)||'not_classified',
    abstract_sections:sections, corrections, present
  };
  return {
    ...canonical, source_url:'https://pubmed.ncbi.nlm.nih.gov/'+id+'/',
    needs_correction_review:Boolean(raw?.needs_correction_review) ||
      corrections.some(x=>/retract|correct|errat|concern/i.test(x)),
    complete_digest:present ? sha(JSON.stringify(canonical)) : null,
    excerpt:sections.map(x=>x.text).join(' ').slice(0,520)
  };
}

function readPrevious(previous) {
  if(!previous) return {status:'first_ledger_cycle',rows:new Map()};
  if(previous.schema!=='evercraft.medical.evidence-triage-state.v1' || !Array.isArray(previous.records))
    return {status:'invalid_previous_ledger',rows:new Map()};
  const rows=new Map();
  for(const raw of previous.records.slice(0,500)) {
    const id=pmid(raw?.pmid);
    if(!id || rows.has(id)) continue;
    rows.set(id,{
      pmid:id,title:clean(raw?.title,350),doi:clean(raw?.doi,190)||null,
      first_seen:validDate(raw?.first_seen),last_seen:validDate(raw?.last_seen),
      last_complete_digest:/^sha256:[a-f0-9]{64}$/.test(raw?.last_complete_digest||'')?raw.last_complete_digest:null,
      complete_observations:Math.max(0,Math.min(1000000,Number(raw?.complete_observations)||0)),
      correction_last_seen:Boolean(raw?.correction_last_seen)
    });
  }
  return {status:'previous_ledger_loaded',rows};
}

export function buildMedicalEvidenceTriage(abstractReport,{previous=null,now=new Date()}={}) {
  const at=now.toISOString(),prior=readPrevious(previous);
  const status=clean(abstractReport?.status,100);
  const sourceReady=['abstracts_observed_unreviewed','partial_abstract_coverage'].includes(status)
    && Array.isArray(abstractReport?.papers);
  const ledger=new Map(prior.rows),queue=[],seen=new Set();
  if(sourceReady) for(const raw of abstractReport.papers.slice(0,25)) {
    const p=normalize(raw);
    if(!p || seen.has(p.pmid))continue;
    seen.add(p.pmid);
    const old=ledger.get(p.pmid);
    const delta=!p.complete_digest?'abstract_missing':
      !old?'first_seen_in_local_ledger':
      !old.last_complete_digest?'first_complete_abstract':
      old.last_complete_digest!==p.complete_digest?'abstract_or_metadata_changed':'unchanged';
    const review_state=p.needs_correction_review?'correction_signal_verification_hold':
      !p.complete_digest?'abstract_unavailable_hold':'independent_scientific_appraisal_required';
    const priority=p.needs_correction_review?1:!p.complete_digest?2:
      delta==='abstract_or_metadata_changed'?3:delta==='first_seen_in_local_ledger'?4:5;
    queue.push({
      pmid:p.pmid,title:p.title,source_url:p.source_url,doi:p.doi,
      study_design_hint:p.study_design_hint,publication_types:p.publication_types,
      excerpt:p.excerpt,correction_signals:p.corrections,
      evidence_digest:p.complete_digest,delta,review_state,priority
    });
    ledger.set(p.pmid,{
      pmid:p.pmid,title:p.title,doi:p.doi,
      first_seen:old?.first_seen||at,last_seen:at,
      last_complete_digest:p.complete_digest||old?.last_complete_digest||null,
      complete_observations:(old?.complete_observations||0)+(p.complete_digest?1:0),
      correction_last_seen:p.needs_correction_review
    });
  }
  queue.sort((a,b)=>a.priority-b.priority||a.pmid.localeCompare(b.pmid));
  const rows=[...ledger.values()].sort((a,b)=>a.pmid.localeCompare(b.pmid)).slice(-500);
  const counts={
    observed_now:queue.length,ledger_records:rows.length,
    first_seen:queue.filter(x=>x.delta==='first_seen_in_local_ledger').length,
    changed:queue.filter(x=>x.delta==='abstract_or_metadata_changed').length,
    unchanged:queue.filter(x=>x.delta==='unchanged').length,
    missing_abstract:queue.filter(x=>x.delta==='abstract_missing').length,
    correction_review:queue.filter(x=>x.review_state==='correction_signal_verification_hold').length
  };
  const body={
    schema:'evercraft.medical.evidence-triage.v1',observed_at:at,
    source_status:sourceReady?'observed_unreviewed':'source_hold',
    upstream_abstract_receipt:abstractReport?.receipt_hash||null,
    history_status:prior.status,counts,queue,
    interpretation_rules:[
      'First seen means new to this bounded local ledger, not new to science.',
      'Changed means source abstract or publication metadata differ from the last complete observation. It is not a verified clinical change.',
      'Partial/missing sources are held and earlier complete evidence is retained. Unobserved records are not assumed removed or retracted.',
      'Correction signals are provisional metadata flags requiring original-article verification. No signal does not prove none exists.',
      'Study-design labels and abstracts do not independently establish study quality, treatment effectiveness, safety or a cure.'
    ],
    publication_disposition:'held_with_reason',
    publication_hold:sourceReady
      ? 'Independent appraisal, full-text and editorial verification pending; no Journal or Clip publishing authorized.'
      : 'Upstream evidence unavailable; no new review candidates admitted or publishing authorized.',
    privacy:'public_published_research_only; no patient records'
  };
  const report={...body,receipt_hash:sha(JSON.stringify(body))};
  const state={
    schema:'evercraft.medical.evidence-triage-state.v1',
    observed_at:at,upstream_abstract_receipt:body.upstream_abstract_receipt,
    source_status:body.source_status,last_report_receipt:report.receipt_hash,records:rows
  };
  return {report,state};
}

export function renderMedicalTriageMarkdown(r) {
  const lines=['# Evercraft Medical Research | Evidence Change Desk','',
    '**Observed:** '+r.observed_at,'**Source:** '+r.source_status,
    '**Historical state:** '+r.history_status,
    '**First seen in ledger:** '+r.counts.first_seen,
    '**Source changes:** '+r.counts.changed,
    '**Correction flags to verify:** '+r.counts.correction_review,
    '**Publication:** HELD: '+r.publication_hold,'',
    '## Source-linked independent-review queue'];
  for(const p of r.queue) {
    lines.push('','### '+p.title.replace(/[\r\n#]/g,' ')+' | PMID '+p.pmid,
      'Source: '+p.source_url,'Delta: '+p.delta,'Review: '+p.review_state,
      'Study-design metadata: '+p.study_design_hint,
      'DOI: '+(p.doi||'not supplied'),
      'Unreviewed abstract excerpt: '+(p.excerpt||'not available'));
  }
  lines.push('','## Interpretation boundaries',...r.interpretation_rules.map(x=>'- '+x),'',
    'No clinical finding, public-health guidance, verified breakthrough or Journal/Clip publication is asserted.','');
  return lines.join('\n');
}

export function renderMedicalTriageHtml(r) {
  const css=[
    ':root{background:#071321;color:#eef7ff;color-scheme:dark;font-family:Inter,system-ui,Arial,sans-serif}',
    '*{box-sizing:border-box}body{margin:0}.wrap{max-width:1140px;margin:auto;padding:28px 24px 80px}',
    '.brand{color:#83e2ff;font-size:12px;font-weight:900;letter-spacing:.2em}',
    '.hero{margin:30px 0 18px;padding:52px;border-radius:27px;border:1px solid #2a5574;background:radial-gradient(circle at 95% 0%,#1d5c77,transparent 45%),linear-gradient(130deg,#143047,#081522)}',
    '.eyebrow{font-size:12px;color:#77dcff;font-weight:900;letter-spacing:.16em}',
    'h1{font-size:clamp(40px,7vw,80px);line-height:1.03;letter-spacing:-.06em;max-width:800px;margin:18px 0}',
    '.intro{max-width:740px;font-size:17px;line-height:1.65;color:#bbd1e2}',
    '.hold{display:inline-block;border:1px solid #b28e63;border-radius:24px;color:#fbd7a5;padding:10px 14px;font-size:11px;font-weight:800}',
    '.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:16px 0 44px}',
    '.metric,.card,.panel{background:#102338;border:1px solid #2d4862;border-radius:18px;padding:22px}',
    '.metric strong{font-size:43px;font-weight:900;letter-spacing:-.06em;display:block}',
    '.metric span{color:#a1bed4;font-size:11px;text-transform:uppercase;line-height:1.6}',
    'h2{font-size:30px;letter-spacing:-.04em}h3{font-size:21px;line-height:1.4;letter-spacing:-.025em}',
    '.muted,.card p{color:#aac5d7;font-size:13px;line-height:1.75}',
    '.cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:15px}',
    '.top{display:flex;justify-content:space-between;gap:15px;color:#8de4ff;font-size:11px;font-weight:800;letter-spacing:.06em}',
    '.chip{display:inline-block;font-size:11px;padding:7px 10px;border-radius:22px;background:#173f55;color:#b7e7f6;margin:3px}',
    '.chip.review{background:#514047;color:#f9d8b1}a{color:inherit;text-decoration:none}a:hover{color:#8de4ff}',
    '.panel{margin-top:45px}.panel li{font-size:13px;line-height:1.7;color:#bcd1e0;margin:8px 0}',
    'footer{border-top:1px solid #254157;margin-top:48px;padding-top:23px;color:#90acc1;font-size:12px;line-height:1.7}',
    '@media(max-width:760px){.wrap{padding:18px 13px}.hero{padding:34px 22px}.metrics{grid-template-columns:repeat(2,1fr)}.cards{grid-template-columns:1fr}}',
    '@media print{:root{background:white;color:#111;color-scheme:light}.hero,.metric,.card,.panel{background:#f1f6fa;color:#183043}.intro,.card p,.muted,.panel li{color:#345166}.card{break-inside:avoid}}'
  ].join('');
  const metric=(n,label)=>'<div class="metric"><strong>'+n+'</strong><span>'+label+'</span></div>';
  const cards=r.queue.map(p=>'<article class="card"><div class="top"><span>PMID '+p.pmid+'</span><span>Review priority '+p.priority+'</span></div>'+
    '<h3><a href="'+p.source_url+'" target="_blank" rel="noopener noreferrer">'+html(p.title)+'</a></h3>'+
    '<span class="chip">'+html(p.delta.replaceAll('_',' '))+'</span><span class="chip review">'+html(p.review_state.replaceAll('_',' '))+'</span>'+
    '<p>'+html(p.excerpt||'Abstract not available in this cycle.')+'</p>'+
    '<p>DOI: '+html(p.doi||'unavailable')+' · Design hint: '+html(p.study_design_hint)+'</p></article>').join('');
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>'+
    '<title>Evercraft Medical Evidence Change Desk</title><style>'+css+'</style></head><body><main class="wrap">'+
    '<div class="brand">EVERCRAFT / RESEARCH INTELLIGENCE</div><section class="hero"><div class="eyebrow">MEDICAL DISCOVERY / LONGITUDINAL EVIDENCE</div>'+
    '<h1>What changed?<br/>What deserves review?</h1><p class="intro">A source-linked scientific reading queue tracking changes to PubMed records across collection cycles. It flags missing abstracts and correction signals without pretending to validate clinical results.</p>'+
    '<div class="hold">JOURNAL + CLIP PUBLICATION HELD</div></section><div class="metrics">'+
    metric(r.counts.first_seen,'First observed in ledger')+metric(r.counts.changed,'Abstract or metadata changes')+
    metric(r.counts.correction_review,'Correction signals')+metric(r.counts.missing_abstract,'Missing abstracts')+'</div>'+
    '<h2>Evidence-review queue</h2><p class="muted">Source: '+html(r.source_status)+' · History: '+html(r.history_status)+' · Priority indicates research verification, not patient risk.</p>'+
    '<div class="cards">'+(cards||'<p class="muted">No source-backed queue records in this cycle.</p>')+'</div>'+
    '<div class="panel"><h2>How to read this</h2><ul>'+r.interpretation_rules.map(s=>'<li>'+html(s)+'</li>').join('')+
    '</ul><p class="muted">Publication hold: '+html(r.publication_hold)+'</p></div>'+
    '<footer>Observed '+html(r.observed_at)+' · evidence receipt '+html(r.upstream_abstract_receipt||'not supplied')+
    '<br/>Public biomedical literature only. No patient data, verified treatment outcomes or authorized scientific publication.</footer></main></body></html>';
}

export function writeMedicalEvidenceTriage({abstractReport,previous=null,now=new Date(),outDir=path.join(process.cwd(),'artifacts/medical-evidence-triage')}={}) {
  const {report,state}=buildMedicalEvidenceTriage(abstractReport,{previous,now});
  fs.mkdirSync(outDir,{recursive:true});
  fs.writeFileSync(path.join(outDir,'latest.json'),JSON.stringify(report,null,2)+'\n');
  fs.writeFileSync(path.join(outDir,'state.json'),JSON.stringify(state,null,2)+'\n');
  fs.writeFileSync(path.join(outDir,'review-queue.md'),renderMedicalTriageMarkdown(report));
  fs.writeFileSync(path.join(outDir,'index.html'),renderMedicalTriageHtml(report));
  return {report,state};
}

if(import.meta.url==='file://'+process.argv[1]){
  const input=process.argv[2]||'artifacts/medical-abstract-evidence/latest.json';
  const out=process.argv[3]||'artifacts/medical-evidence-triage';
  let previous=null;
  try{previous=JSON.parse(fs.readFileSync(path.join(out,'state.json'),'utf8'));}catch{}
  const report=JSON.parse(fs.readFileSync(input,'utf8'));
  const result=writeMedicalEvidenceTriage({abstractReport:report,previous,outDir:out});
  console.log(JSON.stringify({source:result.report.source_status,counts:result.report.counts,receipt:result.report.receipt_hash}));
}
