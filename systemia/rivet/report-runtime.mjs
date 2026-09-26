import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { createCargoManifest } from '../beast-mode/manifest.mjs';
import { sealFootball, openFootball } from '../beast-mode/football.mjs';

const ALIEV_APP_ID = '69b9b64d86a732029ce0db81';
const RIVET_APP_ID = '6ab2062323d5c33c7dde7606';

function clean(value){ return String(value ?? '').trim(); }
function stable(value){
  if(Array.isArray(value)) return value.map(stable);
  if(value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));
  return value;
}
function sha256(value){
  const bytes = value instanceof Uint8Array || Buffer.isBuffer(value) ? value : Buffer.from(String(value));
  return createHash('sha256').update(bytes).digest('hex');
}
function jsonBytes(value){ return Buffer.from(JSON.stringify(value)); }
function atomicJson(file,value){
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o750});
  const tmp=file+'.'+process.pid+'.'+randomBytes(4).toString('hex')+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{mode:0o600});
  fs.renameSync(tmp,file);
}
function safeId(value){ return clean(value).replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,180); }
function number(value){ const n=Number(value); return Number.isFinite(n)?n:null; }
function arr(value){ return Array.isArray(value)?value:[]; }
function publicText(value){ return clean(value).slice(0,4000); }

function quickRead(data){
  const traffic=arr(data?.traffic);
  const chargers=arr(data?.chargers);
  const incentives=arr(data?.incentives);
  const observedUsage=arr(data?.nearby_observed_usage);
  const maxAadt=traffic.reduce((m,row)=>Math.max(m,number(row?.aadt)||0),0) || null;
  const utilityState=clean(data?.coverage_contract?.utility_tariff?.state || data?.coverage_contract?.utility_service_area?.state);
  const evidenceState=clean(data?.evidence_state || 'unknown');
  const strongest=[];
  if(maxAadt) strongest.push('Observed traffic evidence includes a maximum AADT of '+maxAadt.toLocaleString()+'.');
  if(chargers.length) strongest.push(chargers.length+' nearby charging record'+(chargers.length===1?'':'s')+' returned by the source engine.');
  if(observedUsage.length) strongest.push('Observed charging-usage evidence is present and kept separate from modeled demand.');
  if(utilityState) strongest.push('Utility/tariff coverage state: '+utilityState+'.');
  if(incentives.length) strongest.push(incentives.length+' incentive or program record'+(incentives.length===1?'':'s')+' surfaced for diligence.');

  const open=[];
  if(!traffic.length) open.push('Traffic evidence was not returned for this screening run.');
  if(!chargers.length) open.push('Nearby charger inventory was not returned for this screening run.');
  if(!utilityState) open.push('Utility and tariff assignment remain unverified.');
  if(!observedUsage.length) open.push('Observed session/usage evidence was not returned.');
  if(!incentives.length) open.push('No incentive/program record was returned.');

  return {
    decision_label: strongest.length >= 3 ? 'DEEPER DILIGENCE JUSTIFIED' : 'SCREENING INCOMPLETE',
    decision_tone: strongest.length >= 3 ? 'green' : 'amber',
    evidence_state:evidenceState,
    strongest_points:strongest.slice(0,5),
    open_questions:open.slice(0,5),
    max_aadt:maxAadt,
    charger_count:chargers.length,
    traffic_rows:traffic.slice(0,12),
    chargers:chargers.slice(0,20),
    incentives:incentives.slice(0,20),
    observed_usage:observedUsage.slice(0,12)
  };
}

export function buildYardReport({address,sourceSnapshot,retrievedAt=new Date().toISOString()}){
  const read=quickRead(sourceSnapshot);
  return {
    schema:'evercraft.rivet.yard-report.v1',
    generation_state:'ready',
    report_type:'preliminary_site_opportunity',
    address:clean(sourceSnapshot?.matched_address || address),
    requested_address:clean(address),
    latitude:number(sourceSnapshot?.latitude),
    longitude:number(sourceSnapshot?.longitude),
    state:clean(sourceSnapshot?.state),
    postal_code:clean(sourceSnapshot?.postal_code),
    generated_at:new Date().toISOString(),
    source:{
      system:'AliEV',
      app_id:ALIEV_APP_ID,
      response_profile:clean(sourceSnapshot?.response_profile),
      evidence_state:clean(sourceSnapshot?.evidence_state),
      retrieved_at:clean(sourceSnapshot?.retrieved_at || retrievedAt)
    },
    decision:{
      label:read.decision_label,
      tone:read.decision_tone,
      strongest_points:read.strongest_points,
      open_questions:read.open_questions
    },
    metrics:{
      max_aadt:read.max_aadt,
      charger_count:read.charger_count
    },
    evidence:{
      traffic:read.traffic_rows,
      chargers:read.chargers,
      incentives:read.incentives,
      observed_usage:read.observed_usage,
      coverage_contract:sourceSnapshot?.coverage_contract || null
    },
    caveats:[
      'This is a source-backed screening report, not final engineering, underwriting, permitting, investment approval, or a stamped plan.',
      'Observed, modeled, inferred, and unknown evidence states must remain distinct.',
      'AADT is annual average daily traffic, not live congestion, footfall, or charging sessions.'
    ]
  };
}

export async function generateYardReport({
  address,
  sourceUrl,
  systemiaMachineKey,
  sourceFetch=fetch,
  stateDir,
  now=()=>new Date().toISOString()
}){
  const requested=clean(address);
  if(requested.length<5) throw new Error('address_required');
  if(!clean(sourceUrl)) throw new Error('aliev_source_url_required');
  if(!clean(systemiaMachineKey)) throw new Error('systemia_machine_key_required');
  if(!stateDir) throw new Error('state_dir_required');

  const response=await sourceFetch(sourceUrl,{
    method:'POST',
    headers:{
      'content-type':'application/json',
      'accept':'application/json',
      'x-systemia-machine-key':systemiaMachineKey
    },
    body:JSON.stringify({address:requested,mode:'rivet_report_snapshot'})
  });
  const data=await response.json().catch(()=>null);
  if(!response.ok) throw new Error('aliev_http_'+response.status);
  if(!data || typeof data!=='object') throw new Error('aliev_response_invalid');
  if(data?.access_policy?.commercial_access===false || clean(data?.evidence_state)==='PUBLIC_DISCOVERY_REDACTED'){
    throw new Error('aliev_commercial_snapshot_redacted');
  }
  if(clean(data?.response_profile)!=='rivet_report_snapshot_v1'){
    throw new Error('aliev_snapshot_profile_required');
  }

  const snapshotBytes=jsonBytes(data);
  const snapshotSha=sha256(snapshotBytes);
  const artifactId='aliev-snapshot:'+sha256(requested).slice(0,24);
  const manifest=createCargoManifest({
    source:{system:'AliEV',app_id:ALIEV_APP_ID},
    destination:{system:'RIVET Yard',app_id:RIVET_APP_ID,workspace:'report-runtime'},
    authority:{
      scope:'internal_source_snapshot',
      payment_state:'not_required',
      customer_delivery_authorized:false,
      authorization_ref:'systemia-machine-key'
    },
    artifacts:[{
      artifact_id:artifactId,
      artifact_type:'rivet_report_snapshot',
      filename:artifactId+'.json',
      mime_type:'application/json',
      sha256:snapshotSha,
      byte_count:snapshotBytes.byteLength,
      evidence_state:clean(data?.evidence_state || 'source_backed'),
      provenance:{
        source_asset_key:artifactId,
        source_package_key:'rivet_report_snapshot_v1',
        source_revision:clean(data?.retrieved_at || now())
      },
      permissions:{
        customer_visible:false,
        external_delivery_authorized:false,
        mutation_authorized:false
      }
    }]
  },{now:now()});

  const sealed=sealFootball({manifest,artifacts:new Map([[artifactId,snapshotBytes]])});
  const opened=openFootball(sealed.buffer);
  const caught=opened.artifacts.get(artifactId);
  if(!caught) throw new Error('football_snapshot_missing');
  if(sha256(caught)!==snapshotSha || caught.byteLength!==snapshotBytes.byteLength){
    throw new Error('football_snapshot_integrity_failed');
  }

  const report=buildYardReport({address:requested,sourceSnapshot:data,retrievedAt:now()});
  const reportBytes=jsonBytes(report);
  const reportSha=sha256(reportBytes);
  const reportId='rivet-yard:'+sha256(JSON.stringify(stable({
    address:requested,
    source_sha256:snapshotSha,
    report_sha256:reportSha
  }))).slice(0,32);
  const record={
    schema:'evercraft.rivet.yard-report-record.v1',
    report_id:reportId,
    generation_state:'ready',
    created_at:now(),
    address:requested,
    source_snapshot:{
      sha256:snapshotSha,
      byte_count:snapshotBytes.byteLength,
      football_id:sealed.football_id,
      football_sha256:sha256(sealed.buffer),
      response_profile:'rivet_report_snapshot_v1'
    },
    report:{
      sha256:reportSha,
      byte_count:reportBytes.byteLength,
      body:report
    },
    verification:{
      source_response_profile_verified:true,
      commercial_snapshot_not_redacted:true,
      football_opened:true,
      source_sha256_match:true,
      source_byte_count_match:true,
      report_generation_state:'ready'
    }
  };
  atomicJson(path.join(stateDir,'reports',safeId(reportId)+'.json'),record);
  return record;
}

function send(res,status,body){
  const data=Buffer.from(JSON.stringify(body));
  res.writeHead(status,{'content-type':'application/json','content-length':data.length,'cache-control':'no-store'});
  res.end(data);
}
async function readJson(req){
  const chunks=[]; for await(const chunk of req) chunks.push(chunk);
  const raw=Buffer.concat(chunks).toString('utf8');
  return raw?JSON.parse(raw):{};
}

export async function startRivetReportRuntime({
  stateDir,
  host='127.0.0.1',
  port=0,
  sourceUrl=process.env.ALIEV_YARD_SOURCE_URL || 'https://base44.app/api/apps/69b9b64d86a732029ce0db81/functions/energySiteLookup',
  systemiaMachineKey=process.env.SYSTEMIA_MACHINE_KEY || '',
  teamToken=process.env.RIVET_YARD_TEAM_TOKEN || '',
  sourceFetch=fetch
}={}){
  if(!stateDir) throw new Error('stateDir is required');
  fs.mkdirSync(stateDir,{recursive:true,mode:0o750});
  if(!clean(systemiaMachineKey)) throw new Error('SYSTEMIA_MACHINE_KEY is required');
  if(!clean(teamToken)) throw new Error('RIVET_YARD_TEAM_TOKEN is required');

  const server=http.createServer(async(req,res)=>{
    try{
      if(req.method==='GET' && req.url==='/health'){
        return send(res,200,{
          ok:true,
          service:'rivet-yard-report-runtime',
          runtime:'Evercraft Compute',
          schema:'evercraft.rivet.yard-runtime-health.v1',
          source_adapter:'aliev-rivet-report-snapshot-v1'
        });
      }
      if(req.method==='POST' && req.url==='/v1/reports'){
        const auth=clean(req.headers.authorization);
        if(auth!==('Bearer '+teamToken)) return send(res,401,{ok:false,error:'team_authorization_required'});
        const body=await readJson(req);
        const record=await generateYardReport({
          address:body?.address,
          sourceUrl,
          systemiaMachineKey,
          sourceFetch,
          stateDir
        });
        return send(res,201,{ok:true,...record});
      }
      const m=req.url?.match(/^\/v1\/reports\/([^/?#]+)$/);
      if(req.method==='GET' && m){
        const auth=clean(req.headers.authorization);
        if(auth!==('Bearer '+teamToken)) return send(res,401,{ok:false,error:'team_authorization_required'});
        const id=decodeURIComponent(m[1]);
        const file=path.join(stateDir,'reports',safeId(id)+'.json');
        if(!fs.existsSync(file)) return send(res,404,{ok:false,error:'report_not_found'});
        return send(res,200,{ok:true,...JSON.parse(fs.readFileSync(file,'utf8'))});
      }
      return send(res,404,{ok:false,error:'not_found'});
    }catch(error){
      return send(res,500,{ok:false,error:error instanceof Error?error.message:String(error)});
    }
  });
  await new Promise((resolve,reject)=>{ server.once('error',reject); server.listen(port,host,resolve); });
  const address=server.address();
  const actualPort=typeof address==='object'&&address?address.port:port;
  return {
    schema:'evercraft.rivet.yard-runtime.v1',
    service:'rivet-yard-report-runtime',
    service_url:'http://'+host+':'+actualPort,
    health_path:'/health',
    report_path:'/v1/reports',
    close:()=>new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()))
  };
}
