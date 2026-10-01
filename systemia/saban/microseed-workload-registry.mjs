import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';

const stable=value=>{
  if(Array.isArray(value)) return value.map(stable);
  if(value&&typeof value==='object'){
    return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));
  }
  return value;
};
const shaHex=value=>createHash('sha256').update(
  value instanceof Uint8Array||Buffer.isBuffer(value)?value:Buffer.from(String(value))
).digest('hex');
const sha=value=>'sha256:'+shaHex(
  typeof value==='string'?value:JSON.stringify(stable(value))
);
const bytes=value=>Buffer.byteLength(JSON.stringify(value??null));

const REQUIRED_RIVET_DOMAINS=Object.freeze([
  'geocoding','charging_inventory','traffic','traffic_temporal',
  'utility_service_area','utility_tariff','incentives','parcel_planning',
  'local_ev_stock','observed_sessions','freight','dwell_context',
  'deep_market_evidence','provenance',
]);

function canonicalBytes(value){
  return Buffer.from(JSON.stringify(stable(value)));
}
function contentHash(payload){
  const raw=payload?.bytes_base64
    ? Buffer.from(String(payload.bytes_base64),'base64')
    : canonicalBytes(payload?.value??payload??null);
  return {
    ok:true,
    algorithm:'sha256',
    digest:'sha256:'+shaHex(raw),
    byte_count:raw.byteLength,
  };
}
function telemetryNormalizer(payload){
  const source=payload?.telemetry&&typeof payload.telemetry==='object'?payload.telemetry:payload;
  const normalized=stable(source??{});
  return {ok:true,normalized,normalized_hash:sha(normalized)};
}
function chunkTransform(payload){
  const text=String(payload?.text??'');
  const start=Math.max(0,Math.floor(Number(payload?.start||0)));
  const end=Math.min(text.length,Math.max(start,Math.floor(Number(payload?.end??text.length))));
  const chunk=text.slice(start,end);
  return {ok:true,start,end,chunk,chunk_hash:sha(chunk)};
}
function jsonCanonicalize(payload){
  const value=payload?.value??payload??null;
  const canonical=stable(value);
  const raw=canonicalBytes(canonical);
  return {
    ok:true,
    canonical,
    canonical_sha256:'sha256:'+shaHex(raw),
    byte_count:raw.byteLength,
  };
}
function rivetSourceCoverageAudit(payload){
  const snapshot=payload?.snapshot??payload;
  const manifest=snapshot?.source_coverage_manifest;
  const profile=String(snapshot?.response_profile||'');
  const domains=manifest?.domains&&typeof manifest.domains==='object'?manifest.domains:{};
  const missing=REQUIRED_RIVET_DOMAINS.filter(key=>
    !domains[key]||!String(domains[key].state||'').trim()
  );
  const extras=Object.keys(domains).filter(key=>!REQUIRED_RIVET_DOMAINS.includes(key)).sort();
  const explicit=REQUIRED_RIVET_DOMAINS.map(key=>({
    domain:key,
    state:String(domains[key]?.state||'').trim()||null,
    record_count:Number.isFinite(Number(domains[key]?.record_count))
      ? Number(domains[key].record_count)
      : null,
    source_status:String(domains[key]?.source_status||'').trim()||null,
  }));
  const validProfile=profile==='rivet_report_snapshot_v1';
  const validSchema=manifest?.schema==='evercraft.rivet.source-coverage.v1';
  return {
    ok:validProfile&&validSchema&&missing.length===0,
    response_profile_valid:validProfile,
    coverage_schema_valid:validSchema,
    required_domain_count:REQUIRED_RIVET_DOMAINS.length,
    explicit_domain_count:explicit.filter(x=>x.state).length,
    missing_domains:missing,
    extra_domains:extras,
    domains:explicit,
    audit_hash:sha({profile,manifest_schema:manifest?.schema||null,explicit,missing,extras}),
  };
}
function alievDomainRecordDigest(payload){
  const domain=String(payload?.domain||'').trim();
  const records=Array.isArray(payload?.records)?payload.records:[];
  if(!domain) throw new Error('aliev_domain_digest_domain_required');
  const rows=records.map((record,index)=>{
    const key=String(
      record?.record_key??record?.external_id??record?.aggregate_key??
      record?.profile_key??record?.snapshot_key??record?.evidence_key??
      record?.id??('row-'+index)
    );
    return {record_key:key,digest:sha(stable(record))};
  }).sort((a,b)=>a.record_key.localeCompare(b.record_key));
  return {
    ok:true,
    domain,
    record_count:rows.length,
    records:rows,
    domain_digest:sha({domain,rows}),
  };
}
function observedSessionSanity(payload){
  const rows=Array.isArray(payload?.records)?payload.records:[];
  const checks=rows.map((row,index)=>{
    const sessions=row?.charging_sessions_count;
    const numeric=sessions==null?null:Number(sessions);
    const observedState=String(row?.measurement_state??row?.evidence_state??'').toLowerCase();
    const issues=[];
    if(sessions==null) issues.push('sessions_missing_not_zero');
    else if(!Number.isFinite(numeric)) issues.push('sessions_not_numeric');
    else if(numeric<0) issues.push('sessions_negative');
    if(observedState&&/modeled|inferred|estimated|predicted/.test(observedState)){
      issues.push('non_observed_measurement_state');
    }
    return {
      index,
      record_key:String(row?.aggregate_key??row?.record_key??row?.id??('row-'+index)),
      sessions:numeric,
      measurement_state:observedState||null,
      issues,
    };
  });
  const invalid=checks.filter(x=>x.issues.length);
  return {
    ok:invalid.length===0,
    record_count:rows.length,
    valid_count:rows.length-invalid.length,
    invalid_count:invalid.length,
    invalid_records:invalid,
    missing_is_never_zero:true,
    modeled_is_never_observed:true,
    audit_hash:sha(checks),
  };
}


function safeDigest(value){
  const digest=String(value||'').trim().toLowerCase();
  const m=digest.match(/^sha256:([a-f0-9]{64})$/);
  if(!m) throw new Error('microseed_blob_digest_invalid');
  return m[1];
}
function blobPath(stateDir,digestHex){
  if(!stateDir) throw new Error('microseed_blob_state_dir_required');
  const root=path.resolve(stateDir,'object-store','sha256');
  fs.mkdirSync(root,{recursive:true,mode:0o700});
  return path.join(root,digestHex+'.blob');
}
function atomicBlob(file,buffer){
  const tmp=file+'.'+process.pid+'.'+randomBytes(4).toString('hex')+'.tmp';
  fs.writeFileSync(tmp,buffer,{mode:0o600});
  fs.renameSync(tmp,file);
  fs.chmodSync(file,0o600);
}
function blobStore(payload,context={}){
  const operation=String(payload?.operation||'').trim().toLowerCase();
  const digestHex=safeDigest(payload?.sha256);
  const expected='sha256:'+digestHex;
  const file=blobPath(context.stateDir,digestHex);

  if(operation==='put'){
    const body=Buffer.from(String(payload?.bytes_base64||''),'base64');
    if(body.byteLength>48*1024) throw new Error('microseed_blob_chunk_too_large');
    const actual='sha256:'+shaHex(body);
    if(actual!==expected) throw new Error('microseed_blob_content_hash_mismatch');
    let deduplicated=false;
    if(fs.existsSync(file)){
      const prior=fs.readFileSync(file);
      if('sha256:'+shaHex(prior)!==expected) throw new Error('microseed_blob_existing_integrity_failed');
      deduplicated=true;
    }else{
      atomicBlob(file,body);
      const reopened=fs.readFileSync(file);
      if('sha256:'+shaHex(reopened)!==expected) throw new Error('microseed_blob_reopen_integrity_failed');
    }
    return {
      ok:true,
      operation:'put',
      sha256:expected,
      byte_count:body.byteLength,
      stored:true,
      deduplicated,
    };
  }

  if(operation==='has'){
    if(!fs.existsSync(file)) return {ok:true,operation:'has',sha256:expected,present:false};
    const body=fs.readFileSync(file);
    const actual='sha256:'+shaHex(body);
    return {
      ok:actual===expected,
      operation:'has',
      sha256:expected,
      present:actual===expected,
      byte_count:body.byteLength,
      integrity_verified:actual===expected,
    };
  }

  if(operation==='get'){
    if(!fs.existsSync(file)) return {ok:false,operation:'get',sha256:expected,present:false};
    const body=fs.readFileSync(file);
    const actual='sha256:'+shaHex(body);
    if(actual!==expected) throw new Error('microseed_blob_integrity_failed');
    return {
      ok:true,
      operation:'get',
      sha256:expected,
      present:true,
      byte_count:body.byteLength,
      bytes_base64:body.toString('base64'),
      integrity_verified:true,
    };
  }

  throw new Error('microseed_blob_operation_invalid');
}


function safeRecoverySlot(value){
  const slot=String(value||'').trim();
  if(!/^[a-zA-Z0-9._-]{1,96}$/.test(slot)) throw new Error('microseed_secret_share_slot_invalid');
  return slot;
}
function secretShareVault(payload,context={}){
  if(!context.stateDir) throw new Error('microseed_secret_share_state_dir_required');
  const operation=String(payload?.operation||'').trim().toLowerCase();
  const slot=safeRecoverySlot(payload?.slot_id);
  const root=path.resolve(context.stateDir,'secret-share-vault');
  fs.mkdirSync(root,{recursive:true,mode:0o700});
  const file=path.join(root,slot+'.json');

  if(operation==='put'){
    const share=String(payload?.share_base64||'').trim();
    const raw=Buffer.from(share,'base64');
    if(raw.length<2||raw.length>1024) throw new Error('microseed_secret_share_size_invalid');
    const metadata=payload?.metadata&&typeof payload.metadata==='object'?stable(payload.metadata):{};
    const record={
      schema:'evercraft.microseed.secret-share-slot.v1',
      slot_id:slot,
      share_base64:share,
      share_sha256:sha(raw),
      metadata,
      stored_at:new Date().toISOString(),
    };
    const tmp=file+'.'+process.pid+'.'+randomBytes(4).toString('hex')+'.tmp';
    fs.writeFileSync(tmp,JSON.stringify(record,null,2)+'\n',{mode:0o600});
    fs.renameSync(tmp,file);
    fs.chmodSync(file,0o600);
    return {
      ok:true,
      operation:'put',
      slot_id:slot,
      share_sha256:record.share_sha256,
      metadata_hash:sha(metadata),
      stored:true,
      share_value_exposed:false,
    };
  }

  if(operation==='has'){
    return {ok:true,operation:'has',slot_id:slot,present:fs.existsSync(file)};
  }

  if(operation==='list'){
    const slot_ids=fs.readdirSync(root)
      .filter(name=>name.endsWith('.json'))
      .map(name=>name.slice(0,-5))
      .filter(name=>/^[a-zA-Z0-9._-]{1,96}$/.test(name))
      .sort()
      .slice(0,128);
    return {
      ok:true,
      operation:'list',
      slot_id:slot,
      slot_ids,
      share_values_exposed:false,
    };
  }

  if(operation==='get'){
    if(!fs.existsSync(file)) return {ok:false,operation:'get',slot_id:slot,present:false};
    const record=JSON.parse(fs.readFileSync(file,'utf8'));
    const raw=Buffer.from(String(record.share_base64||''),'base64');
    if(record.share_sha256!==sha(raw)) throw new Error('microseed_secret_share_integrity_failed');
    return {
      ok:true,
      operation:'get',
      slot_id:slot,
      present:true,
      share_base64:record.share_base64,
      share_sha256:record.share_sha256,
      metadata:record.metadata||{},
      integrity_verified:true,
    };
  }

  throw new Error('microseed_secret_share_operation_invalid');
}

const SPECS=[
  {
    workload_class:'systemia.secret-share-vault.v1',
    description:'Infrastructure-only bounded threshold-secret share slot for ambient memory recovery.',
    max_payload_bytes:8*1024,
    deterministic:false,
    private_data_allowed:true,
    product_submission_allowed:false,
    sensitive_result:true,
    preferred_max_memory_mb:64,
    canary_payload:{
      operation:'put',
      slot_id:'saban-conformance-canary',
      share_base64:Buffer.from([1,2,3,4]).toString('base64'),
      metadata:{purpose:'conformance'},
    },
    validate_canary:r=>r?.ok===true&&r?.operation==='put'&&r?.share_value_exposed===false,
    execute:secretShareVault,
  },

  {
    workload_class:'systemia.blob-store.v1',
    description:'Bounded content-addressed put/get/has against the device MicroSeed object namespace.',
    max_payload_bytes:64*1024,
    deterministic:false,
    private_data_allowed:true,
    preferred_max_memory_mb:96,
    canary_payload:(()=>{
      const body=Buffer.from('evercraft-microseed-storage-canary');
      return {
        operation:'put',
        sha256:'sha256:'+shaHex(body),
        bytes_base64:body.toString('base64'),
      };
    })(),
    validate_canary:r=>r?.ok===true&&r?.operation==='put'&&r?.stored===true&&Boolean(r?.sha256),
    execute:blobStore,
  },

  {
    workload_class:'systemia.health-probe.v1',
    description:'Bounded device liveness witness.',
    max_payload_bytes:4096,
    deterministic:false,
    private_data_allowed:false,
    preferred_max_memory_mb:32,
    canary_payload:{},
    validate_canary:r=>r?.ok===true&&r?.state==='healthy',
    execute:()=>({ok:true,state:'healthy',observed_at:new Date().toISOString()}),
  },
  {
    workload_class:'systemia.content-hash.v1',
    description:'SHA-256 digest of bounded bytes or canonical JSON.',
    max_payload_bytes:64*1024,
    deterministic:true,
    private_data_allowed:true,
    preferred_max_memory_mb:64,
    canary_payload:{value:{saban:'microseed-canary',version:1}},
    validate_canary:r=>/^sha256:[a-f0-9]{64}$/i.test(String(r?.digest||'')),
    execute:contentHash,
  },
  {
    workload_class:'systemia.telemetry-normalizer.v1',
    description:'Stable-key normalization and digest of bounded telemetry JSON.',
    max_payload_bytes:64*1024,
    deterministic:true,
    private_data_allowed:true,
    preferred_max_memory_mb:96,
    canary_payload:{telemetry:{alpha:1,beta:'two'}},
    validate_canary:r=>r?.ok===true&&Boolean(r?.normalized_hash),
    execute:telemetryNormalizer,
  },
  {
    workload_class:'systemia.chunk-transform.v1',
    description:'Deterministic bounded substring extraction and digest.',
    max_payload_bytes:64*1024,
    deterministic:true,
    private_data_allowed:true,
    preferred_max_memory_mb:128,
    canary_payload:{text:'evercraft-saban-canary',start:0,end:9},
    validate_canary:r=>r?.chunk==='evercraft',
    execute:chunkTransform,
  },
  {
    workload_class:'systemia.json-canonicalize.v1',
    description:'Stable recursive JSON canonicalization with content digest.',
    max_payload_bytes:64*1024,
    deterministic:true,
    private_data_allowed:true,
    preferred_max_memory_mb:128,
    canary_payload:{value:{z:2,a:1}},
    validate_canary:r=>r?.ok===true&&r?.canonical?.a===1&&Boolean(r?.canonical_sha256),
    execute:jsonCanonicalize,
  },
  {
    workload_class:'systemia.rivet.source-coverage-audit.v1',
    description:'Pure audit of the 14-domain RIVET/AliEV source coverage contract.',
    max_payload_bytes:64*1024,
    deterministic:true,
    private_data_allowed:true,
    preferred_max_memory_mb:128,
    canary_payload:{
      snapshot:{
        response_profile:'rivet_report_snapshot_v1',
        source_coverage_manifest:{
          schema:'evercraft.rivet.source-coverage.v1',
          domains:Object.fromEntries(REQUIRED_RIVET_DOMAINS.map(k=>[k,{state:'CONNECTED',record_count:1,source_status:'canary'}])),
        },
      },
    },
    validate_canary:r=>r?.ok===true&&r?.required_domain_count===14&&r?.missing_domains?.length===0,
    execute:rivetSourceCoverageAudit,
  },
  {
    workload_class:'systemia.aliev.domain-record-digest.v1',
    description:'Canonical per-record and aggregate digest for bounded AliEV domain batches.',
    max_payload_bytes:64*1024,
    deterministic:true,
    private_data_allowed:true,
    preferred_max_memory_mb:160,
    canary_payload:{domain:'traffic',records:[{record_key:'a',aadt:12345},{record_key:'b',aadt:23456}]},
    validate_canary:r=>r?.ok===true&&r?.record_count===2&&Boolean(r?.domain_digest),
    execute:alievDomainRecordDigest,
  },
  {
    workload_class:'systemia.rivet.observed-session-sanity.v1',
    description:'Bounded observed-session semantic audit: missing is not zero and modeled is not observed.',
    max_payload_bytes:64*1024,
    deterministic:true,
    private_data_allowed:true,
    preferred_max_memory_mb:160,
    canary_payload:{records:[{aggregate_key:'canary',charging_sessions_count:12,measurement_state:'observed'}]},
    validate_canary:r=>r?.ok===true&&r?.valid_count===1&&r?.missing_is_never_zero===true,
    execute:observedSessionSanity,
  },
];

const MAP=new Map(SPECS.map(spec=>[spec.workload_class,Object.freeze(spec)]));

export function microSeedWorkloadSpec(workloadClass){
  return MAP.get(String(workloadClass||''))||null;
}
export function executeRegisteredMicroSeedWorkload(workloadClass,payload,context={}){
  const spec=microSeedWorkloadSpec(workloadClass);
  if(!spec)return null;
  if(bytes(payload)>spec.max_payload_bytes) throw new Error('microseed_workload_payload_too_large');
  return spec.execute(payload,context);
}
export function microSeedWorkloadCatalog(){
  return {
    schema:'evercraft.microseed.workload-catalog.v1',
    workloads:SPECS.map(spec=>({
      workload_class:spec.workload_class,
      description:spec.description,
      max_payload_bytes:spec.max_payload_bytes,
      deterministic:spec.deterministic,
      private_data_allowed:spec.private_data_allowed,
      product_submission_allowed:spec.product_submission_allowed!==false,
      sensitive_result:spec.sensitive_result===true,
      preferred_max_memory_mb:spec.preferred_max_memory_mb,
      arbitrary_code_execution:false,
    })),
    arbitrary_code_execution:false,
  };
}
export function microSeedConformanceDefinition(workloadClass){
  const spec=microSeedWorkloadSpec(workloadClass);
  return spec?{payload:spec.canary_payload,validate:spec.validate_canary}:null;
}
export const BuiltinMicroSeedWorkloads=Object.freeze(SPECS.map(x=>x.workload_class));
export const RivetRequiredSourceDomains=REQUIRED_RIVET_DOMAINS;
