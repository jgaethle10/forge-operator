#!/usr/bin/env node
// External public-edge observation for Systemia Wing Courier deployment.
// Exact pinned hostname + GET /health only. No secrets, writes, customer data,
// SSH, broad requests, deployment action, or inferred courier availability.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const OWNED_FABRIC_HEALTH='https://fabric.systemiacommandcenters.com/health';
const MAX_BODY=4096;
export async function observeCourierEdgePrerequisite({
 fetchImpl=globalThis.fetch,now=()=>new Date().toISOString(),timeoutMs=7500,
}={}){
 const receipt={
  schema:'evercraft.systemia.wing-courier.edge-observation.v1',
  target:'fabric_owned_public_health',
  checkedAt:now(),method:'GET',requestUrl:OWNED_FABRIC_HEALTH,
  httpStatus:null,responded:false,identityVerified:false,ownedHttpsReachable:false,
  deploymentReceiptBound:false,wingCourierEndpointVerified:false,
  networkTransferTestPerformed:false,customerBytesTransferred:false,
  authorityGranted:false,decision:'HOLD_NOT_DEPLOYED',reason:'unobserved'
 };
 try{
  if(typeof fetchImpl!=='function')throw Error('fetch_missing');
  const res=await fetchImpl(OWNED_FABRIC_HEALTH,{
   method:'GET',redirect:'manual',cache:'no-store',
   headers:{accept:'application/json'},signal:AbortSignal.timeout(timeoutMs)});
  receipt.httpStatus=Number(res.status);receipt.responded=true;
  if(res.status!==200){receipt.reason='unhealthy_http_status';return receipt;}
  const ct=String(res.headers?.get?.('content-type')||'');
  if(ct&&!/application\/json/i.test(ct)){receipt.reason='not_json';return receipt;}
  let raw='';
  if(typeof res.body?.getReader==='function'){
   const reader=res.body.getReader();let bytes=0;
   try{
    for(;;){
     const next=await reader.read();if(next.done)break;
     bytes+=next.value.byteLength;
     if(bytes>MAX_BODY){receipt.reason='oversized_health_response';return receipt;}
     raw+=Buffer.from(next.value).toString('utf8');
    }
   }finally{await reader.cancel().catch(()=>{})}
  }else{
   raw=await res.text();
   if(Buffer.byteLength(raw)>MAX_BODY){receipt.reason='oversized_health_response';return receipt;}
  }
  let d;try{d=JSON.parse(raw)}catch{receipt.reason='health_invalid_json';return receipt}
  receipt.identityVerified=d?.ok===true&&d?.service==='evercraft-fabric-local';
  receipt.ownedHttpsReachable=receipt.identityVerified;
  receipt.deploymentReceiptBound=d?.deployment_receipt_bound===true;
  receipt.reason=receipt.identityVerified
   ?'fabric_observed_but_courier_not_deployed_or_routed'
   :'fabric_identity_unverified';
 }catch(error){
  // Never leak potentially sensitive error details into public logs.
  receipt.reason=error?.name==='TimeoutError'?'timeout':'network_or_transport_unavailable';
 }
 return receipt;
}
export async function recordObservation({outFile,fetchImpl}={}){
 const receipt=await observeCourierEdgePrerequisite({fetchImpl});
 if(outFile){
  const dst=path.resolve(outFile);
  fs.mkdirSync(path.dirname(dst),{recursive:true,mode:0o700});
  fs.writeFileSync(dst,JSON.stringify(receipt,null,2)+'\n',{mode:0o600,flag:'wx'});
 }
 return receipt;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const i=process.argv.indexOf('--receipt');
 const outFile=i>=0?process.argv[i+1]:null;
 recordObservation({outFile}).then(r=>{
  // Output contains no full remote response, addresses or secrets.
  console.log(JSON.stringify(r));
 }).catch(()=>{console.error('wing_edge_observation_not_recorded');process.exitCode=2});
}
