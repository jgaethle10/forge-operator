#!/usr/bin/env node
// External, pinned, read-only network diagnosis for the EXISTING owned Fabric edge.
// Never prints resolved IP addresses, cert contents, secrets or customer records.
import dns from 'node:dns/promises';
import tls from 'node:tls';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const FABRIC_HOST='fabric.systemiacommandcenters.com';
function classify(e){
 const code=String(e?.code||'');
 if(['ENOTFOUND','ENODATA'].includes(code))return 'dns_unresolved';
 if(code==='EAI_AGAIN')return 'dns_temporary_failure';
 if(['ECONNREFUSED','ETIMEDOUT','EHOSTUNREACH','ENETUNREACH'].includes(code))
  return 'https_transport_unavailable';
 if(code.startsWith('ERR_TLS_')||code.includes('CERT_')||
   code==='UNABLE_TO_VERIFY_LEAF_SIGNATURE'||code==='DEPTH_ZERO_SELF_SIGNED_CERT')
  return 'https_tls_identity_invalid';
 return 'external_route_unavailable';
}
export async function verifiedTlsHandshake({host=FABRIC_HOST,timeoutMs=6000}={}){
 if(host!==FABRIC_HOST)throw Error('external_diagnostic_hostname_not_allowlisted');
 return new Promise((resolve)=>{
  let done=false;
  const socket=tls.connect({host,port:443,servername:host,timeout:timeoutMs,rejectUnauthorized:true});
  const finish=(value)=>{
   if(done)return;
   done=true;socket.destroy();resolve(value);
  };
  socket.once('secureConnect',()=>finish(socket.authorized===true
   ?{passed:true,stage:'https_tls_identity_verified'}
   :{passed:false,stage:'https_tls_identity_invalid'}));
  socket.once('timeout',()=>finish({passed:false,stage:'https_transport_unavailable'}));
  socket.once('error',(e)=>finish({passed:false,stage:classify(e)}));
 });
}
export async function diagnoseOwnedEdge({lookup=dns.lookup,probeTls=verifiedTlsHandshake,
 now=()=>new Date().toISOString()}={}){
 const r={schema:'evercraft.wing-courier.owned-edge-network-diagnosis.v1',
  host:FABRIC_HOST,utc:now(),dnsResolved:false,dnsRecordsPresent:false,
  tlsHandshakeVerified:false,stage:'PENDING',customerDataTouched:false,
  credentialsAccessed:false,networkMutation:false,relayRunningVerified:false,
  deploymentAllowed:false};
 try{
  const records=await lookup(FABRIC_HOST,{all:true});
  if(!Array.isArray(records)||records.length===0){
   r.stage='dns_unresolved';return r;
  }
  r.dnsResolved=true;r.dnsRecordsPresent=true;
 }catch(e){r.stage=classify(e);return r;}
 try{
  const result=await probeTls({host:FABRIC_HOST});
  r.tlsHandshakeVerified=result?.passed===true;
  r.stage=r.tlsHandshakeVerified?'https_tls_identity_verified':String(result?.stage||'external_route_unavailable');
 }catch(e){r.stage=classify(e)}
 return r;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 diagnoseOwnedEdge().then(r=>{
  const i=process.argv.indexOf('--receipt');
  if(i!==-1){
   const dst=path.resolve(process.argv[i+1]||'');
   fs.mkdirSync(path.dirname(dst),{recursive:true,mode:0o700});
   fs.writeFileSync(dst,JSON.stringify(r,null,2)+'\n',{mode:0o600,flag:'wx'});
  }
  console.log(JSON.stringify(r));
 }).catch(()=>{console.error('owned_edge_diagnosis_unavailable');process.exitCode=2});
}
