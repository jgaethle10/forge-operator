#!/usr/bin/env node
// Owner-local, read-only authenticated Wing Courier route test from NextGen.
// Never transmits files, logs secrets, or grants production/customer authority.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {evaluateWingResidentConfig} from './install-resident.mjs';

export const RECEIVER_AUTH_URL='https://fabric.systemiacommandcenters.com/api/internal/wing-courier/v1/inbox?wing=fallen';
const LIMIT=65536;
const fail=code=>{throw Error('wing_auth_canary_'+code);};

async function boundedJson(response) {
 const len=response.headers?.get?.('content-length');
 if(len!==null&&len!==undefined&&(!/^\d+$/.test(len)||Number(len)>LIMIT))
  fail('response_too_large');
 if(!response.body?.getReader)fail('response_not_streamed');
 const reader=response.body.getReader(),parts=[];
 let bytes=0;
 try{
  for(;;){
   const {value,done}=await reader.read();
   if(done)break;
   bytes+=value.byteLength;
   if(bytes>LIMIT)fail('response_too_large');
   parts.push(Buffer.from(value));
  }
 }finally{reader.releaseLock();}
 try{return JSON.parse(Buffer.concat(parts).toString('utf8'));}
 catch{fail('invalid_json');}
}

export async function observeReceiverAuthBoundary({
 configPath,authorizeNetworkCheck=false,fetchImpl=fetch,now=()=>new Date().toISOString()
}={}) {
 // This private local gate validates an owned HTTPS origin, private receiver
 // token and key paths without reading them into output or creating a service.
 const pre=evaluateWingResidentConfig({configPath,wingExpected:'fallen'});
 const report={
  schema:'evercraft.wing-courier.receiver-auth-boundary.v1',
  checkedAt:now(),wing:'fallen',mode:'DRY_RUN',
  target:'owned_fabric_courier_inbox',
  anonymousStatus:null,authenticatedStatus:null,
  anonymousAccessDenied:false,receiverTokenAccepted:false,
  brokerInboxContractVerified:false,authenticatedRouteReady:false,
  relayProcessIdentityAttested:false,customerBytesMoved:false,
  customerDeliveryAuthorized:false,systemiaAdmissionGranted:false,
  reason:'network_check_not_authorized'
 };
 if(!pre.readyForLocalActivation)fail('private_config_not_ready');
 if(!authorizeNetworkCheck)return report;
 report.mode='AUTHORIZED_READ_ONLY_NETWORK_CHECK';
 // Configuration is already validated by the preflight above. Never put the
 // token or private config in exceptions, logs, GitHub, or stdout.
 const cfg=JSON.parse(fs.readFileSync(configPath,'utf8'));
 const token=fs.readFileSync(cfg.receiveTokenFile,'utf8').trim();
 if(token.length<32||token.length>512||!/^[\x21-\x7e]+$/.test(token))
  fail('private_token_invalid');
 const request=async headers=>fetchImpl(RECEIVER_AUTH_URL,{
  method:'GET',redirect:'manual',cache:'no-store',credentials:'omit',
  headers,signal:AbortSignal.timeout(8000)
 });
 try{
  // Always prove anonymous denial BEFORE attaching the receiver's token.
  const anonymous=await request({accept:'application/json'});
  report.anonymousStatus=anonymous.status;
  if(anonymous.status!==401&&anonymous.status!==403){
   report.reason=anonymous.status===404?'private_route_disabled_or_stale':
    anonymous.status===200?'unexpected_anonymous_access':'unexpected_anonymous_response';
   return report;
  }
  report.anonymousAccessDenied=true;
  const authorized=await request({
   accept:'application/json',authorization:'Bearer '+token
  });
  report.authenticatedStatus=authorized.status;
  if(authorized.status!==200){
   report.reason=authorized.status===403?'receiver_token_rejected':
    authorized.status===503?'private_broker_unavailable':
    'authenticated_route_not_ready';
   return report;
  }
  const body=await boundedJson(authorized);
  if(body?.schema!=='evercraft.wing-broker.inbox.v1'||body.wing!=='fallen'||
     !Array.isArray(body.items)||typeof body.more!=='boolean'){
   report.reason='broker_inbox_contract_mismatch';
   return report;
  }
  report.receiverTokenAccepted=true;
  report.brokerInboxContractVerified=true;
  report.authenticatedRouteReady=true;
  report.reason='authenticated_read_only_boundary_pass';
 }catch {
  // Deliberately redact details from transport/parser exceptions.
  report.reason='network_or_response_unavailable';
 }
 return report;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const i=process.argv.indexOf('--config'),configPath=i>=0?process.argv[i+1]:null;
 observeReceiverAuthBoundary({
  configPath,authorizeNetworkCheck:process.argv.includes('--authorize-owned-network-check')
 }).then(r=>console.log(JSON.stringify(r)))
   .catch(()=>{console.error('HOLD: wing_auth_canary_private_preflight_failed');process.exitCode=2;});
}
