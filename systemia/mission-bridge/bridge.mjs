// Chat -> authenticated Git source -> Systemia mission admission -> allowlisted
// specialist -> read-only worker -> evidence receipt. No runtime-control grant.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ORIGIN='https://fabric.systemiacommandcenters.com';
const SOURCE_FILES=Object.freeze([
  'systemia/control-plane/control-plane.mjs',
  'systemia/organism/kernel.mjs',
  'systemia/mission-bridge/bridge.mjs',
  'systemia/mcp/signal-public-inquiry.mjs',
]);
const STUDIO_SOURCE_FILES=Object.freeze([
  "systemia/intake-fabric/README.md",
  "systemia/execution-gate/gate.mjs",
  "systemia/evercraft-home/README.md",
  "systemia/wing-courier/private-asset-demand.mjs",
  "systemia/media-studio/render-worker/README.md",
  "systemia/media-studio/cli.ts",
  "systemia/media-studio/journal-education.ts",
  "public/worlds/owned-asset-client.mjs"
]);
const ROUTES=Object.freeze({
  'founder-studio-source-evidence':Object.freeze({
    specialist:'systemia.founder-studio-source-observer',
    worker:'github-actions-readonly',
    checks:STUDIO_SOURCE_FILES
  }),
  'signal-public-ingress':Object.freeze({
    specialist:'systemia.signal-public-edge-observer',
    worker:'github-actions-readonly',
    checks:['/health','/offers/signal-brief','/api/signal/readiness']
  }),
  'forge-source-evidence':Object.freeze({
    specialist:'systemia.forge-source-evidence-observer',
    worker:'github-actions-readonly',
    checks:SOURCE_FILES
  }),
});
const SHA=x=>crypto.createHash('sha256').update(x).digest('hex');
const REQUEST_KEYS=new Set(['schema','mission_id','objective','route','mode','requested_at']);

export function admitMissionRequest(input){
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('mission_request_invalid');
  if(Object.keys(input).some(k=>!REQUEST_KEYS.has(k)))throw Error('mission_unknown_or_authority_fields_refused');
  if(input.schema!=='evercraft.systemia.chat-mission-request.v1')throw Error('mission_schema_invalid');
  if(!/^[a-z][a-z0-9-]{8,63}$/.test(input.mission_id||''))throw Error('mission_id_invalid');
  if(typeof input.objective!=='string'||input.objective.trim().length<12||input.objective.length>300||
     /[\u0000-\u001f\u007f]/.test(input.objective))throw Error('mission_objective_invalid');
  if(!Object.hasOwn(ROUTES,input.route))throw Error('mission_route_not_admitted');
  if(input.mode!=='observe')throw Error('mission_mode_not_admitted');
  if(typeof input.requested_at!=='string'||!/^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(input.requested_at)||
     !Number.isFinite(Date.parse(input.requested_at)))throw Error('mission_timestamp_invalid');
  const canonical={
    schema:input.schema,mission_id:input.mission_id,objective:input.objective.trim(),
    route:input.route,mode:input.mode,requested_at:input.requested_at
  };
  const specialist=ROUTES[input.route];
  return Object.freeze({
    schema:'evercraft.systemia.chat-mission-admission.v1',
    mission_id:input.mission_id,route:input.route,
    specialist:specialist.specialist,worker:specialist.worker,
    checks:[...specialist.checks],
    request_sha256:SHA(JSON.stringify(canonical)),
    execution_authority_granted:false,
    dispatch_authorized:true,
    authority_scope:'read_only_observation',
    passport_execution_lease_present:false,
    requires_separate_gate_for_write:true,
    remote_node_access_granted:false
  });
}
async function readBounded(response,limit=90000){
  if(!response.body)return '';
  const reader=response.body.getReader();let total=0;const pieces=[];
  try{
    for(;;){
      const {done,value}=await reader.read();
      if(done)break;
      total+=value.length;
      if(total>limit)throw Error('response_too_large');
      pieces.push(value);
    }
  }finally{await reader.cancel().catch(()=>{})}
  return Buffer.concat(pieces).toString('utf8');
}
function inspectSignal(route,status,body){
  const text=String(body||'');
  if(status!==200)return {valid:false,reason:'unexpected_http_status'};
  if(route==='/health'){
    try{
      const json=JSON.parse(text);
      return {valid:json.ok===true&&json.service==='evercraft-fabric-local',
        source_release_ref_bound:json.source_release_ref_bound===true,
        deployment_receipt_bound:json.deployment_receipt_bound===true};
    }catch{return {valid:false,reason:'invalid_health_json'}}
  }
  if(route==='/api/signal/readiness'){
    try{
      const json=JSON.parse(text);
      return {valid:json.schema==='evercraft.signal.intake-readiness.v1'&&json.intake_available===true,
        intake_available:json.intake_available===true,
        payment_ready:json.payment_ready===true,
        payment_verified:json.payment_verified===true};
    }catch{return {valid:false,reason:'invalid_signal_readiness_json'}}
  }
  return {valid:text.includes('Evercraft Payments')&&text.includes('Incident Evidence Brief')&&text.includes('$250'),
    checkout_verified:false};
}
export async function runMissionRequest(input,{fetchImpl=fetch,rootDir=process.cwd(),now=()=>new Date()}={}){
  const admission=admitMissionRequest(input);
  const observations=[];
  if(admission.route==='signal-public-ingress'){
    for(const route of admission.checks){
      const url=ORIGIN+route;
      try{
        const response=await fetchImpl(url,{
          method:'GET',redirect:'error',cache:'no-store',
          headers:{accept:'text/html,application/json','user-agent':'Evercraft-Systemia-Mission-Bridge/1.0'},
          signal:AbortSignal.timeout(10000)
        });
        const body=await readBounded(response);
        observations.push({route,http_status:response.status,...inspectSignal(route,response.status,body)});
      }catch(error){
        observations.push({route,valid:false,reason:String(error?.name||'request_failed').slice(0,50)});
      }
    }
  }else if(admission.route==='forge-source-evidence'||admission.route==='founder-studio-source-evidence'){
    for(const entry of admission.checks){
      const absolute=path.join(rootDir,entry);
      const boundary=path.relative(rootDir,absolute);
      if(boundary.startsWith('..')||path.isAbsolute(boundary))throw Error('source_path_escape');
      try{
        const stat=fs.lstatSync(absolute);
        if(!stat.isFile()||stat.isSymbolicLink())throw Error('source_not_regular');
        const bytes=fs.readFileSync(absolute);
        if(bytes.length>2_000_000)throw Error('source_too_large');
        observations.push({route:entry,valid:true,sha256:SHA(bytes),bytes:bytes.length});
      }catch{
        observations.push({route:entry,valid:false,reason:'source_missing_or_unsafe'});
      }
    }
  }
  const complete=observations.length===admission.checks.length&&observations.every(x=>x.valid===true);
  const signalReadiness=observations.find(x=>x.route==='/api/signal/readiness');
  const offer=observations.find(x=>x.route==='/offers/signal-brief');
  const diagnosis=admission.route==='signal-public-ingress'
    ?complete?'external_signal_readiness_and_offer_observed':
      offer?.valid===true&&signalReadiness?.valid!==true?'offer_reachable_api_unverified':'public_signal_path_incomplete'
    :admission.route==='founder-studio-source-evidence'
      ?complete?'allowlisted_studio_source_present':'studio_source_incomplete'
      :complete?'allowlisted_forge_source_present':'forge_source_incomplete';
  return Object.freeze({
    schema:'evercraft.systemia.chat-mission-observation.v1',
    mission_id:admission.mission_id,request_sha256:admission.request_sha256,
    route:admission.route,specialist:admission.specialist,worker:admission.worker,
    observed_at:now().toISOString(),state:complete?'observation_complete':'observation_incomplete',
    diagnosis,observations,
    admission_verified:true,customer_request_submitted:false,
    external_write_performed:false,checkout_created:false,
    payment_verified:false,revenue_verified:false,
    remote_node_connected:false,live_penguin_execution_verified:false,
    claim:'GitHub worker read-only evidence only. No authority to publish, deploy, charge or act for users.'
  });
}
