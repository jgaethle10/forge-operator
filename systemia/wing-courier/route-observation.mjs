#!/usr/bin/env node
// Public-only, anonymous Wing Courier route probe. Does not use credentials,
// transmit customer bytes, mutate state or expose internal private addresses.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const BASE='https://fabric.systemiacommandcenters.com';
export const PROBE_URL=BASE+'/api/internal/wing-courier/v1/inbox?wing=fallen';
export async function observeCourierRoute({fetchImpl=fetch,now=()=>new Date().toISOString()}={}){
 const receipt={schema:'evercraft.wing-courier.public-route-probe.v1',
  checkedAt:now(),target:'owned_fabric_courier_anonymous_inbox',
  anonymousGetOnly:true,credentialsProvided:false,
  publicUrlVerified:false,httpStatus:null,routeState:'UNKNOWN',
  brokerAuthenticated:false,senderAuthenticated:false,receiverAuthenticated:false,
  transferVerified:false,customerAssetsReceived:0,customerSendAuthorized:false,
  secretProvisioned:false,reason:'not_observed'};
 try{
  const r=await fetchImpl(PROBE_URL,{method:'GET',redirect:'manual',cache:'no-store',
   headers:{accept:'application/json'},signal:AbortSignal.timeout(7000)});
  receipt.httpStatus=r.status;
  if(r.status===404){receipt.routeState='NOT_EXPOSED';receipt.reason='route_disabled_or_stale_runtime';}
  else if(r.status===401){receipt.routeState='ANONYMOUS_DENIED';receipt.reason='route_mounted_broker_not_authenticated';}
  else if(r.status===403){receipt.routeState='ANONYMOUS_DENIED';receipt.reason='broker_access_rejected';}
  else if(r.status>=300&&r.status<400){receipt.routeState='UNEXPECTED_REDIRECT';receipt.reason='redirect_forbidden';}
  else if(r.status===200){receipt.routeState='UNEXPECTED_ANONYMOUS_SUCCESS';receipt.reason='security_review_required';}
  else{receipt.routeState='UNEXPECTED_RESPONSE';receipt.reason='http_'+r.status;}
  // Never read body. 401 is NOT proof broker is running because Fabric may
  // independently reject unauthenticated requests before connecting to broker.
  receipt.publicUrlVerified=r.status===404||r.status===401||r.status===403;
 }catch(e){receipt.reason=e?.name==='TimeoutError'?'timeout':'external_route_unavailable';}
 return receipt;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const idx=process.argv.indexOf('--receipt');
 observeCourierRoute().then(r=>{
  if(idx>=0){
   const out=path.resolve(process.argv[idx+1]||'');
   fs.mkdirSync(path.dirname(out),{recursive:true,mode:0o700});
   fs.writeFileSync(out,JSON.stringify(r,null,2)+'\n',{mode:0o600,flag:'wx'});
  }
  console.log(JSON.stringify(r));
 }).catch(()=>{console.error('courier_public_route_probe_held');process.exitCode=2});
}
