import {createHash, verify as edVerify, createPublicKey} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const SCHEMA='evercraft.node002.signed-telemetry.v1';
const ACK='evercraft.node002.shadow-ack.v1';
const NODE='evercraft-node002-nextgen';
const NODE_KEY='personal:hp-nextgen:node-002:v1';
const FINGERPRINT='sha256:f3d8d3ac5f9e96bf234db821b43c1c72379d6c763b25c6edc7a23f506ac24eaa';
const keys=(o)=>Object.keys(o).sort().join(',');
const fail=(reason)=>({ok:false,reason});
const exact=(o,k)=>o&&typeof o==='object'&&!Array.isArray(o)&&keys(o)===k.slice().sort().join(',');
const canonicalUuidNonce=(s)=>typeof s==='string'&&/^[0-9a-f]{32}$/.test(s);
const fingerprint=(pem)=>'sha256:'+createHash('sha256').update(pem).digest('hex');

export function verifyNode002ShadowRequest(request,{
  registeredPublicKeyPem,nonceDirectory,now=Date.now(),maxSkewMs=120000,
}={}){
  if(!registeredPublicKeyPem||!nonceDirectory) return fail('receiver_not_configured');
  if(!exact(request,['statement','signature'])) return fail('request_shape_invalid');
  const s=request.statement;
  if(!exact(s,['schema','node_id','node_key','device_fingerprint','nonce','observed_at_utc','sample'])) return fail('statement_shape_invalid');
  if(s.schema!==SCHEMA||s.node_id!==NODE||s.node_key!==NODE_KEY||s.device_fingerprint!==FINGERPRINT) return fail('identity_rejected');
  if(!canonicalUuidNonce(s.nonce)) return fail('nonce_invalid');
  if(typeof s.observed_at_utc!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(s.observed_at_utc)) return fail('timestamp_invalid');
  const sent=Date.parse(s.observed_at_utc);
  if(!Number.isFinite(sent)||Math.abs(now-sent)>maxSkewMs) return fail('timestamp_stale');
  if(!exact(s.sample,['memory_pct','uptime_seconds'])) return fail('sample_shape_invalid');
  if(typeof s.sample.memory_pct!=='number'||!Number.isFinite(s.sample.memory_pct)||s.sample.memory_pct<0||s.sample.memory_pct>100) return fail('memory_invalid');
  if(!Number.isSafeInteger(s.sample.uptime_seconds)||s.sample.uptime_seconds<0) return fail('uptime_invalid');
  if(typeof request.signature!=='string'||!/^[A-Za-z0-9+/]{86}==$/.test(request.signature)) return fail('signature_encoding_invalid');
  let verified=false;
  try{
    const signature=Buffer.from(request.signature,'base64');
    if(signature.length!==64||signature.toString('base64')!==request.signature) return fail('signature_encoding_invalid');
    // Node002 v1 signs JSON.stringify(statement) in its original sender property order.
    // Rebuild that exact wire order; do NOT use MicroSeed's sorted-key signing protocol.
    const ordered={
      schema:s.schema,node_id:s.node_id,node_key:s.node_key,
      device_fingerprint:s.device_fingerprint,nonce:s.nonce,
      observed_at_utc:s.observed_at_utc,
      sample:{memory_pct:s.sample.memory_pct,uptime_seconds:s.sample.uptime_seconds},
    };
    const pub=createPublicKey(registeredPublicKeyPem);
    if(pub.asymmetricKeyType!=='ed25519') return fail('registered_key_invalid');
    verified=edVerify(null,Buffer.from(JSON.stringify(ordered)),pub,signature);
  }catch{return fail('signature_verification_error')}
  if(!verified) return fail('signature_invalid');
  // Persistent, atomic claim: the same signed nonce cannot be accepted twice.
  const digest=createHash('sha256').update(s.node_key+'\0'+s.nonce).digest('hex');
  try{
    const st=fs.lstatSync(nonceDirectory);
    if(!st.isDirectory()||st.isSymbolicLink()) return fail('nonce_store_unavailable');
    const receiptPath=path.join(nonceDirectory,digest+'.json');
    const record=JSON.stringify({schema:ACK,node_key:NODE_KEY,nonce:s.nonce,received_at_utc:new Date(now).toISOString(),statement_sha256:fingerprint(JSON.stringify(s)),shadow:true,execution_authorized:false,lease_created:false})+'\n';
    fs.writeFileSync(receiptPath,record,{flag:'wx',mode:0o600});
  }catch(e){return fail(e?.code==='EEXIST'?'nonce_replayed':'nonce_store_unavailable')}
  return {ok:true,schema:ACK,node_key:NODE_KEY,shadow:true,execution_authorized:false,lease_created:false,sample_key:digest};
}

export function node002ShadowHttpHandler(options={}){
  return async (req,res)=>{
    const respond=(status,body)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(body));};
    if(req.method!=='POST') return respond(405,fail('method_not_allowed'));
    if(!/^application\/json(?:\s*;|$)/i.test(String(req.headers['content-type']||''))) return respond(415,fail('content_type_invalid'));
    let bytes=0,parts=[];
    try{
      for await(const chunk of req){bytes+=chunk.length;if(bytes>4096)return respond(413,fail('payload_too_large'));parts.push(chunk);}
      const data=JSON.parse(Buffer.concat(parts).toString('utf8'));
      const result=verifyNode002ShadowRequest(data,options);
      return respond(result.ok?200:result.reason==='receiver_not_configured'||result.reason==='nonce_store_unavailable'?503:403,result);
    }catch{return respond(400,fail('json_invalid'))}
  };
}
