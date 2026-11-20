#!/usr/bin/env node
// Read-only owned Fabric loopback proof for Aiden's Lab. It never updates the
// checkout, publishes, creates an order, reads private keys or calls a model.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const RESIDENT_ORIGIN='http://127.0.0.1:8787';
export const ASSETS=Object.freeze([
  {name:'index.html',type:/^text\/html\b/i},
  {name:'app.mjs',type:/^(text|application)\/javascript\b/i},
  {name:'learning-worlds.mjs',type:/^(text|application)\/javascript\b/i},
  {name:'catalog.mjs',type:/^(text|application)\/javascript\b/i},
  {name:'styles.css',type:/^text\/css\b/i},
  {name:'mark.svg',type:/^image\/svg\+xml\b/i},
  {name:'classroom/index.html',source:'public/apps/infinite-classroom/play/index.html',type:/^text\/html\b/i,learningMarker:'classroom-practice-v1'},
]);
const sha256=(data)=>createHash('sha256').update(data).digest('hex');

export function classifyResidentAsset({asset,response,source,origin=RESIDENT_ORIGIN}){
  const findings=[];
  const expectedUrl=origin+'/aiden-lab/'+asset.name;
  if(response.status!==200)findings.push('HTTP_NOT_200');
  if(response.final_url!==expectedUrl)findings.push('REDIRECTED_OR_UNEXPECTED_LOCAL_ROUTE');
  if(!asset.type.test(String(response.content_type||'')))findings.push('MIME_MISMATCH');
  if(response.marker!=='aidens-lab-v1')findings.push('OWNED_ROUTE_MARKER_MISSING');
  if(asset.learningMarker && response.learning_marker!==asset.learningMarker)findings.push('LEARNING_WORLD_MARKER_MISSING');
  if(typeof response.body!=='string'||response.body.length>300000)findings.push('INVALID_OR_OVERSIZED_BODY');
  if(sha256(String(response.body))!==sha256(String(source)))findings.push('SOURCE_RESIDENT_SHA256_MISMATCH');
  return {
    path:asset.name,
    status:response.status,
    state:findings.length?'HOLD':'RESIDENT_SOURCE_VERIFIED',
    findings,
    expected_sha256:sha256(String(source)),
    resident_sha256:sha256(String(response.body))
  };
}
export async function probeAidenLabResident({
  fetcher=fetch,sourceRoot=ROOT,now=new Date()
}={}){
  const receipt={
    schema:'evercraft.aidens-lab.resident-parity.v1',
    observed_at:now.toISOString(),
    origin:RESIDENT_ORIGIN,
    access:'loopback_read_only_get',
    no_private_data_accessed:true,
    no_external_action_taken:true,
    release_state:'HOLD',
    verified:false,
    assets:[]
  };
  for(const asset of ASSETS){
    const canonical=path.resolve(sourceRoot,asset.source||'public/aiden-lab/'+asset.name);
    let source;
    try{
      const stat=fs.lstatSync(canonical);
      if(!stat.isFile()||stat.isSymbolicLink()||stat.size>300000)throw Error('source_unavailable');
      source=fs.readFileSync(canonical,'utf8');
    }catch{
      receipt.assets.push({path:asset.name,state:'HOLD',findings:['CANONICAL_SOURCE_UNAVAILABLE']});
      continue;
    }
    const url=RESIDENT_ORIGIN+'/aiden-lab/'+asset.name;
    try{
      const r=await fetcher(url,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(5000)});
      const body=await r.text();
      receipt.assets.push(classifyResidentAsset({
        asset,
        response:{
          status:r.status,final_url:r.url,
          content_type:r.headers.get('content-type'),
          marker:r.headers.get('x-evercraft-static-program'),
          learning_marker:r.headers.get('x-evercraft-learning-world'),body
        },
        source
      }));
    }catch(err){
      receipt.assets.push({path:asset.name,state:'HOLD',findings:['LOCAL_NETWORK_OR_TIMEOUT'],error_kind:String(err?.name||'unknown').slice(0,80)});
    }
  }
  receipt.verified=receipt.assets.length===ASSETS.length &&
    receipt.assets.every(x=>x.state==='RESIDENT_SOURCE_VERIFIED');
  receipt.release_state=receipt.verified?'RESIDENT_PARITY_VERIFIED':'HOLD_UNVERIFIED_RESIDENT';
  receipt.limits=[
    'A resident loopback pass does not prove public HTTPS or DNS routing.',
    'No scientific claim, clinical outcome, physical host attestation or deployment receipt is verified by this probe.'
  ];
  return receipt;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const result=await probeAidenLabResident();
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
  if(process.argv.includes('--gate')&&!result.verified)process.exitCode=1;
}
