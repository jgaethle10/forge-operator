// Evercraft Medical Discovery: source-quoted candidate review packets.
// No source excerpt, study-design tag or model output constitutes independent scientific appraisal.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const hash = (v) => 'sha256:' + createHash('sha256').update(JSON.stringify(v)).digest('hex');
const clean = (v, cap=800) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0,cap);
const h = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
}[c]));
const pmid = (v) => /^\d{1,12}$/.test(String(v ?? '')) ? String(v) : null;
const DOI = /^10\.\d{4,9}\/\S{1,160}$/i;
const SECTION_TYPES = [
  [/^(background|objective|objectives|importance|purpose|introduction)$/i,'context'],
  [/^(method|methods|design|setting|participants|intervention|interventions|measurements)$/i,'methods'],
  [/^(result|results|findings)$/i,'results_reported_by_source'],
  [/^(conclusion|conclusions|interpretation)$/i,'conclusions_reported_by_source']
];
const classifySection = (s) => SECTION_TYPES.find(([re]) => re.test(s))?.[1] || 'unclassified_abstract_section';

function validAbstractPaper(p) {
  if (!pmid(p?.pmid)) return false;
  if (p.abstract_status !== 'present' || !Array.isArray(p.abstract_sections)) return false;
  return p.abstract_sections.some(x => clean(x?.text).length>0);
}

export function buildMedicalReviewPacket(abstractReport, triageReport, { now=new Date(), maxCandidates=8 }={}) {
  const stamp=now.toISOString();
  const sourceOk = ['abstracts_observed_unreviewed','partial_abstract_coverage'].includes(abstractReport?.status);
  const triageOk = triageReport?.source_status === 'observed_unreviewed';
  const linked = Boolean(abstractReport?.receipt_hash &&
    triageReport?.upstream_abstract_receipt === abstractReport.receipt_hash);
  const intakeHold = !sourceOk ? 'abstract_source_held' : !triageOk ? 'triage_source_held'
    : !linked ? 'source_receipt_mismatch' : null;
  const paperById=new Map();
  if (!intakeHold && Array.isArray(abstractReport.papers)) {
    for (const paper of abstractReport.papers.slice(0,25)) {
      const id=pmid(paper?.pmid);
      if (id && !paperById.has(id)) paperById.set(id,paper);
    }
  }
  const evidence=[];
  const candidates=[];
  const queue=Array.isArray(triageReport?.queue)?triageReport.queue:[];
  const seen=new Set();
  const cap=Math.max(1,Math.min(12,Math.floor(Number(maxCandidates)||8)));
  if(!intakeHold) for(const entry of queue) {
    const id=pmid(entry?.pmid);
    if(!id || seen.has(id))continue;
    seen.add(id);
    if(candidates.length>=cap)break;
    const paper=paperById.get(id);
    const signals=Array.isArray(paper?.correction_signals)?paper.correction_signals.map(x=>clean(x,100)):[];
    const abstractPresent=validAbstractPaper(paper);
    const correction=Boolean(paper?.needs_correction_review ||
      entry?.review_state==='correction_signal_verification_hold');
    const reasons=[];
    if(!paper) reasons.push('source_article_missing');
    if(!abstractPresent) reasons.push('abstract_unavailable_or_empty');
    if(correction) reasons.push('correction_signal_needs_original_record_review');
    if(!entry?.evidence_digest) reasons.push('complete_evidence_fingerprint_missing');
    // This is a reviewed-source *queue*, not verified effectiveness evidence.
    reasons.push('full_text_methods_and_outcomes_not_independently_appraised');
    reasons.push('second_source_or_registry_crosscheck_not_completed');
    reasons.push('editorial_review_and_publication_permit_absent');
    const rows=[];
    if(abstractPresent) for(const [i,section] of paper.abstract_sections.slice(0,24).entries()) {
      const excerpt=clean(section?.text,700);
      if(!excerpt)continue;
      const label=clean(section?.label,80)||'Abstract';
      const row={
        evidence_id:'PMID-'+id+'-A'+String(i+1).padStart(2,'0'),
        pmid:id, source_url:'https://pubmed.ncbi.nlm.nih.gov/'+id+'/',
        section_label:label, section_kind:classifySection(label),
        source_reported_excerpt:excerpt, evidence_scope:'author_abstract_only_unverified',
        independently_confirmed:false
      };
      evidence.push(row);
      rows.push(row.evidence_id);
    }
    candidates.push({
      pmid:id, title:clean(paper?.title||entry?.title||'Record unavailable',350),
      source_url:'https://pubmed.ncbi.nlm.nih.gov/'+id+'/',
      doi:DOI.test(String(paper?.doi||''))?paper.doi:null,
      metadata_study_design_hint:clean(paper?.study_design_hint||entry?.study_design_hint||'not_classified',100),
      provenance:{
        abstract_receipt:abstractReport.receipt_hash,
        triage_receipt:triageReport.receipt_hash||null,
        prior_evidence_digest:entry?.evidence_digest||null,
        triage_delta:clean(entry?.delta||'unknown',100)
      },
      pico:{
        population:null, intervention_or_exposure:null, comparator:null, outcomes:null,
        status:'not_independently_extracted_or_verified'
      },
      citation_rows:rows,
      source_correction_signals:signals,
      clinical_claims_verified:0, independent_appraisal:'not_performed',
      review_state:'held_with_reason', hold_reasons:reasons
    });
  }
  const body={
    schema:'evercraft.medical.review-packet.v1',generated_at:stamp,
    source_status:intakeHold?'source_hold':'source_quoted_unreviewed',
    intake_hold:intakeHold,
    input_receipts:{
      abstracts:abstractReport?.receipt_hash||null,
      triage:triageReport?.receipt_hash||null
    },
    counts:{
      candidate_records:candidates.length,
      source_excerpt_rows:evidence.length,
      candidates_with_abstracts:candidates.filter(x=>x.citation_rows.length>0).length,
      correction_review_needed:candidates.filter(x=>x.source_correction_signals.length>0 ||
        x.hold_reasons.includes('correction_signal_needs_original_record_review')).length,
      independently_verified_clinical_claims:0,
      approved_for_publication:0
    },
    candidates,evidence_matrix:evidence,
    editorial:{
      draft_state:'evidence_review_outline_only',
      suggested_sections:[
        'What researchers investigated (verified only after full-text appraisal)',
        'Study design and limitations',
        'What the available evidence does and does not establish',
        'What independent studies or registered trials say',
        'What remains uncertain'
      ],
      journal_route:'held_with_reason',clip_route:'held_with_reason',
      publication_hold:'No external scientific appraisal, correction crosscheck, clinical verification, or authorized editorial publish receipt.'
    },
    controls:[
      'All excerpts are source-reported text from PubMed abstracts, not independently validated findings.',
      'PICO fields remain explicitly unset until audited extraction and review; no inferred efficacy values.',
      'Correction/retraction indicators are provisional flags; absence is not proof of a clean publication record.',
      'Publication remains held, including social distribution, regardless of successful workflow execution.'
    ],
    privacy:'public_literature_only; no patient_records'
  };
  return {...body,receipt_hash:hash(body)};
}

export function renderMedicalReviewMarkdown(r) {
  const lines=[
    '# Evercraft | Biomedical Evidence Review Packets','',
    '**Status:** '+r.source_status,
    '**Generated:** '+r.generated_at,
    '**Evidence receipts:** '+(r.input_receipts.abstracts||'unavailable')+' / '+(r.input_receipts.triage||'unavailable'),
    '**Candidates:** '+r.counts.candidate_records,
    '**Source-reported excerpt rows:** '+r.counts.source_excerpt_rows,
    '**Independently confirmed clinical claims:** 0',
    '**Journal and Evercraft Clip:** HELD','',
    '## Independent-review queue'
  ];
  for(const c of r.candidates) {
    lines.push('','### '+c.title.replace(/[#\r\n]/g,' ')+' | PMID '+c.pmid,
      'Source: '+c.source_url,
      'Study design metadata: '+c.metadata_study_design_hint,
      'PICO: not extracted / not verified',
      'Holds: '+c.hold_reasons.join('; '));
    for(const id of c.citation_rows) {
      const row=r.evidence_matrix.find(x=>x.evidence_id===id);
      if(row)lines.push('- '+id+' ['+row.section_label+']: '+row.source_reported_excerpt);
    }
  }
  lines.push('','## Editorial disposition',r.editorial.publication_hold,'',
    '## Source-bound interpretation rules',...r.controls.map(x=>'- '+x),'');
  return lines.join('\n');
}

export function renderMedicalReviewHTML(r) {
  const style=[
    ':root{background:#071323;color:#ecf7ff;color-scheme:dark;font-family:Inter,system-ui,Arial,sans-serif}',
    '*{box-sizing:border-box}body{margin:0}.wrap{max-width:1130px;margin:auto;padding:24px 22px 80px}',
    '.brand{font-weight:850;font-size:12px;letter-spacing:.19em;color:#a0eaff}',
    '.hero{background:radial-gradient(circle at 90% 0,#215e76,transparent 45%),linear-gradient(130deg,#17314a,#091a2b);border:1px solid #28536f;border-radius:28px;padding:52px;margin:28px 0}',
    'h1{font-size:clamp(42px,6vw,78px);letter-spacing:-.06em;line-height:1.04;margin:16px 0}',
    '.eyebrow{font-size:11px;letter-spacing:.17em;color:#7ee7ff;font-weight:800}',
    '.lede{color:#c1d5e5;font-size:17px;line-height:1.6;max-width:760px}',
    '.hold{display:inline-block;color:#ffd6a3;border:1px solid #aa8d68;border-radius:22px;padding:10px 14px;font-size:12px;font-weight:750}',
    '.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:13px;margin:20px 0 47px}',
    '.stat,.paper,.box{background:#0d2239;border:1px solid #274860;border-radius:18px;padding:22px}',
    '.number{font-size:41px;font-weight:850;letter-spacing:-.05em}.label{color:#abc5d8;font-size:11px;text-transform:uppercase;line-height:1.5}',
    '.papers{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}',
    '.paper h3{font-size:21px;line-height:1.35;letter-spacing:-.02em}',
    'a{color:inherit;text-decoration:none}a:hover{color:#83edff}',
    '.tag{color:#8be6ff;font-size:10px;font-weight:850;letter-spacing:.11em}',
    '.text{font-size:13px;color:#c5d8e8;line-height:1.7}',
    '.quote{border-top:1px solid #26435d;padding-top:14px;margin-top:15px}',
    '.quote small{font-size:10px;letter-spacing:.1em;color:#8fe1fc;font-weight:800}',
    '.warn{color:#ffd1a3;font-size:12px;line-height:1.7}',
    'h2{font-size:29px;letter-spacing:-.03em}.box{margin-top:37px}.box li{line-height:1.7;color:#adc8dc;margin:10px 0;font-size:13px}',
    'footer{border-top:1px solid #28516c;color:#8ca9bd;font-size:12px;line-height:1.8;padding-top:20px;margin-top:42px}',
    '@media(max-width:760px){.wrap{padding:18px 13px}.hero{padding:34px 24px}.stats{grid-template-columns:repeat(2,1fr)}.papers{grid-template-columns:1fr}}',
    '@media print{:root{background:white;color:#111;color-scheme:light}.hero,.paper,.box,.stat{background:#f0f5f8;color:#183044}.text,.lede,.box li{color:#344d60}.paper{break-inside:avoid}}'
  ].join('');
  const cards=r.candidates.map(c=> {
    const quotes=c.citation_rows.map(id=>{
      const row=r.evidence_matrix.find(x=>x.evidence_id===id);
      return row?'<div class="quote"><small>'+h(id+' / '+row.section_label)+'</small><p class="text">'+h(row.source_reported_excerpt)+'</p></div>':'';
    }).join('');
    return '<article class="paper"><div class="tag">PMID '+c.pmid+' · ABSTRACT ONLY</div>'+
      '<h3><a href="'+c.source_url+'" target="_blank" rel="noopener noreferrer">'+h(c.title)+'</a></h3>'+
      '<p class="text">Metadata study-design hint: '+h(c.metadata_study_design_hint)+'. PICO: not independently extracted.</p>'+
      quotes+'<p class="warn">Review holds: '+h(c.hold_reasons.join('; '))+'</p></article>';
  }).join('');
  const stat=(number,label)=>'<div class="stat"><div class="number">'+number+'</div><div class="label">'+label+'</div></div>';
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"/>'+
    '<meta name="viewport" content="width=device-width,initial-scale=1"/>'+
    '<title>Evercraft | Medical Research Evidence Review</title><style>'+style+'</style></head><body><main class="wrap">'+
    '<div class="brand">EVERCRAFT / MEDICAL RESEARCH</div>'+
    '<div class="hero"><div class="eyebrow">SCIENTIFIC REVIEW LAB / EVIDENCE PREPARATION</div>'+
    '<h1>Every claim deserves<br/>its evidence.</h1>'+
    '<p class="lede">A source-linked reading packet for scientific scrutiny. PubMed abstracts are quoted with provenance, not promoted as established treatment results.</p>'+
    '<div class="hold">INDEPENDENT SCIENCE REVIEW REQUIRED · PUBLICATION HELD</div></div>'+
    '<div class="stats">'+stat(r.counts.candidate_records,'Candidate records')+
    stat(r.counts.source_excerpt_rows,'Source excerpt rows')+
    stat(r.counts.correction_review_needed,'Correction checks needed')+
    stat(r.counts.approved_for_publication,'Approved public stories')+'</div>'+
    '<h2>Citation-bound evidence matrix</h2><div class="papers">'+
    (cards||'<p class="text">No eligible source-linked packets. Source intake held: '+h(r.intake_hold||'none')+'</p>')+
    '</div><div class="box"><h2>The scientific firewall</h2><ul>'+
    r.controls.map(x=>'<li>'+h(x)+'</li>').join('')+
    '</ul><p class="warn">Journal and Clip hold: '+h(r.editorial.publication_hold)+'</p></div>'+
    '<footer>Evidence receipts: '+h(r.input_receipts.abstracts||'unavailable')+' / '+
    h(r.input_receipts.triage||'unavailable')+' · Generated '+h(r.generated_at)+
    '<p>No patient records, clinical recommendations, approved breakthroughs or verified public publishing.</p></footer>'+
    '</main></body></html>';
}

export function writeMedicalReviewPacket({
  abstractReport,triageReport,now=new Date(),
  outDir=path.join(process.cwd(),'artifacts/medical-review-packets')
}={}) {
  const result=buildMedicalReviewPacket(abstractReport,triageReport,{now});
  fs.mkdirSync(outDir,{recursive:true});
  fs.writeFileSync(path.join(outDir,'latest.json'),JSON.stringify(result,null,2)+'\n');
  fs.writeFileSync(path.join(outDir,'index.html'),renderMedicalReviewHTML(result));
  fs.writeFileSync(path.join(outDir,'review.md'),renderMedicalReviewMarkdown(result));
  return result;
}

if(import.meta.url === 'file://'+process.argv[1]) {
  const root=process.cwd();
  const abstracts=JSON.parse(fs.readFileSync(path.join(root,'artifacts/medical-abstract-evidence/latest.json'),'utf8'));
  const triage=JSON.parse(fs.readFileSync(path.join(root,'artifacts/medical-evidence-triage/latest.json'),'utf8'));
  const result=writeMedicalReviewPacket({abstractReport:abstracts,triageReport:triage});
  console.log(JSON.stringify({status:result.source_status,counts:result.counts,receipt:result.receipt_hash}));
}
