import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { ingestAliEvDomainRecords, aliEvDomainHealth, readAliEvDomainRecords } from './domain-store.mjs';
import { buildOwnedAliEvSiteSnapshot, censusOnelineGeocode } from './source-engine.mjs';
import { refreshOwnedAliEvSiteDomains } from './collectors/us.mjs';
import {
  backfillPlugNYCSessionCorpus,
  compactPlugNYCSessionCorpus,
  reconcilePlugNYCSessionCorpus,
  sessionCorpusStatus,
} from './session-corpus.mjs';

const COVERAGE_SCHEMA='evercraft.rivet.source-coverage.v1';
const REQUIRED_DOMAINS=[
  'geocoding','charging_inventory','traffic','traffic_temporal','utility_service_area','utility_tariff','incentives',
  'parcel_planning','local_ev_stock','observed_sessions','freight','dwell_context','deep_market_evidence','provenance'
];

function clean(v){return String(v??'').trim();}
function norm(v){return clean(v).toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();}
function sha(v){return createHash('sha256').update(v instanceof Uint8Array||Buffer.isBuffer(v)?v:Buffer.from(String(v))).digest('hex');}
function atomicJson(file,value){
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o750});
  const tmp=file+'.'+process.pid+'.'+randomBytes(4).toString('hex')+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{mode:0o600});
  fs.renameSync(tmp,file);
}
async function readJson(req,maxBytes=32*1024*1024){
  const chunks=[]; let bytes=0;
  for await(const chunk of req){
    bytes+=chunk.length;
    if(bytes>maxBytes) throw new Error('request_body_too_large');
    chunks.push(chunk);
  }
  const raw=Buffer.concat(chunks).toString('utf8');
  return raw?JSON.parse(raw):{};
}
function send(res,status,body){
  const bytes=Buffer.from(JSON.stringify(body));
  res.writeHead(status,{'content-type':'application/json','content-length':bytes.length,'cache-control':'no-store'});
  res.end(bytes);
}
function validateSnapshot(snapshot){
  if(!snapshot||snapshot.response_profile!=='rivet_report_snapshot_v1') throw new Error('rivet_report_snapshot_profile_required');
  if(!clean(snapshot.matched_address)) throw new Error('matched_address_required');
  const manifest=snapshot.source_coverage_manifest;
  if(manifest?.schema!==COVERAGE_SCHEMA||!manifest?.domains) throw new Error('source_coverage_manifest_required');
  const missing=REQUIRED_DOMAINS.filter(k=>!manifest.domains[k]||!clean(manifest.domains[k].state));
  if(missing.length) throw new Error('source_coverage_manifest_incomplete:'+missing.join(','));
  if(snapshot.access_policy?.commercial_access!==true) throw new Error('commercial_access_required');
  return snapshot;
}
function indexFile(stateDir){return path.join(stateDir,'index.json');}
function snapshotDir(stateDir){return path.join(stateDir,'snapshots');}
function loadIndex(stateDir){
  const file=indexFile(stateDir);
  if(!fs.existsSync(file)) return {schema:'evercraft.aliev.snapshot-index.v1',entries:{}};
  const parsed=JSON.parse(fs.readFileSync(file,'utf8'));
  if(parsed?.schema!=='evercraft.aliev.snapshot-index.v1') throw new Error('aliev_snapshot_index_schema_invalid');
  return parsed;
}
function writeSnapshot(stateDir,snapshot){
  validateSnapshot(snapshot);
  const bytes=Buffer.from(JSON.stringify(snapshot));
  const digest=sha(bytes);
  const file=path.join(snapshotDir(stateDir),digest+'.json');
  fs.mkdirSync(snapshotDir(stateDir),{recursive:true,mode:0o750});
  if(!fs.existsSync(file)) fs.writeFileSync(file,bytes,{mode:0o600});
  const reopened=fs.readFileSync(file);
  if(sha(reopened)!==digest||reopened.byteLength!==bytes.byteLength) throw new Error('aliev_snapshot_persistence_verification_failed');
  const addressKey=norm(snapshot.matched_address);
  const aliases=[addressKey,...(Array.isArray(snapshot.address_aliases)?snapshot.address_aliases.map(norm):[])].filter(Boolean);
  const index=loadIndex(stateDir);
  const candidateRetrievedAt=clean(snapshot.retrieved_at)||new Date().toISOString();
  const indexedKeys=[];
  const staleKeys=[];
  for(const key of new Set(aliases)){
    const existing=index.entries[key]||null;
    const existingTime=existing?.retrieved_at?Date.parse(existing.retrieved_at):NaN;
    const candidateTime=Date.parse(candidateRetrievedAt);
    if(existing && Number.isFinite(existingTime) && Number.isFinite(candidateTime) && existingTime>candidateTime){
      staleKeys.push(key);
      continue;
    }
    index.entries[key]={
      sha256:digest,
      matched_address:snapshot.matched_address,
      retrieved_at:candidateRetrievedAt,
      evidence_state:clean(snapshot.evidence_state)||'unknown',
      byte_count:bytes.byteLength,
    };
    indexedKeys.push(key);
  }
  index.updated_at=new Date().toISOString();
  atomicJson(indexFile(stateDir),index);
  return {sha256:digest,byte_count:bytes.byteLength,address_keys:[...new Set(aliases)],indexed_keys:indexedKeys,stale_keys:staleKeys};
}
function readSnapshot(stateDir,address){
  const key=norm(address);
  if(!key) throw new Error('address_required');
  const index=loadIndex(stateDir);
  const entry=index.entries[key];
  if(!entry) return null;
  const file=path.join(snapshotDir(stateDir),entry.sha256+'.json');
  if(!fs.existsSync(file)) throw new Error('indexed_snapshot_missing');
  const bytes=fs.readFileSync(file);
  if(sha(bytes)!==entry.sha256||bytes.byteLength!==Number(entry.byte_count||0)) throw new Error('indexed_snapshot_integrity_failed');
  const snapshot=JSON.parse(bytes.toString('utf8'));
  validateSnapshot(snapshot);
  return {snapshot,entry};
}

export async function startAliEvSourceRuntime({
  stateDir,
  host='127.0.0.1',
  port=0,
  systemiaMachineKey=process.env.SYSTEMIA_MACHINE_KEY||'',
  ingestToken=process.env.ALIEV_OWNED_INGEST_TOKEN||'',
  domainStateDir='',
  geocode=censusOnelineGeocode,
  refreshDomains=refreshOwnedAliEvSiteDomains,
  sessionCorpusEnabled=false,
  sessionCorpusStateDir='',
  sessionCorpusFetchImpl=fetch,
  sessionCorpusIntervalMs=300000,
  sessionCorpusPageSize=5000,
  sessionCorpusMaxPagesPerRun=8,
}={}){
  if(!stateDir) throw new Error('stateDir is required');
  if(!clean(systemiaMachineKey)) throw new Error('SYSTEMIA_MACHINE_KEY is required');
  if(!clean(ingestToken)) throw new Error('ALIEV_OWNED_INGEST_TOKEN is required');
  fs.mkdirSync(stateDir,{recursive:true,mode:0o750});
  const domainRoot=path.resolve(domainStateDir||path.join(stateDir,'domain-store'));
  const corpusRoot=path.resolve(sessionCorpusStateDir||path.join(stateDir,'session-corpus-worker'));
  fs.mkdirSync(domainRoot,{recursive:true,mode:0o750});
  if(sessionCorpusEnabled) fs.mkdirSync(corpusRoot,{recursive:true,mode:0o750});
  fs.mkdirSync(snapshotDir(stateDir),{recursive:true,mode:0o750});
  if(!fs.existsSync(indexFile(stateDir))) atomicJson(indexFile(stateDir),{schema:'evercraft.aliev.snapshot-index.v1',entries:{},updated_at:new Date().toISOString()});

  const instanceId='aliev_'+randomBytes(12).toString('hex');
  const startedAt=new Date().toISOString();
  let deploymentReceiptRef='';
  let server=null;
  let sessionCorpusTimer=null;
  let sessionCorpusInFlight=false;
  let lastSessionCorpusCycle=null;

  const runSessionCorpusCycle=async()=>{
    if(sessionCorpusInFlight) return {ok:true,state:'already_running',last:lastSessionCorpusCycle};
    sessionCorpusInFlight=true;
    try{
      const backfill=await backfillPlugNYCSessionCorpus({
        stateDir:corpusRoot,
        fetchImpl:sessionCorpusFetchImpl,
        pageSize:sessionCorpusPageSize,
        maxPagesPerRun:sessionCorpusMaxPagesPerRun,
      });
      let reconciliation=null;
      let compaction=null;
      let domainIngest=null;
      if(backfill.checkpoint.complete){
        reconciliation=reconcilePlugNYCSessionCorpus({stateDir:corpusRoot});
        const compacted=compactPlugNYCSessionCorpus({stateDir:corpusRoot});
        compaction=compacted.receipt;

        const geometryRows=readAliEvDomainRecords({stateDir:domainRoot,domain:'observed_sessions'});
        const geometryByStation=new Map();
        for(const row of geometryRows){
          const station=clean(row?.station_external_id);
          const lat=Number(row?.latitude),lon=Number(row?.longitude);
          if(!station||!Number.isFinite(lat)||!Number.isFinite(lon)) continue;
          const prior=geometryByStation.get(station);
          const stamp=Date.parse(String(row?.period_start||row?.retrieved_at||row?._meta?.retrieved_at||''))||0;
          if(!prior||stamp>=prior.stamp) geometryByStation.set(station,{latitude:lat,longitude:lon,stamp});
        }

        const publishedAt=new Date().toISOString();
        const records=compacted.aggregates.map((row)=>{
          const geo=geometryByStation.get(clean(row.station_external_id));
          return {
            ...row,
            record_key:row.aggregate_key,
            state:'NY',
            ...(geo?{latitude:geo.latitude,longitude:geo.longitude}:{}),
            evidence_state:'OBSERVED_AGGREGATE',
            retrieved_at:publishedAt,
            source_name:'NYC DOT PlugNYC',
            source_url:row.source_url,
            source_vintage:row.source_vintage,
            data_status:row.data_status,
            session_semantics:'Observed individual-session-derived aggregate. INVALID/ABORTED source rows are preserved in raw evidence and excluded from successful utilization. Missing is not zero.',
          };
        });
        domainIngest=ingestAliEvDomainRecords({
          stateDir:domainRoot,
          domain:'observed_sessions',
          records,
          source:{
            name:'NYC DOT PlugNYC',
            url:'https://data.cityofnewyork.us/Transportation/Electric-Vehicle-EV-Charging-Data-Municipal-Lots-a/kj7g-u4gp',
            evidence_state:'OBSERVED_AGGREGATE',
            data_status:'verified',
          }
        });
      }
      lastSessionCorpusCycle={
        ok:true,
        schema:'evercraft.aliev.session-corpus-runtime-cycle.v1',
        backfill:backfill.receipt,
        reconciliation,
        compaction,
        domain_ingest:domainIngest,
        status:sessionCorpusStatus({stateDir:corpusRoot}),
        observed_at:new Date().toISOString(),
      };
      return lastSessionCorpusCycle;
    }catch(error){
      lastSessionCorpusCycle={
        ok:false,
        schema:'evercraft.aliev.session-corpus-runtime-cycle.v1',
        error:error instanceof Error?error.message:String(error),
        status:sessionCorpusStatus({stateDir:corpusRoot}),
        observed_at:new Date().toISOString(),
      };
      return lastSessionCorpusCycle;
    }finally{
      sessionCorpusInFlight=false;
    }
  };

  const health=()=>{
    const index=loadIndex(stateDir);
    return {
      schema:'evercraft.aliev.owned-source-health.v1',
      ok:Boolean(server?.listening),
      service:'aliev-owned-source-runtime',
      runtime:'Evercraft Compute',
      instance_id:instanceId,
      private_source_runtime:true,
      public_route_required:false,
      canonical_store:'content-addressed-snapshot-store-v1',
      domain_store:'content-addressed-domain-store-v1',
      dynamic_snapshot_engine:true,
      precomputed_snapshot_required:false,
      snapshot_count:Object.keys(index.entries||{}).length,
      source_coverage_schema:COVERAGE_SCHEMA,
      required_source_domains:REQUIRED_DOMAINS.length,
      deployment_receipt_bound:Boolean(deploymentReceiptRef),
      deployment_receipt_ref:deploymentReceiptRef||null,
      base44_runtime_required:false,
      session_corpus:{
        enabled:sessionCorpusEnabled===true,
        in_flight:sessionCorpusInFlight,
        cadence_ms:sessionCorpusEnabled?Math.max(60000,Number(sessionCorpusIntervalMs)||300000):null,
        last_cycle:lastSessionCorpusCycle,
        status:sessionCorpusEnabled?sessionCorpusStatus({stateDir:corpusRoot}):null,
        publishes_to_domain:'observed_sessions',
      },
      started_at:startedAt,
    };
  };

  server=http.createServer(async(req,res)=>{
    try{
      if(req.method==='GET'&&req.url==='/health') return send(res,200,health());

      if(req.method==='POST'&&req.url==='/v1/snapshots'){
        if(clean(req.headers.authorization)!=='Bearer '+ingestToken) return send(res,401,{ok:false,error:'ingest_authorization_required'});
        const body=await readJson(req);
        const result=writeSnapshot(stateDir,body.snapshot||body);
        return send(res,201,{ok:true,schema:'evercraft.aliev.snapshot-ingest-receipt.v1',...result,stored_at:new Date().toISOString()});
      }

      if(req.method==='POST'&&req.url==='/v1/snapshot-batch'){
        if(clean(req.headers.authorization)!=='Bearer '+ingestToken) return send(res,401,{ok:false,error:'ingest_authorization_required'});
        const body=await readJson(req,64*1024*1024);
        const snapshots=Array.isArray(body?.snapshots)?body.snapshots:[];
        if(!snapshots.length) return send(res,400,{ok:false,error:'snapshots_required'});
        if(snapshots.length>100) return send(res,413,{ok:false,error:'snapshot_batch_too_large'});
        const receipts=[];
        for(const snapshot of snapshots) receipts.push(writeSnapshot(stateDir,snapshot));
        return send(res,201,{
          ok:true,
          schema:'evercraft.aliev.snapshot-batch-ingest-receipt.v1',
          snapshot_count:receipts.length,
          indexed_key_count:receipts.reduce((n,x)=>n+(x.indexed_keys?.length||0),0),
          stale_key_count:receipts.reduce((n,x)=>n+(x.stale_keys?.length||0),0),
          receipts,
          stored_at:new Date().toISOString()
        });
      }

      if(req.method==='POST'&&req.url==='/v1/domain-records'){
        if(clean(req.headers.authorization)!=='Bearer '+ingestToken) return send(res,401,{ok:false,error:'ingest_authorization_required'});
        const body=await readJson(req,64*1024*1024);
        const records=Array.isArray(body?.records)?body.records:[];
        if(!clean(body?.domain)||!records.length) return send(res,400,{ok:false,error:'domain_and_records_required'});
        if(records.length>5000) return send(res,413,{ok:false,error:'domain_batch_too_large'});
        const receipt=ingestAliEvDomainRecords({
          stateDir:domainRoot,
          domain:body.domain,
          records,
          source:body.source||{}
        });
        return send(res,201,{ok:true,...receipt,stored_at:new Date().toISOString()});
      }

      if(req.method==='GET'&&req.url==='/v1/domain-health'){
        if(clean(req.headers.authorization)!=='Bearer '+ingestToken) return send(res,401,{ok:false,error:'ingest_authorization_required'});
        const domains=['charging_inventory','traffic','traffic_temporal','utility_service_area','utility_tariff','incentives','parcel_planning','local_ev_stock','observed_sessions','freight','dwell_context','deep_market_evidence'];
        return send(res,200,{ok:true,...aliEvDomainHealth({stateDir:domainRoot,domains})});
      }

      if(req.method==='POST'&&(req.url==='/energySiteLookup'||req.url==='/v1/site-snapshot')){
        if(clean(req.headers['x-systemia-machine-key'])!==systemiaMachineKey) return send(res,401,{ok:false,error:'systemia_machine_authorization_required'});
        const body=await readJson(req);
        if(body.mode!=='rivet_report_snapshot') return send(res,400,{ok:false,error:'unsupported_mode'});
        const address=clean(body.address);
        let found=readSnapshot(stateDir,address);
        if(!found){
          try{
            const snapshot=await buildOwnedAliEvSiteSnapshot({
              address,
              domainStateDir:domainRoot,
              geocode,
              refreshDomains,
            });
            const persisted=writeSnapshot(stateDir,snapshot);
            found={snapshot,entry:{sha256:persisted.sha256,byte_count:persisted.byte_count,retrieved_at:snapshot.retrieved_at}};
          }catch(error){
            const message=error instanceof Error?error.message:String(error);
            if(message==='geocoder_no_match') return send(res,404,{ok:false,error:'site_geocode_not_found',address});
            throw error;
          }
        }
        return send(res,200,found.snapshot);
      }

      if(req.method==='GET'&&req.url==='/v1/snapshots'){
        if(clean(req.headers.authorization)!=='Bearer '+ingestToken) return send(res,401,{ok:false,error:'ingest_authorization_required'});
        const index=loadIndex(stateDir);
        return send(res,200,{ok:true,schema:index.schema,count:Object.keys(index.entries||{}).length,entries:index.entries});
      }

      return send(res,404,{ok:false,error:'not_found'});
    }catch(error){
      return send(res,500,{ok:false,error:error instanceof Error?error.message:String(error)});
    }
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);});
  const address=server.address();
  const actualPort=typeof address==='object'&&address?address.port:port;
  const url='http://'+host+':'+actualPort;
  if(sessionCorpusEnabled){
    runSessionCorpusCycle().catch(()=>{});
    sessionCorpusTimer=setInterval(
      ()=>runSessionCorpusCycle().catch(()=>{}),
      Math.max(60000,Number(sessionCorpusIntervalMs)||300000)
    );
    sessionCorpusTimer.unref?.();
  }
  return {
    schema:'evercraft.aliev.owned-source-runtime.v1',
    service:'aliev-owned-source-runtime',
    instance_id:instanceId,
    service_url:url,
    source_url:url+'/energySiteLookup',
    ingest_url:url+'/v1/snapshots',
    batch_ingest_url:url+'/v1/snapshot-batch',
    domain_ingest_url:url+'/v1/domain-records',
    domain_health_url:url+'/v1/domain-health',
    health_path:'/health',
    health,
    setDeploymentReceipt:(receiptRef)=>{
      deploymentReceiptRef=clean(receiptRef);
      return health();
    },
    runSessionCorpusCycle,
    close:()=>new Promise((resolve,reject)=>{
      if(sessionCorpusTimer) clearInterval(sessionCorpusTimer);
      server.close(err=>err?reject(err):resolve());
    }),
  };
}

export function persistAliEvSnapshot({stateDir,snapshot}={}){
  if(!stateDir) throw new Error('stateDir is required');
  return writeSnapshot(path.resolve(stateDir),snapshot);
}
