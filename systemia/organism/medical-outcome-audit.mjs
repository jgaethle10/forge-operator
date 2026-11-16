// Evercraft Medical Discovery v7: protocol-to-publication evidence comparison desk.
// This is deterministic text-level triage, NOT independent clinical appraisal.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const sha=(x)=>'sha256:'+createHash('sha256').update(JSON.stringify(x)).digest('hex');
const safe=(x,max=800)=>String(x??'').replace(/\s+/g,' ').trim().slice(0,max);
const escape=(x)=>String(x??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const isPmid=(x)=>/^\d{1,12}$/.test(String(x??''));
const norm=(x)=>safe(x,4000).toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();

export function compareRegisteredOutcomeText(registered, abstractText, resultHeaders) {
  const measure=safe(registered?.measure,260);
  const phrase=norm(measure);
  const abstractNorm=norm(abstractText);
  const posted=Array.isArray(resultHeaders)?resultHeaders:[];
  // Exact literal title mentions only. A different title can describe the same
  // scientific endpoint, so absence NEVER constitutes evidence of a discrepancy.
  const abstractMention=Boolean(phrase.length>=12 && abstractNorm.includes(phrase));
  const postedTitleMention=Boolean(phrase && posted.some(x=>norm(x.measure)===phrase));
  return {
    measure,
    time_frame:safe(registered?.time_frame,220)||null,
    abstract_literal_title_mention:abstractMention,
    posted_results_literal_title_match:postedTitleMention,
    comparison_disposition:'manual_methodology_and_timepoint_review_required',
    difference_asserted:false
  };
}

export function buildMedicalOutcomeAudit({
 discovery,source,review,registry,now=new Date()
}={}) {
  const observed=now.toISOString();
  const linked=Boolean(discovery?.source_status==='source_indexed_unreviewed' &&
    discovery?.receipt_hash &&
    source?.originating_discovery_receipt===discovery.receipt_hash &&
    source?.receipt_hash && review?.input_receipts?.abstracts===source.receipt_hash &&
    review?.receipt_hash && registry?.input_receipts?.review===review.receipt_hash &&
    registry?.input_receipts?.abstracts===source.receipt_hash &&
    registry?.source_status==='source_bound');
  const paperByPmid=new Map();
  if(linked && Array.isArray(discovery.papers)){
    for(const p of discovery.papers.slice(0,15))if(isPmid(p?.pmid) && !paperByPmid.has(String(p.pmid)))
      paperByPmid.set(String(p.pmid),p);
  }
  const audits=[];
  if(linked && Array.isArray(registry.checks))for(const check of registry.checks.slice(0,5)) {
    if(!/^NCT\d{8}$/.test(String(check?.nct_id??'')))continue;
    const r=check.record;
    const identityOk=check.check_status==='registry_identifier_confirmed' && r?.nct_id===check.nct_id;
    const candidateIds=Array.isArray(check.source_pubmed_ids)?check.source_pubmed_ids:[];
    for(const id of candidateIds.slice(0,8)) {
      const paper=paperByPmid.get(String(id));
      if(!paper || !Array.isArray(paper.registry_ids) || !paper.registry_ids.includes(check.nct_id))continue;
      const reported=Array.isArray(paper.abstract_sections)?paper.abstract_sections
        .filter(x=>/results?|findings?|conclusions?|interpretation/i.test(String(x?.label??'')))
        .slice(0,5).map(x=>({label:safe(x.label,80),excerpt:safe(x.text,650),
          source_url:'https://pubmed.ncbi.nlm.nih.gov/'+id+'/'})).filter(x=>x.excerpt):[];
      const abstractText=reported.map(x=>x.excerpt).join(' ');
      const primary=identityOk && Array.isArray(r.protocol_primary_outcomes)?
        r.protocol_primary_outcomes.slice(0,12):[];
      const secondary=identityOk && Array.isArray(r.protocol_secondary_outcomes)?
        r.protocol_secondary_outcomes.slice(0,12):[];
      const posted=identityOk && Array.isArray(r.posted_result_measure_headings)?
        r.posted_result_measure_headings.slice(0,20):[];
      const comparisons=primary.map(x=>compareRegisteredOutcomeText(x,abstractText,posted));
      const flags=[];
      if(!identityOk)flags.push('official_registry_identity_unconfirmed');
      if(identityOk && r.protocol_outcomes_status==='module_unavailable')flags.push('registry_outcomes_module_not_available');
      if(identityOk && primary.length===0)flags.push('no_primary_outcome_measure_in_current_registry_response');
      if(reported.length===0)flags.push('no_structured_result_or_conclusion_abstract_section');
      if(identityOk && r.registry_results_posted===false)flags.push('no_registry_results_reported_posted');
      if(paper.needs_correction_review || (Array.isArray(paper.correction_signals) && paper.correction_signals.length))
        flags.push('pubmed_correction_signal_requires_verification');
      flags.push('original_protocol_and_amendment_history_not_reviewed');
      flags.push('full_text_methods_and_eligibility_not_reviewed');
      flags.push('publication_registry_outcome_alignment_not_independently_reviewed');
      audits.push({
        nct_id:check.nct_id,pmid:String(id),
        article_title:safe(paper.title,350),
        article_url:'https://pubmed.ncbi.nlm.nih.gov/'+id+'/',
        registry_url:'https://clinicaltrials.gov/study/'+check.nct_id,
        registry_check_status:check.check_status,
        verified_registry_identity:identityOk,
        registry_last_update_posted:identityOk?(r.last_update_posted||null):null,
        protocol_snapshot_not_historical:true,
        registry_results_posted:identityOk?r.registry_results_posted:null,
        registered_primary_outcomes:primary,
        registered_secondary_outcomes:secondary,
        posted_result_headings:posted,
        abstract_reported_excerpts:reported,
        primary_outcome_literal_comparisons:comparisons,
        screening_flags:flags,
        scientific_review_state:'held_pending_independent_full_text_and_protocol_appraisal',
        treatment_effect_claims_verified:0,
        confirmed_discrepancies:0
      });
    }
  }
  const count=(fn)=>audits.filter(fn).length;
  const body={
    schema:'evercraft.medical.protocol-outcome-audit.v1',
    observed_at:observed,
    source_status:linked?'source_linked_unreviewed':'held_input_receipt_or_source_mismatch',
    input_receipts:{
      discovery:discovery?.receipt_hash||null,source:source?.receipt_hash||null,
      reviewer:review?.receipt_hash||null,registry:registry?.receipt_hash||null
    },
    counts:{
      paper_trial_pairs:audits.length,
      official_identifiers_confirmed:new Set(audits.filter(x=>x.verified_registry_identity).map(x=>x.nct_id)).size,
      registered_primary_outcome_rows:audits.reduce((n,x)=>n+x.registered_primary_outcomes.length,0),
      posted_result_headings:audits.reduce((n,x)=>n+x.posted_result_headings.length,0),
      abstract_literal_title_mentions:audits.reduce((n,x)=>n+x.primary_outcome_literal_comparisons.filter(c=>c.abstract_literal_title_mention).length,0),
      papers_with_structured_results_excerpts:count(x=>x.abstract_reported_excerpts.length>0),
      manually_reviewable_pairs:audits.length,
      independently_verified_outcome_claims:0,
      verified_outcome_discrepancies:0,
      approved_for_publication:0
    },
    audits,
    interpretation:[
      'Primary outcome titles and time frames are copied from the current ClinicalTrials.gov protocol section, not from a verified pre-enrollment protocol.',
      'Posted result headings are not independent verification of the trial results or their statistical interpretation.',
      'Literal title matching is a navigation signal only. A missing match NEVER proves outcome switching or contradictory reporting.',
      'The PubMed abstract is author-reported material. Full text, trial amendments, preregistration dates, methods, data, and correction history require independent appraisal.',
      'All scientific, patient-care, efficacy, safety, causal and breakthrough conclusions remain held.'
    ],
    editorial:{journal:'held_with_reason',clip:'held_with_reason',
      hold:'Independent study-design, pre-specification history, full-text outcomes and adversarial scientific review have not occurred.'},
    privacy:'public_literature_and_trial_registry_only; no_patient_data'
  };
  return {...body,receipt_hash:sha(body)};
}

export function renderMedicalOutcomeAuditMarkdown(r) {
 const lines=['# EVERCRAFT | Protocol ↔ Publication Evidence Desk','',
  '**Input provenance:** '+r.input_receipts.discovery+' / '+r.input_receipts.registry,
  '**Source:** '+r.source_status,
  '**Paper-trial pairs:** '+r.counts.paper_trial_pairs,
  '**Registered primary outcome rows:** '+r.counts.registered_primary_outcome_rows,
  '**Verified treatment effects:** 0','**Verified discrepancies:** 0',
  '**Journal / Clip:** HELD','',
  '## Reviewer evidence comparisons'];
 for(const a of r.audits) {
  lines.push('','### '+a.nct_id+' × PMID '+a.pmid+' | '+a.article_title.replace(/[#\r\n]/g,' '),
   'PubMed: '+a.article_url,'Registry: '+a.registry_url,
   'Current registry last update: '+(a.registry_last_update_posted||'not available'),
   'Pre-enrollment protocol verified: NO',
   'Independent clinical outcome review: NOT PERFORMED');
  for(const [i,p] of a.primary_outcome_literal_comparisons.entries()){
   lines.push('- Registered primary outcome '+(i+1)+': '+p.measure,
    '  - Time frame: '+(p.time_frame||'not supplied'),
    '  - Literal title in sampled abstract results: '+String(p.abstract_literal_title_mention),
    '  - Same title in posted registry result headings: '+String(p.posted_results_literal_title_match),
    '  - Conclusion: manual scientific review required; no discrepancy inferred');
  }
  if(!a.primary_outcome_literal_comparisons.length)lines.push('- No source-backed registered primary outcome available in this response');
  lines.push('Review flags: '+a.screening_flags.join('; '));
 }
 lines.push('','## Interpretation boundaries',...r.interpretation.map(x=>'- '+x),
  '','Publication remains held.','');
 return lines.join('\n');
}

export function renderMedicalOutcomeAuditHTML(r) {
 const css=[
 ':root{font-family:Inter,system-ui,Arial,sans-serif;background:#f6f8fa;color:#142535}',
 '*{box-sizing:border-box}body{margin:0}.wrap{max-width:1180px;margin:auto;padding:28px 22px 72px}',
 '.eyebrow{font-size:12px;letter-spacing:.18em;font-weight:800;color:#206985}',
 '.hero{background:linear-gradient(120deg,#081c31,#163e58);color:white;border-radius:28px;padding:50px;margin:24px 0}',
 'h1{font-size:clamp(39px,6vw,72px);letter-spacing:-.056em;line-height:1.04;margin:18px 0}',
 'h2{font-size:28px;letter-spacing:-.03em;margin-top:42px}',
 '.lede{max-width:760px;color:#cbdfef;line-height:1.7;font-size:17px}',
 '.hold{display:inline-block;border:1px solid #deb681;color:#ffe1b6;border-radius:24px;padding:9px 13px;font-size:11px;font-weight:800}',
 '.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:16px 0}',
 '.stat,.card,.notes{border:1px solid #d5e4ec;background:white;border-radius:18px;padding:22px}',
 '.stat strong{font-size:41px;letter-spacing:-.05em;display:block}.stat span{font-size:11px;text-transform:uppercase;color:#52728c;font-weight:700}',
 '.cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}',
 '.card h3{font-size:21px;letter-spacing:-.02em;line-height:1.3}',
 '.source{font-size:11px;letter-spacing:.06em;color:#276a8c;font-weight:800}',
 'a{color:#0c577e;text-decoration:none}a:hover{text-decoration:underline}',
 '.small{font-size:12px;color:#49667d;line-height:1.7}',
 '.outcome{border-top:1px solid #e3eaf0;padding-top:14px;margin-top:14px}',
 '.outcome b{display:block;font-size:14px;line-height:1.5}',
 '.tag{display:inline-block;background:#e6f3fa;border-radius:16px;color:#235870;padding:6px 9px;margin:4px 4px 0 0;font-size:11px}',
 '.flag{color:#7e5323;font-size:12px;line-height:1.65}.notes li{margin:10px 0;font-size:13px;line-height:1.7;color:#36556c}',
 'footer{border-top:1px solid #d0dce8;margin-top:44px;padding-top:20px;color:#628096;font-size:12px;line-height:1.7}',
 '@media(max-width:800px){.wrap{padding:18px 13px}.hero{padding:33px 23px}.cards{grid-template-columns:1fr}.stats{grid-template-columns:repeat(2,1fr)}}',
 '@media print{.stat,.card,.notes{break-inside:avoid}.hero{background:#eef5fa;color:#172a3c}.lede{color:#34566c}}'
 ].join('');
 const stat=(n,label)=>'<div class="stat"><strong>'+n+'</strong><span>'+label+'</span></div>';
 const cards=r.audits.map(a=>'<article class="card"><div class="source">'+escape(a.nct_id)+' · PMID '+escape(a.pmid)+'</div>'+
  '<h3>'+escape(a.article_title)+'</h3>'+
  '<p class="small"><a target="_blank" rel="noopener noreferrer" href="'+a.article_url+'">Original PubMed</a> · '+
  '<a target="_blank" rel="noopener noreferrer" href="'+a.registry_url+'">ClinicalTrials.gov</a></p>'+
  '<p class="small">Registry last updated: '+escape(a.registry_last_update_posted||'unknown')+
  '<br/>Posted results indicated: '+escape(String(a.registry_results_posted??'unknown'))+'</p>'+
  '<h4>Registered primary outcomes</h4>'+
  (a.primary_outcome_literal_comparisons.map(o=>'<div class="outcome"><b>'+escape(o.measure)+'</b>'+
   '<p class="small">Registered time frame: '+escape(o.time_frame||'unspecified')+
   '<br/>Exact title appears in abstract: '+escape(String(o.abstract_literal_title_mention))+
   '<br/>Exact posted result title: '+escape(String(o.posted_results_literal_title_match))+'</p>'+
   '<span class="tag">Independent review pending</span></div>').join('')||
   '<p class="flag">No registered primary outcome surfaced in this response.</p>')+
  '<p class="flag">Review holds: '+escape(a.screening_flags.join('; '))+'</p></article>').join('');
 return '<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>'+
  '<title>Evercraft Medical Discovery | Protocol Audit</title><style>'+css+'</style></head><body><main class="wrap">'+
  '<div class="eyebrow">EVERCRAFT / MEDICAL DISCOVERY / REVIEW DESK</div><header class="hero">'+
  '<div class="eyebrow" style="color:#9aeaff">REGISTERED PROTOCOLS × PUBLISHED ABSTRACTS</div>'+
  '<h1>The outcome<br/>under the microscope.</h1>'+
  '<p class="lede">Compare the trial registry’s current protocol outcomes, posted result headings, and original PubMed abstract excerpts. Matching words do not prove a matching methodology or a treatment effect.</p>'+
  '<span class="hold">NO SCIENTIFIC CLAIMS APPROVED · PUBLICATION HELD</span></header>'+
  '<div class="stats">'+stat(r.counts.paper_trial_pairs,'Source-linked pairs')+
  stat(r.counts.registered_primary_outcome_rows,'Registered primary outcomes')+
  stat(r.counts.abstract_literal_title_mentions,'Literal abstract title mentions')+
  stat(r.counts.independently_verified_outcome_claims,'Verified clinical outcomes')+'</div>'+
  '<h2>Paper-to-protocol review queue</h2><div class="cards">'+
  (cards||'<p class="small">No complete paper-registry pairs verified. The intake remains held or empty.</p>')+
  '</div><section class="notes"><h2>Scientific interpretation firewall</h2><ul>'+
  r.interpretation.map(x=>'<li>'+escape(x)+'</li>').join('')+'</ul>'+
  '<p class="flag">'+escape(r.editorial.hold)+'</p></section>'+
  '<footer>Observed '+escape(r.observed_at)+' · provenance receipt '+escape(r.input_receipts.discovery||'not supplied')+
  '<p>Current registry snapshots cannot prove preregistration history. No patient data or medical advice.</p></footer></main></body></html>';
}

export function writeMedicalOutcomeAudit({discovery,source,review,registry,now=new Date(),
 outDir=path.join(process.cwd(),'artifacts/medical-outcome-audit')}={}) {
 const report=buildMedicalOutcomeAudit({discovery,source,review,registry,now});
 fs.mkdirSync(outDir,{recursive:true});
 fs.writeFileSync(path.join(outDir,'latest.json'),JSON.stringify(report,null,2)+'\n');
 fs.writeFileSync(path.join(outDir,'review.md'),renderMedicalOutcomeAuditMarkdown(report));
 fs.writeFileSync(path.join(outDir,'index.html'),renderMedicalOutcomeAuditHTML(report));
 return report;
}
