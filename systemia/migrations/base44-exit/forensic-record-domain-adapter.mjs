const clean=(v)=>String(v??'').trim();
const clone=(v)=>structuredClone(v||{});

export const FORENSIC_RECORD_LEGACY_ENTITIES=new Set([
  'ForensicFinding',
  'Source',
  'CorpusCoverage',
  'ForensicCandidateFinding',
  'FindingRejection',
  'LegacyFindingAudit',
  'ArchiveMeta',
  'Chunk',
  'CorpusPageIndex',
  'DocumentSet',
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

function rejection(row,index){
  const out=clone(row);
  return {
    record_key:lineage('FindingRejection',row,index).record_key,
    batch_id:clean(out.batch_id)||null,
    source_document:canonicalSourceLabel(out.source_document),
    source_document_legacy_label:clean(out.source_document),
    source_subdocument:clean(out.source_subdocument)||null,
    page_reference:recoveredPageReference(out)||null,
    candidate_title:clean(out.candidate_title)||null,
    candidate_quote:clean(out.candidate_quote)||null,
    candidate_truth_label:clean(out.candidate_truth_label)||null,
    reason_code:clean(out.reason_code),
    reason_detail:clean(out.reason_detail)||null,
    content_hash:clean(out.content_hash)||null,
    rejected_by:clean(out.rejected_by)||null,
    rejected_at:clean(out.rejected_at),
    evidence_refs:Array.isArray(out.evidence_refs)?out.evidence_refs.map(clean).filter(Boolean):[],
    migration_lineage:lineage('FindingRejection',row,index)
  };
}

function audit(row,index){
  const out=clone(row);
  return {
    record_key:lineage('LegacyFindingAudit',row,index).record_key,
    audit_id:clean(out.audit_id),
    finding_id:clean(out.finding_id),
    finding_number:Number.isFinite(Number(out.finding_number))?Number(out.finding_number):null,
    source_document:canonicalSourceLabel(out.source_document),
    source_document_legacy_label:clean(out.source_document),
    audit_status:clean(out.audit_status),
    recovered_page_reference:clean(out.recovered_page_reference)||null,
    duplicate_of_finding_id:clean(out.duplicate_of_finding_id)||null,
    risk_codes:Array.isArray(out.risk_codes)?out.risk_codes.map(clean).filter(Boolean):[],
    title_support_status:clean(out.title_support_status)||'unknown',
    recommended_action:clean(out.recommended_action),
    reviewed_at:clean(out.reviewed_at)||null,
    evidence_refs:Array.isArray(out.evidence_refs)?out.evidence_refs.map(clean).filter(Boolean):[],
    notes:clean(out.notes)||null,
    migration_lineage:lineage('LegacyFindingAudit',row,index)
  };
}

function archiveMeta(row,index){
  const out=clone(row);
  return {
    record_key:lineage('ArchiveMeta',row,index).record_key,
    total_findings:Number(out.total_findings||0),
    total_source_documents:Number(out.total_source_documents||0),
    last_updated:clean(out.last_updated)||null,
    phase_label:clean(out.phase_label),
    migration_lineage:lineage('ArchiveMeta',row,index)
  };
}

function chunk(row,index){
  const out=clone(row);
  return {
    record_key:lineage('Chunk',row,index).record_key,
    source_id:clean(out.source_id),
    content:clean(out.content),
    summary:clean(out.summary)||null,
    page_start:Number.isFinite(Number(out.page_start))?Number(out.page_start):null,
    page_end:Number.isFinite(Number(out.page_end))?Number(out.page_end):null,
    chunk_index:Number.isFinite(Number(out.chunk_index))?Number(out.chunk_index):null,
    sensitivity_level:clean(out.sensitivity_level)||'low',
    sensitivity_reason:clean(out.sensitivity_reason)||null,
    entities_extracted:Array.isArray(out.entities_extracted)?structuredClone(out.entities_extracted):[],
    event_date:clean(out.event_date)||null,
    event_date_uncertain:out.event_date_uncertain===true,
    event_summary:clean(out.event_summary)||null,
    mention_types:Array.isArray(out.mention_types)?out.mention_types.map(clean).filter(Boolean):[],
    migration_lineage:lineage('Chunk',row,index)
  };
}

function pageIndex(row,index){
  const out=clone(row);
  return {
    record_key:lineage('CorpusPageIndex',row,index).record_key,
    page_key:clean(out.page_key),
    corpus_id:clean(out.corpus_id),
    part_label:clean(out.part_label),
    page_number:Number.isFinite(Number(out.page_number))?Number(out.page_number):null,
    review_status:clean(out.review_status),
    classification:clean(out.classification),
    bates_reference:clean(out.bates_reference)||null,
    source_url:clean(out.source_url)||null,
    summary:clean(out.summary)||null,
    duplicate_of_finding_numbers:Array.isArray(out.duplicate_of_finding_numbers)?out.duplicate_of_finding_numbers.map(Number).filter(Number.isFinite):[],
    related_finding_numbers:Array.isArray(out.related_finding_numbers)?out.related_finding_numbers.map(Number).filter(Number.isFinite):[],
    related_candidate_ids:Array.isArray(out.related_candidate_ids)?out.related_candidate_ids.map(clean).filter(Boolean):[],
    media_crosslink_needed:out.media_crosslink_needed===true,
    blocker:clean(out.blocker)||null,
    reviewed_at:clean(out.reviewed_at)||null,
    updated_at:clean(out.updated_at)||null,
    migration_lineage:lineage('CorpusPageIndex',row,index)
  };
}

function documentSet(row,index){
  const out=clone(row);
  return {
    record_key:lineage('DocumentSet',row,index).record_key,
    name:clean(out.name),
    source_court:clean(out.source_court)||null,
    case_number:clean(out.case_number)||null,
    total_pages:Number(out.total_pages||0),
    pages_analyzed:Number(out.pages_analyzed||0),
    pages_pending_ocr:Number(out.pages_pending_ocr||0),
    unsealed_date:clean(out.unsealed_date)||null,
    judge:clean(out.judge)||null,
    status:clean(out.status)||'not_started',
    description:clean(out.description)||null,
    date_added:clean(out.date_added)||null,
    migration_lineage:lineage('DocumentSet',row,index)
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
  const transforms={
    ForensicFinding:finding,
    Source:source,
    CorpusCoverage:coverage,
    ForensicCandidateFinding:candidate,
    FindingRejection:rejection,
    LegacyFindingAudit:audit,
    ArchiveMeta:archiveMeta,
    Chunk:chunk,
    CorpusPageIndex:pageIndex,
    DocumentSet:documentSet,
    MediaSource:media
  };
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
    if(entityName==='Chunk'&&(!record.source_id||!record.content)){
      exclusions.push({id:clean(row.id)||null,reason:'chunk_missing_source_or_content'});
      return;
    }
    if(entityName==='LegacyFindingAudit'&&(!record.audit_id||!record.finding_id)){
      exclusions.push({id:clean(row.id)||null,reason:'audit_identity_missing'});
      return;
    }
    if(entityName==='FindingRejection'&&(!record.reason_code||!record.rejected_at)){
      exclusions.push({id:clean(row.id)||null,reason:'rejection_required_fields_missing'});
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
