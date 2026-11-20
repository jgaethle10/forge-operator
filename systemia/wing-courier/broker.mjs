// Evercraft Wing Courier durable encrypted envelope broker.
// This process handles ciphertext ONLY, not plaintext, payments, releases or jobs.
// Loopback only: a separate approved Evercraft-owned TLS edge is required for remote wings.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const HEX=/^[a-f0-9]{64}$/i,ID=/^[a-f0-9]{32}$/,WING=/^[a-z][a-z0-9-]{1,47}$/;
const MAX_JSON=4096,MAX_BLOB=3*1024**3+131072;
const fail=(code,status=400)=>Object.assign(Error('wing_broker_'+code),{status});
function secureDir(dir){if(!path.isAbsolute(dir))throw fail('absolute_state_required');fs.mkdirSync(dir,{recursive:true,mode:0o700});const s=fs.lstatSync(dir);if(!s.isDirectory()||s.isSymbolicLink()||(s.mode&0o077))throw fail('private_storage_required',500);}
function allowedWing(s){return WING.test(s||'')};
function equals(a,b){if(typeof a!=='string'||typeof b!=='string'||!a||!b)return false;return crypto.timingSafeEqual(crypto.createHash('sha256').update(a).digest(),crypto.createHash('sha256').update(b).digest())}
function token(req){
 const m=/^Bearer ([\x21-\x7e]{32,512})$/.exec(String(req.headers.authorization||''));return m?.[1]||'';
}
function reply(res,status,body){
 const raw=Buffer.from(JSON.stringify(body));res.writeHead(status,{'content-type':'application/json',
  'content-length':raw.length,'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'});
 res.end(raw);
}
async function json(req){
 if(!String(req.headers['content-type']||'').toLowerCase().startsWith('application/json'))throw fail('json_required',415);
 let size=0,raw='';for await(const b of req){size+=b.length;if(size>MAX_JSON)throw fail('json_too_large',413);raw+=b.toString('utf8')}
 try{const obj=JSON.parse(raw);if(!obj||typeof obj!=='object'||Array.isArray(obj))throw 0;return obj}
 catch{throw fail('bad_json')}
}
function privateState(file){const st=fs.lstatSync(file);if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077))throw fail('state_permissions',500);return JSON.parse(fs.readFileSync(file,'utf8'))}
function atomicJson(file,obj){
 const temp=file+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';
 try{fs.writeFileSync(temp,JSON.stringify(obj,null,2)+'\n',{flag:'wx',mode:0o600});fs.renameSync(temp,file)}
 finally{try{fs.rmSync(temp,{force:true})}catch{}}
}
export async function startWingCourierBroker({stateDir,wingCredentials,host='127.0.0.1',port=0,
 maxBlobBytes=512*1024*1024,maxStoredBytes=1024*1024*1024,maxPackages=256}={}){
 if(!['127.0.0.1','localhost','::1'].includes(host))throw fail('must_bind_loopback');
 if(!Number.isSafeInteger(maxBlobBytes)||maxBlobBytes<100||maxBlobBytes>MAX_BLOB)throw fail('max_blob_invalid');
 if(!Number.isSafeInteger(maxStoredBytes)||maxStoredBytes<maxBlobBytes||
    maxStoredBytes>16*1024**3)throw fail('stored_bytes_limit_invalid');
 if(!Number.isSafeInteger(maxPackages)||maxPackages<1||maxPackages>100000)throw fail('max_packages_invalid');
 if(!Array.isArray(wingCredentials)||!wingCredentials.length)throw fail('wing_auth_required');
 const credentials=new Map();
 for(const row of wingCredentials){
  if(!allowedWing(row?.wing)||credentials.has(row.wing)||
   typeof row.sendToken!=='string'||row.sendToken.length<32||
   typeof row.receiveToken!=='string'||row.receiveToken.length<32||
   row.sendToken===row.receiveToken||!Array.isArray(row.allowedDestinations)||
   !row.allowedDestinations.every(allowedWing))throw fail('credentials_invalid');
  credentials.set(row.wing,{...row,allowedDestinations:new Set(row.allowedDestinations)});
 }
 secureDir(path.resolve(stateDir));const root=path.join(stateDir,'packages');secureDir(path.resolve(root));
 const locks=new Set();
 // Count reservations, not only uploaded files: a sender cannot exhaust the
 // relay by reserving unlimited packages and never providing ciphertext.
 function capacity(){
   let reserved=0,packages=0;
   for(const id of fs.readdirSync(root)){
     if(!ID.test(id))continue;
     const record=privateState(path.join(root,id,'state.json'));
     if(!Number.isSafeInteger(record.bytes)||record.bytes<100||
       record.bytes>maxBlobBytes)throw fail('stored_reservation_invalid',503);
     reserved+=record.bytes;packages++;
   }
   return {reserved,packages};
 }
 const auth=(req,wing,role)=>{
  const row=credentials.get(wing);
  if(!row||!equals(token(req),role==='send'?row.sendToken:row.receiveToken))throw fail('not_authorized',403);
  return row;
 };
 const location=id=>{
  if(!ID.test(id||''))throw fail('package_id_invalid');
  const dir=path.join(root,id),file=path.join(dir,'state.json');
  if(!fs.existsSync(file))throw fail('not_found',404);
  return {dir,file,state:privateState(file)};
 };
 const handler=async(req,res)=>{
  try{
   const url=new URL(req.url||'/','http://127.0.0.1');
   if(req.method==='GET'&&url.pathname==='/health'){
    return reply(res,200,{schema:'evercraft.wing-broker.health.v1',ok:true,
     state:'local_private_encrypted_queue',plaintextPresent:false,
     productionAuthority:false,externalDeliveryAuthority:false});
   }
   if(req.method==='POST'&&url.pathname==='/v1/envelopes'){
    const body=await json(req),{id,fromWing,toWing,ciphertextSha256,bytes}=body;
    if(!ID.test(id||'')||!allowedWing(fromWing)||!allowedWing(toWing)||
      !HEX.test(ciphertextSha256||'')||!Number.isSafeInteger(bytes)||bytes<100||bytes>maxBlobBytes)
      throw fail('envelope_fields_invalid');
    const actor=auth(req,fromWing,'send');
    if(!actor.allowedDestinations.has(toWing)||!credentials.has(toWing))throw fail('destination_not_permitted',403);
    const dir=path.join(root,id),stateFile=path.join(dir,'state.json');
    if(fs.existsSync(dir)){
     const old=privateState(stateFile);
     if(old.fromWing!==fromWing||old.toWing!==toWing||
       old.bytes!==bytes||old.ciphertextSha256!==ciphertextSha256)throw fail('id_conflict',409);
     return reply(res,200,{id,state:old.state,idempotent:true});
    }
    const quota=capacity();
    if(quota.packages>=maxPackages||quota.reserved+bytes>maxStoredBytes)
      throw fail('private_queue_quota_exhausted',507);
    fs.mkdirSync(dir,{mode:0o700});
    const record={schema:'evercraft.wing-broker.queue-item.v1',
      id,fromWing,toWing,bytes,ciphertextSha256,state:'STAGED',
      createdAt:new Date().toISOString(),ack:null};
    atomicJson(stateFile,record);return reply(res,201,{id,state:'STAGED',idempotent:false});
   }
   const blob=/^\/v1\/envelopes\/([a-f0-9]{32})\/blob$/.exec(url.pathname);
   if(blob&&req.method==='PUT'){
    const {dir,file,state}=location(blob[1]);auth(req,state.fromWing,'send');
    if(state.state!=='STAGED'){
     if(state.state==='READY'||state.state==='ACK_REPORTED_BY_RECEIVER')return reply(res,200,{id:state.id,state:state.state,idempotent:true});
     throw fail('cannot_upload',409);
    }
    if(locks.has(state.id))throw fail('upload_busy',409);
    locks.add(state.id);const tmp=path.join(dir,'.blob-'+crypto.randomBytes(8).toString('hex')+'.tmp');
    let output;
    try{
     output=fs.openSync(tmp,'wx',0o600);const hash=crypto.createHash('sha256');let n=0;
     for await(const chunk of req){
      n+=chunk.length;if(n>state.bytes||n>maxBlobBytes)throw fail('upload_exceeds_declaration',413);
      let off=0;while(off<chunk.length){const wrote=fs.writeSync(output,chunk,off,chunk.length-off);if(wrote<1)throw fail('disk_write',503);off+=wrote}
      hash.update(chunk);
     }
     if(n!==state.bytes||hash.digest('hex')!==state.ciphertextSha256)throw fail('uploaded_ciphertext_mismatch',422);
     fs.fsyncSync(output);fs.closeSync(output);output=null;
     fs.renameSync(tmp,path.join(dir,'encrypted.blob'));
     state.state='READY';state.readyAt=new Date().toISOString();
     atomicJson(file,state);
     return reply(res,200,{id:state.id,state:'READY',bytes:n});
    }finally{
     locks.delete(state.id);if(output!==undefined&&output!==null)fs.closeSync(output);
     try{fs.rmSync(tmp,{force:true})}catch{}
    }
   }
   if(req.method==='GET'&&url.pathname==='/v1/inbox'){
    const wing=url.searchParams.get('wing');if(!allowedWing(wing))throw fail('invalid_wing');
    auth(req,wing,'receive');
    const list=[];
    for(const id of fs.readdirSync(root)){
     if(!ID.test(id))continue;
     const state=privateState(path.join(root,id,'state.json'));
     if(state.toWing===wing&&state.state==='READY')list.push({
      id:state.id,fromWing:state.fromWing,toWing:state.toWing,
      bytes:state.bytes,ciphertextSha256:state.ciphertextSha256,readyAt:state.readyAt});
    }
    list.sort((a,b)=>a.readyAt.localeCompare(b.readyAt));return reply(res,200,{
     schema:'evercraft.wing-broker.inbox.v1',wing,items:list.slice(0,100),more:list.length>100});
   }
   if(blob&&req.method==='GET'){
    const {dir,state}=location(blob[1]);auth(req,state.toWing,'receive');
    if(!['READY','ACK_REPORTED_BY_RECEIVER'].includes(state.state))throw fail('not_ready',409);
    const f=path.join(dir,'encrypted.blob'),st=fs.lstatSync(f);
    if(!st.isFile()||st.isSymbolicLink()||st.size!==state.bytes)throw fail('blob_state_invalid',503);
    res.writeHead(200,{'content-type':'application/octet-stream',
      'content-length':state.bytes,'cache-control':'no-store','x-content-type-options':'nosniff'});
    fs.createReadStream(f).on('error',()=>res.destroy()).pipe(res);return;
   }
   const ack=/^\/v1\/envelopes\/([a-f0-9]{32})\/ack$/.exec(url.pathname);
   if(ack&&req.method==='POST'){
    const {file,state}=location(ack[1]);auth(req,state.toWing,'receive');
    const body=await json(req);
    if(!HEX.test(body.receiptSha256||'')||body.ciphertextSha256!==state.ciphertextSha256)
     throw fail('ack_fields_invalid');
    if(state.state==='ACK_REPORTED_BY_RECEIVER'){
     if(state.ack?.receiptSha256!==body.receiptSha256)throw fail('ack_conflict',409);
     return reply(res,200,{id:state.id,state:state.state,idempotent:true});
    }
    if(state.state!=='READY')throw fail('ack_not_ready',409);
    state.ack={receiptSha256:body.receiptSha256,receivedAt:new Date().toISOString()};
    state.state='ACK_REPORTED_BY_RECEIVER';atomicJson(file,state);
    return reply(res,200,{id:state.id,state:state.state,idempotent:false});
   }
   return reply(res,404,{error:'not_found'});
  }catch(e){
   if(!res.headersSent)reply(res,Number.isInteger(e?.status)?e.status:500,{
    error:Number.isInteger(e?.status)?e.message:'wing_broker_internal_error'});
   else res.destroy();
  }
 };
 const server=http.createServer((req,res)=>{handler(req,res).catch(()=>{if(!res.headersSent)reply(res,500,{error:'wing_broker_internal_error'});else res.destroy()})});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve)});
 return {server,url:'http://'+host+':'+server.address().port,
  close:()=>new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()))};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const configFile=process.argv[2];if(!configFile)throw fail('config_required');
  const st=fs.lstatSync(configFile);if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077))throw fail('config_must_be_private');
  const cfg=JSON.parse(fs.readFileSync(configFile,'utf8'));
  const getSecret=p=>{
   if(!path.isAbsolute(p))throw fail('absolute_secret_path_required');
   const s=fs.lstatSync(p);if(!s.isFile()||s.isSymbolicLink()||(s.mode&0o077))throw fail('secret_must_be_private');
   return fs.readFileSync(p,'utf8').trim();
  };
  const wings=cfg.wings.map(w=>({wing:w.wing,allowedDestinations:w.allowedDestinations,
   sendToken:getSecret(w.sendTokenFile),receiveToken:getSecret(w.receiveTokenFile)}));
  const svc=await startWingCourierBroker({
   stateDir:cfg.stateDir,wingCredentials:wings,port:cfg.port??8791,host:'127.0.0.1'});
  process.stdout.write(JSON.stringify({ready:true,loopback:svc.url,encryptedOnly:true,externalTransportReady:false})+'\n');
 }catch(e){console.error(e.message);process.exitCode=1}
}
