import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';

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
  for(const key of new Set(aliases)){
    index.entries[key]={
      sha256:digest,
      matched_address:snapshot.matched_address,
      retrieved_at:clean(snapshot.retrieved_at)||new Date().toISOString(),
      evidence_state:clean(snapshot.evidence_state)||'unknown',
      byte_count:bytes.byteLength,
    };
  }
  index.updated_at=new Date().toISOString();
  atomicJson(indexFile(stateDir),index);
  return {sha256:digest,byte_count:bytes.byteLength,address_keys:[...new Set(aliases)]};
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
}={}){
  if(!stateDir) throw new Error('stateDir is required');
  if(!clean(systemiaMachineKey)) throw new Error('SYSTEMIA_MACHINE_KEY is required');
  if(!clean(ingestToken)) throw new Error('ALIEV_OWNED_INGEST_TOKEN is required');
  fs.mkdirSync(stateDir,{recursive:true,mode:0o750});
  fs.mkdirSync(snapshotDir(stateDir),{recursive:true,mode:0o750});
  if(!fs.existsSync(indexFile(stateDir))) atomicJson(indexFile(stateDir),{schema:'evercraft.aliev.snapshot-index.v1',entries:{},updated_at:new Date().toISOString()});

  const instanceId='aliev_'+randomBytes(12).toString('hex');
  const startedAt=new Date().toISOString();
  let deploymentReceiptRef='';
  let server=null;
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
      snapshot_count:Object.keys(index.entries||{}).length,
      source_coverage_schema:COVERAGE_SCHEMA,
      required_source_domains:REQUIRED_DOMAINS.length,
      deployment_receipt_bound:Boolean(deploymentReceiptRef),
      deployment_receipt_ref:deploymentReceiptRef||null,
      base44_runtime_required:false,
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

      if(req.method==='POST'&&(req.url==='/energySiteLookup'||req.url==='/v1/site-snapshot')){
        if(clean(req.headers['x-systemia-machine-key'])!==systemiaMachineKey) return send(res,401,{ok:false,error:'systemia_machine_authorization_required'});
        const body=await readJson(req);
        if(body.mode!=='rivet_report_snapshot') return send(res,400,{ok:false,error:'unsupported_mode'});
        const address=clean(body.address);
        const found=readSnapshot(stateDir,address);
        if(!found) return send(res,404,{ok:false,error:'site_snapshot_not_found',address});
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
  return {
    schema:'evercraft.aliev.owned-source-runtime.v1',
    service:'aliev-owned-source-runtime',
    instance_id:instanceId,
    service_url:url,
    source_url:url+'/energySiteLookup',
    ingest_url:url+'/v1/snapshots',
    health_path:'/health',
    health,
    setDeploymentReceipt:(receiptRef)=>{
      deploymentReceiptRef=clean(receiptRef);
      return health();
    },
    close:()=>new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve())),
  };
}

export function persistAliEvSnapshot({stateDir,snapshot}={}){
  if(!stateDir) throw new Error('stateDir is required');
  return writeSnapshot(path.resolve(stateDir),snapshot);
}
