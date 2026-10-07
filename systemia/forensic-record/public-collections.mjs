import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const clean=(value)=>String(value??'').trim();
const digest=(bytes)=>createHash('sha256').update(bytes).digest('hex');

export const PUBLIC_FORENSIC_DOMAINS=new Set([
  'sources',
  'coverage',
  'archive_meta',
  'page_index',
  'document_sets',
  'media',
]);

function loadIndex(root){
  const file=path.join(root,'index.json');
  if(!fs.existsSync(file)) throw new Error('forensic_public_index_missing');
  const index=JSON.parse(fs.readFileSync(file,'utf8'));
  if(index?.schema!=='evercraft.forensic-record.corpus-index.v1'){
    throw new Error('forensic_public_index_schema_invalid');
  }
  return index;
}

function readVerifiedRecord(root,entry){
  const domain=clean(entry?.domain);
  if(!PUBLIC_FORENSIC_DOMAINS.has(domain)){
    throw new Error('forensic_public_domain_not_allowlisted:'+domain);
  }
  const sha=clean(entry?.active_sha256);
  if(!/^[a-f0-9]{64}$/i.test(sha)) throw new Error('forensic_public_record_digest_invalid');
  const file=path.join(root,'records',domain,sha+'.json');
  if(!fs.existsSync(file)) throw new Error('forensic_public_record_blob_missing');
  const bytes=fs.readFileSync(file);
  if(digest(bytes)!==sha) throw new Error('forensic_public_record_digest_mismatch');
  return JSON.parse(bytes.toString('utf8'));
}

function source(record){
  return {
    title:clean(record.title),
    url:clean(record.url)||null,
    publisher:clean(record.publisher)||null,
    publish_date:clean(record.publish_date)||null,
    doc_type:clean(record.doc_type)||null,
    status:clean(record.status)||null,
    description:clean(record.description)||null,
  };
}

function coverage(record){
  return {
    corpus_id:clean(record.corpus_id),
    label:clean(record.label),
    total_pages:Number(record.total_pages||0),
    pages_reviewed:Number(record.pages_reviewed||0),
    status:clean(record.status)||'unknown',
    reviewed_ranges:Array.isArray(record.reviewed_ranges)
      ? record.reviewed_ranges.map(clean).filter(Boolean)
      : [],
    next_range:clean(record.next_range)||null,
    source_authority:clean(record.source_authority)||null,
    updated_at:clean(record.updated_at)||null,
    notes:clean(record.notes)||null,
  };
}

function archiveMeta(record){
  return {
    total_findings:Number(record.total_findings||0),
    total_source_documents:Number(record.total_source_documents||0),
    last_updated:clean(record.last_updated)||null,
    phase_label:clean(record.phase_label)||null,
  };
}

function pageIndex(record){
  return {
    page_key:clean(record.page_key),
    corpus_id:clean(record.corpus_id),
    part_label:clean(record.part_label),
    page_number:Number.isFinite(Number(record.page_number))?Number(record.page_number):null,
    review_status:clean(record.review_status)||null,
    classification:clean(record.classification)||null,
    bates_reference:clean(record.bates_reference)||null,
    source_url:clean(record.source_url)||null,
    summary:clean(record.summary)||null,
    duplicate_of_finding_numbers:Array.isArray(record.duplicate_of_finding_numbers)
      ? record.duplicate_of_finding_numbers.map(Number).filter(Number.isFinite)
      : [],
    related_finding_numbers:Array.isArray(record.related_finding_numbers)
      ? record.related_finding_numbers.map(Number).filter(Number.isFinite)
      : [],
    media_crosslink_needed:record.media_crosslink_needed===true,
    reviewed_at:clean(record.reviewed_at)||null,
    updated_at:clean(record.updated_at)||null,
  };
}

function documentSet(record){
  return {
    name:clean(record.name),
    source_court:clean(record.source_court)||null,
    case_number:clean(record.case_number)||null,
    total_pages:Number(record.total_pages||0),
    pages_analyzed:Number(record.pages_analyzed||0),
    pages_pending_ocr:Number(record.pages_pending_ocr||0),
    unsealed_date:clean(record.unsealed_date)||null,
    judge:clean(record.judge)||null,
    status:clean(record.status)||null,
    description:clean(record.description)||null,
    date_added:clean(record.date_added)||null,
  };
}

function media(record){
  return {
    media_id:clean(record.media_id),
    title:clean(record.title),
    media_type:clean(record.media_type)||null,
    source_kind:clean(record.source_kind)||null,
    full_source_url:clean(record.full_source_url)||null,
    source_authority:clean(record.source_authority)||null,
    event_date:clean(record.event_date)||null,
    transcript_source:clean(record.transcript_source)||null,
    transcript_verified:record.transcript_verified===true,
    authenticity_status:clean(record.authenticity_status)||null,
    rights_status:clean(record.rights_status)||null,
    sensitive_content:record.sensitive_content===true,
    publication_status:clean(record.publication_status)||null,
    related_finding_numbers:Array.isArray(record.related_finding_numbers)
      ? record.related_finding_numbers.map(Number).filter(Number.isFinite)
      : [],
  };
}

const projections={
  sources:source,
  coverage,
  archive_meta:archiveMeta,
  page_index:pageIndex,
  document_sets:documentSet,
  media,
};

function sortCollections(collections){
  collections.sources.sort((a,b)=>a.title.localeCompare(b.title));
  collections.coverage.sort((a,b)=>a.label.localeCompare(b.label));
  collections.page_index.sort((a,b)=>
    a.part_label.localeCompare(b.part_label)||
    Number(a.page_number||0)-Number(b.page_number||0)
  );
  collections.document_sets.sort((a,b)=>a.name.localeCompare(b.name));
  collections.media.sort((a,b)=>
    clean(a.event_date).localeCompare(clean(b.event_date))||
    a.title.localeCompare(b.title)
  );
}

export function loadPublicForensicCollections({stateDir}={}){
  if(!stateDir) throw new Error('forensic_public_collections_state_dir_required');
  const root=path.resolve(stateDir);
  const index=loadIndex(root);
  const collections=Object.fromEntries([...PUBLIC_FORENSIC_DOMAINS].map(domain=>[domain,[]]));

  for(const entry of Object.values(index.entries||{})){
    const domain=clean(entry?.domain);
    if(!PUBLIC_FORENSIC_DOMAINS.has(domain)) continue;
    const raw=readVerifiedRecord(root,entry);

    // Media is public only after an explicit editorial approval/publish state.
    if(domain==='media'&&!['approved','published'].includes(clean(raw.publication_status))){
      continue;
    }

    collections[domain].push(projections[domain](raw));
  }

  sortCollections(collections);

  return Object.freeze({
    schema:'evercraft.forensic-record.public-collections.v1',
    source_index_updated_at:clean(index.updated_at)||null,
    counts:Object.freeze({
      sources:collections.sources.length,
      coverage:collections.coverage.length,
      archive_meta:collections.archive_meta.length,
      page_index:collections.page_index.length,
      document_sets:collections.document_sets.length,
      media:collections.media.length,
    }),
    collections:Object.freeze(collections),
  });
}
