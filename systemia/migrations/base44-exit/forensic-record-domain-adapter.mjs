const clean=(v)=>String(v??'').trim();
const clone=(v)=>structuredClone(v||{});

export const FORENSIC_RECORD_LEGACY_ENTITIES=new Set([
  'ForensicFinding',
  'Source',
  'CorpusCoverage',
  'ForensicCandidateFinding',
  'MediaSource'
]);

export function canonicalSourceLabel(value){
  return clean(value)
    .replace(/,\s*(?:page|p\.)\s*\d+(?:\s*[-–]\s*\d+)?\s*$/i,'')
    .trim();
}

export function recoveredPageReference(row={}){
  const explicit=clean(row.page_reference);
  if(explicit)return explicit;
  const source=clean(row.source_document);
  const match=source.match(/(?:page|p\.)\s+(\d+(?:\s*[-–]\s*\d+)?)/i);
  return match?`page ${match[1].replace(/\s+/g,'')}`:'';
}

function lineage(entity,row,index){
  return {
    schema:'evercraft.forensic-record.legacy-lineage.v1',
    source_platform:'base44',
    source_entity:entity,
    source_record_id:clean(row?.id)||null,
    record_key:`legacy:${entity}:${clean(row?.id)||String(index)}`
  };
}

function finding(row,index){
  const out=clone(row);
  return {
    record_key:lineage('ForensicFinding',row,index).record_key,
    finding_number:Number.isFinite(Number(out.finding_number))?Number(out.finding_number):null,
    title:clean(out.title),
    source_document:canonicalSourceLabel(out.source_document),
    source_document_legacy_label:clean(out.source_document),
    page_reference:recoveredPageReference(out)||null,
    source_url:clean(out.source_url)||null,
    truth_label:clean(out.truth_label)||null,
    quote:clean(out.quote)||null,
    significance:clean(out.significance)||null,
    category:clean(out.category)||null,
    evidence_boundary:'A source-linked record is evidence of what the source contains. Presence, association, allegation, testimony and adjudicated fact must remain distinct.',
    migration_lineage:lineage('ForensicFinding',row,index)
  };
}

function source(row,index){
  const out=clone(row);
  return {
    record_key:lineage('Source',row,index).record_key,
    title:clean(out.title),
    url:clean(out.url)||null,
    publisher:clean(out.publisher)||null,
    publish_date:clean(out.publish_date)||null,
    doc_type:clean(out.doc_type)||null,
    file_hash:clean(out.file_hash)||null,
    status:clean(out.status)||null,
    description:clean(out.description)||null,
    migration_lineage:lineage('Source',row,index)
  };
}

function coverage(row,index){
  const out=clone(row);
  return {
    record_key:lineage('CorpusCoverage',row,index).record_key,
    corpus_id:clean(out.corpus_id),
    label:clean(out.label),
    total_pages:Number(out.total_pages||0),
    pages_reviewed:Number(out.pages_reviewed||0),
    status:clean(out.status)||'unknown',
    reviewed_ranges:Array.isArray(out.reviewed_ranges)?out.reviewed_ranges.map(clean).filter(Boolean):[],
    next_range:clean(out.next_range)||null,
    source_authority:clean(out.source_authority)||null,
    updated_at:clean(out.updated_at)||null,
    notes:clean(out.notes)||null,
    migration_lineage:lineage('CorpusCoverage',row,index)
  };
}

function candidate(row,index){
  const out=clone(row);
  return {
    record_key:lineage('ForensicCandidateFinding',row,index).record_key,
    candidate_id:clean(out.candidate_id),
    batch_id:clean(out.batch_id),
    corpus_id:clean(out.corpus_id),
    title:clean(out.title),
    source_document:canonicalSourceLabel(out.source_document),
    source_document_legacy_label:clean(out.source_document),
    page_reference:recoveredPageReference(out)||null,
    source_url:clean(out.source_url)||null,
    support:clean(out.support)||null,
    provenance_type:clean(out.provenance_type)||null,
    recommended_truth_label:clean(out.recommended_truth_label)||null,
    significance:clean(out.significance)||null,
    category:clean(out.category)||null,
    quality_status:clean(out.quality_status)||'staged',
    risk_notes:clean(out.risk_notes)||null,
    evidence_refs:Array.isArray(out.evidence_refs)?out.evidence_refs.map(clean).filter(Boolean):[],
    created_at:clean(out.created_at)||null,
    migration_lineage:lineage('ForensicCandidateFinding',row,index)
  };
}

function media(row,index){
  const out=clone(row);
  return {
    record_key:lineage('MediaSource',row,index).record_key,
    media_id:clean(out.media_id),
    title:clean(out.title),
    media_type:clean(out.media_type)||null,
    source_kind:clean(out.source_kind)||null,
    full_source_url:clean(out.full_source_url)||null,
    source_authority:clean(out.source_authority)||null,
    event_date:clean(out.event_date)||null,
    transcript_source:clean(out.transcript_source)||'unknown',
    transcript_verified:out.transcript_verified===true,
    authenticity_status:clean(out.authenticity_status)||'unverified',
    rights_status:clean(out.rights_status)||'unknown',
    sensitive_content:out.sensitive_content===true,
    publication_status:clean(out.publication_status)||'staged',
    related_finding_numbers:Array.isArray(out.related_finding_numbers)?out.related_finding_numbers.map(Number).filter(Number.isFinite):[],
    migration_lineage:lineage('MediaSource',row,index)
  };
}

export function adaptLegacyForensicRecordEntity({entityName,rows=[]}={}){
  if(!FORENSIC_RECORD_LEGACY_ENTITIES.has(entityName))throw new Error('unsupported_forensic_record_legacy_entity:'+clean(entityName));
  if(!Array.isArray(rows))throw new Error('rows_must_be_array');
  const transforms={ForensicFinding:finding,Source:source,CorpusCoverage:coverage,ForensicCandidateFinding:candidate,MediaSource:media};
  const records=[];
  const exclusions=[];
  rows.forEach((row,index)=>{
    if(!row||typeof row!=='object'){
      exclusions.push({index,reason:'invalid_row'});
      return;
    }
    const record=transforms[entityName](row,index);
    if(entityName==='ForensicFinding'&&!record.title){
      exclusions.push({id:clean(row.id)||null,reason:'missing_title'});
      return;
    }
    records.push(record);
  });
  return {
    schema:'evercraft.forensic-record.legacy-domain-adapter.v1',
    source_entity:entityName,
    submitted:rows.length,
    accepted:records.length,
    excluded:exclusions.length,
    records,
    exclusions,
    semantics:'One-shot migration adapter only. Base44 is extraction/compatibility source, never runtime authority. Missing stays missing; evidence labels and provenance are preserved.'
  };
}
