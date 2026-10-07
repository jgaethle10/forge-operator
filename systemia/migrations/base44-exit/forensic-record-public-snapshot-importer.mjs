#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { adaptLegacyForensicRecordEntity } from './forensic-record-domain-adapter.mjs';
import { ingestForensicRecords, forensicCorpusHealth } from '../../forensic-record/corpus-store.mjs';

export const PUBLIC_SNAPSHOT_DOMAIN_MAP={
  ForensicFinding:'findings',
  Source:'sources',
  CorpusCoverage:'coverage',
  ArchiveMeta:'archive_meta',
  CorpusPageIndex:'page_index',
  DocumentSet:'document_sets',
  MediaSource:'media',
};

const clean=(v)=>String(v??'').trim();
const stable=(v)=>{
  if(Array.isArray(v)) return v.map(stable);
  if(v&&typeof v==='object') return Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])]));
  return v;
};
const stableJson=(v)=>JSON.stringify(stable(v));
const sha256=(v)=>createHash('sha256').update(
  Buffer.isBuffer(v)?v:Buffer.from(typeof v==='string'?v:stableJson(v))
).digest('hex');

function assertSafeFileName(value){
  const name=clean(value);
  if(!name||name!==path.basename(name)||name.includes('..')) throw new Error('forensic_seed_snapshot_filename_invalid');
  return name;
}
function readJson(file){
  return JSON.parse(fs.readFileSync(file,'utf8'));
}
function manifestBody(manifest){
  const copy=structuredClone(manifest||{});
  delete copy.manifest_sha256;
  return copy;
}
function verifyManifest(snapshotDir){
  const manifestPath=path.join(snapshotDir,'manifest.json');
  if(!fs.existsSync(manifestPath)) throw new Error('forensic_seed_manifest_missing');
  const manifest=readJson(manifestPath);
  if(manifest?.schema!=='evercraft.forensic-record.public-snapshot-manifest.v1'){
    throw new Error('forensic_seed_manifest_schema_invalid');
  }
  const expected=clean(manifest.manifest_sha256);
  if(!/^sha256:[a-f0-9]{64}$/i.test(expected)) throw new Error('forensic_seed_manifest_sha_missing');
  const actual='sha256:'+sha256(stableJson(manifestBody(manifest)));
  if(actual!==expected) throw new Error('forensic_seed_manifest_sha_mismatch');
  if(manifest?.source?.legacy_app_id_persisted!==false) throw new Error('forensic_seed_legacy_app_id_boundary_invalid');
  if(manifest?.source?.source_role!=='migration_only') throw new Error('forensic_seed_source_role_invalid');
  return manifest;
}
function readEntityRows(snapshotDir,entry){
  const entity=clean(entry?.entity);
  if(!PUBLIC_SNAPSHOT_DOMAIN_MAP[entity]) throw new Error('forensic_seed_entity_not_allowlisted:'+entity);
  if(entry?.terminal_exhaustion_verified!==true) throw new Error('forensic_seed_terminal_exhaustion_required:'+entity);
  const fileName=assertSafeFileName(entry.file);
  const file=path.join(snapshotDir,fileName);
  if(!fs.existsSync(file)) throw new Error('forensic_seed_entity_file_missing:'+entity);
  const bytes=fs.readFileSync(file);
  const expectedSha=clean(entry.sha256);
  if(expectedSha!=='sha256:'+sha256(bytes)) throw new Error('forensic_seed_entity_sha_mismatch:'+entity);
  if(Number(entry.byte_count)!==bytes.byteLength) throw new Error('forensic_seed_entity_byte_count_mismatch:'+entity);
  const text=bytes.toString('utf8');
  const lines=text.split('\n').filter(line=>line.length>0);
  if(lines.length!==Number(entry.rows)) throw new Error('forensic_seed_entity_row_count_mismatch:'+entity);
  const rows=lines.map((line,index)=>{
    try{return JSON.parse(line);}
    catch{throw new Error('forensic_seed_entity_json_invalid:'+entity+':'+index);}
  });
  return rows;
}
function ensureEmptyTarget(stateDir){
  if(!fs.existsSync(stateDir)) return;
  const entries=fs.readdirSync(stateDir);
  if(entries.length) throw new Error('forensic_seed_target_not_empty');
}

export function importPublicForensicSnapshot({
  snapshotDir,
  stateDir,
}={}){
  if(!snapshotDir) throw new Error('forensic_seed_snapshot_dir_required');
  if(!stateDir) throw new Error('forensic_seed_state_dir_required');
  const snapshotRoot=path.resolve(snapshotDir);
  const stateRoot=path.resolve(stateDir);
  ensureEmptyTarget(stateRoot);
  fs.mkdirSync(stateRoot,{recursive:true,mode:0o750});

  const manifest=verifyManifest(snapshotRoot);
  const manifestEntities=Array.isArray(manifest.entities)?manifest.entities:[];
  const seen=new Set();
  const entityReceipts=[];
  let sourceRows=0,acceptedRows=0,excludedRows=0,ingestSubmitted=0;

  for(const entry of manifestEntities){
    const entity=clean(entry?.entity);
    if(seen.has(entity)) throw new Error('forensic_seed_duplicate_manifest_entity:'+entity);
    seen.add(entity);
    const domain=PUBLIC_SNAPSHOT_DOMAIN_MAP[entity];
    if(!domain) throw new Error('forensic_seed_entity_not_allowlisted:'+entity);

    const rows=readEntityRows(snapshotRoot,entry);
    const adapted=adaptLegacyForensicRecordEntity({entityName:entity,rows});
    if(Number(adapted.submitted)!==rows.length) throw new Error('forensic_seed_adapter_submitted_mismatch:'+entity);
    if(Number(adapted.accepted)+Number(adapted.excluded)!==rows.length){
      throw new Error('forensic_seed_adapter_accounting_mismatch:'+entity);
    }

    let ingest={submitted:0,inserted:0,updated:0,deduped:0,finding_number_collision_keys:0};
    if(adapted.records.length){
      ingest=ingestForensicRecords({
        stateDir:stateRoot,
        domain,
        records:adapted.records,
        source:{
          name:'Files Companion public migration snapshot',
          evidence_state:'MIGRATED_VERIFIED',
          migration_page_sha256:clean(entry.sha256),
        },
      });
      if(ingest?.ok!==true) throw new Error('forensic_seed_ingest_not_ok:'+entity);
      if(Number(ingest.submitted)!==Number(adapted.accepted)){
        throw new Error('forensic_seed_ingest_submitted_mismatch:'+entity);
      }
      const outcomes=Number(ingest.inserted||0)+Number(ingest.updated||0)+Number(ingest.deduped||0);
      if(outcomes!==Number(ingest.submitted||0)){
        throw new Error('forensic_seed_ingest_outcomes_mismatch:'+entity);
      }
    }

    sourceRows+=rows.length;
    acceptedRows+=Number(adapted.accepted||0);
    excludedRows+=Number(adapted.excluded||0);
    ingestSubmitted+=Number(ingest.submitted||0);
    entityReceipts.push({
      entity,
      domain,
      source_rows:rows.length,
      accepted_rows:Number(adapted.accepted||0),
      excluded_rows:Number(adapted.excluded||0),
      ingest_submitted:Number(ingest.submitted||0),
      inserted:Number(ingest.inserted||0),
      updated:Number(ingest.updated||0),
      deduped:Number(ingest.deduped||0),
      source_sha256:clean(entry.sha256),
      terminal_exhaustion_verified:true,
    });
  }

  for(const required of Object.keys(PUBLIC_SNAPSHOT_DOMAIN_MAP)){
    if(!seen.has(required)) throw new Error('forensic_seed_required_public_entity_missing:'+required);
  }

  const health=forensicCorpusHealth({stateDir:stateRoot});
  const rawShape=manifest.finding_integrity||{};
  if(Number(health.finding_rows)!==Number(rawShape.rows)){
    throw new Error('forensic_seed_finding_rows_mismatch');
  }
  if(Number(health.unique_finding_numbers)!==Number(rawShape.unique_finding_numbers)){
    throw new Error('forensic_seed_unique_finding_numbers_mismatch');
  }
  if(Number(health.duplicate_number_extra_rows)!==Number(rawShape.duplicate_number_extra_rows)){
    throw new Error('forensic_seed_duplicate_shape_mismatch');
  }

  const complete=
    sourceRows===acceptedRows+excludedRows &&
    acceptedRows===ingestSubmitted &&
    health.base44_runtime_required===false &&
    health.destructive_dedupe===false &&
    health.prior_versions_preserved===true;

  if(!complete) throw new Error('forensic_seed_reconciliation_incomplete');

  const receipt={
    schema:'evercraft.forensic-record.owned-seed-receipt.v1',
    ok:true,
    complete:true,
    source_manifest_sha256:manifest.manifest_sha256,
    counts:{
      source_rows:sourceRows,
      accepted_rows:acceptedRows,
      excluded_rows:excludedRows,
      ingest_submitted:ingestSubmitted,
      entities:entityReceipts.length,
    },
    entities:entityReceipts,
    corpus_health:health,
    protected_entities_imported:false,
    legacy_app_id_persisted:false,
    base44_runtime_required:false,
    destructive_dedupe:false,
    prior_versions_preserved:true,
    public_cutover_authorized:false,
    legacy_retirement_authorized:false,
    generated_at:new Date().toISOString(),
  };
  fs.writeFileSync(path.join(stateRoot,'seed-receipt.json'),JSON.stringify(receipt,null,2)+'\n',{mode:0o600});
  return receipt;
}

async function main(){
  const args=process.argv.slice(2);
  const value=(name,fallback='')=>{const i=args.indexOf(name);return i>=0?args[i+1]||fallback:fallback;};
  const snapshotDir=value('--snapshot');
  const stateDir=value('--state');
  const receipt=importPublicForensicSnapshot({snapshotDir,stateDir});
  console.log(JSON.stringify({
    ok:true,
    schema:receipt.schema,
    complete:receipt.complete,
    finding_rows:receipt.corpus_health.finding_rows,
    unique_finding_numbers:receipt.corpus_health.unique_finding_numbers,
    duplicate_number_extra_rows:receipt.corpus_health.duplicate_number_extra_rows,
    missing_page_reference_after_normalization:receipt.corpus_health.missing_page_reference,
    missing_source_url:receipt.corpus_health.missing_source_url,
    source_manifest_sha256:receipt.source_manifest_sha256,
    public_cutover_authorized:false,
  },null,2));
}

if(import.meta.url===new URL('file://'+process.argv[1]).href){
  main().catch(error=>{console.error(error);process.exitCode=1;});
}
