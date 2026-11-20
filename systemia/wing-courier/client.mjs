// Evercraft Wing Courier outbound-only client, no inbound listener.
// Encryption and receiver signature/hash verification in envelope.mjs.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {fileURLToPath} from 'node:url';
import {createWingBundle,generateWingKeys,hashFileSync,openWingBundle} from './envelope.mjs';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const HEX=/^[a-f0-9]{64}$/i;
function fail(c){throw Error('wing_client_'+c)}
function keyText(file){
 if(!path.isAbsolute(file))fail('token_file_absolute_path_required');
 const st=fs.lstatSync(file);if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077))fail('token_not_private');
 const s=fs.readFileSync(file,'utf8').trim();if(s.length<32||s.length>512)fail('token_invalid');return s;
}
export function resolveWingCourierBase(value){
 let u;try{u=new URL(value)}catch{fail('endpoint_url_invalid')}
 if(u.username||u.password)fail('endpoint_credentials_forbidden');
 if(u.search||u.hash)fail('endpoint_query_forbidden');
 const pathname=u.pathname.replace(/\/+$/,'');
 if(u.protocol==='https:'){
  if(u.origin!=='https://fabric.systemiacommandcenters.com'||
    pathname!=='/api/internal/wing-courier')
   fail('endpoint_must_be_owned_fabric_route');
 }else if(u.protocol==='http:'&&['127.0.0.1','localhost','::1'].includes(u.hostname)){
  if(pathname!==''&&pathname!=='/api/internal/wing-courier')
   fail('loopback_endpoint_path_invalid');
 }else fail('endpoint_must_be_owned_fabric_or_loopback');
 return u.origin+pathname;
}
async function request(base,token,method,route,{json,stream,headers={}}={}){
 const res=await fetch(base+route,{method,redirect:'manual',
  headers:{authorization:'Bearer '+token,accept:'application/json',...headers,
   ...(json?{'content-type':'application/json'}:{})},
  body:json?JSON.stringify(json):stream, ...(stream?{duplex:'half'}:{})});
 if(res.status>=300&&res.status<400)fail('redirect_forbidden');
 if(!res.ok){
  const data=await res.json().catch(()=>({error:'http_'+res.status}));
  const e=Error(data?.error||'http_'+res.status);e.httpStatus=res.status;throw e;
 }
 return res;
}
function readConfig(file){
 const st=fs.lstatSync(file);if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077))fail('config_not_private');
 return JSON.parse(fs.readFileSync(file,'utf8'));
}
function emitJsonPrivate(file,body){
 fs.writeFileSync(file,JSON.stringify(body,null,2)+'\n',{flag:'wx',mode:0o600});
}
export async function readWingDeliveryStatus({baseUrl,tokenFile,metaFile}={}){
 const st=fs.lstatSync(metaFile);
 if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077)!==0)
  fail('status_metadata_not_private');
 const meta=JSON.parse(fs.readFileSync(metaFile,'utf8'));
 if(meta?.schema!=='evercraft.wing-courier.encrypted-outbox.v1'||
   !/^[a-f0-9]{32}$/.test(meta.id||'')||
   !HEX.test(meta.ciphertextSha256||'')||
   !/^[a-z][a-z0-9-]{1,47}$/.test(meta.fromWing||'')||
   !/^[a-z][a-z0-9-]{1,47}$/.test(meta.toWing||''))
  fail('status_expected_metadata_invalid');
 const base=resolveWingCourierBase(baseUrl),token=keyText(tokenFile);
 const response=await request(base,token,'GET','/v1/envelopes/'+meta.id+'/status');
 const status=await response.json();
 if(status?.schema!=='evercraft.wing-courier.sender-delivery-status.v1'||
   status.id!==meta.id||status.fromWing!==meta.fromWing||
   status.toWing!==meta.toWing||
   status.ciphertextSha256!==meta.ciphertextSha256||
   !['STAGED','READY','ACK_REPORTED_BY_RECEIVER'].includes(status.state)||
   typeof status.receiverSignedCustodyVerified!=='boolean')
  fail('status_identity_or_state_mismatch');
 if(status.receiverSignedCustodyVerified&&
   (status.state!=='ACK_REPORTED_BY_RECEIVER'||!HEX.test(status.receiptSha256||'')))
  fail('status_receipt_binding_invalid');
 if(status.state==='ACK_REPORTED_BY_RECEIVER'&&!status.receiverSignedCustodyVerified)
  fail('status_missing_receiver_signature');
 return {
  schema:'evercraft.wing-courier.sender-status.v1',id:meta.id,
  stage:status.receiverSignedCustodyVerified?'VERIFIED_RECEIVER_ACK_RECORDED':
   status.state==='READY'?'BROKER_STORED_AWAITING_RECEIVER':'BROKER_RESERVATION_ONLY',
  receiptSha256:status.receiverSignedCustodyVerified?status.receiptSha256:null,
  systemiaAdmitted:false,studioProduced:false,customerDeliveryAuthorized:false
 };
}
export async function pushEncryptedWingBundle({baseUrl,tokenFile,metaFile,bundleFile}){
 const cfg=JSON.parse(fs.readFileSync(metaFile,'utf8'));
 if(cfg?.schema!=='evercraft.wing-courier.encrypted-outbox.v1'||!HEX.test(cfg.ciphertextSha256||'')||
 !Number.isSafeInteger(cfg.bytes)||!(/^[a-f0-9]{32}$/).test(cfg.id||''))fail('outbox_meta_invalid');
 const actual=fs.statSync(bundleFile);
 if(!actual.isFile()||actual.size!==cfg.bytes||hashFileSync(bundleFile)!==cfg.ciphertextSha256)fail('outbox_mutated');
 const base=resolveWingCourierBase(baseUrl),token=keyText(tokenFile);
 const req={id:cfg.id,fromWing:cfg.fromWing,toWing:cfg.toWing,
  ciphertextSha256:cfg.ciphertextSha256,bytes:cfg.bytes};
 const begin=await request(base,token,'POST','/v1/envelopes',{json:req});
 const admitted=await begin.json();
 if(admitted.state!=='READY'&&admitted.state!=='ACK_REPORTED_BY_RECEIVER'){
  const upload=await request(base,token,'PUT','/v1/envelopes/'+cfg.id+'/blob',{
   stream:fs.createReadStream(bundleFile),headers:{'content-type':'application/octet-stream'}});
  const ready=await upload.json();if(ready.state!=='READY')fail('remote_upload_not_ready');
 }
 return {schema:'evercraft.wing-courier.push.v1',id:cfg.id,state:'BROKER_CIPHERTEXT_STORED',
  plaintextExposedToBroker:false,receiverAcknowledged:admitted.state==='ACK_REPORTED_BY_RECEIVER',
  studioJobAccepted:false,externalCustomerSendAuthorized:false};
}
// A receiver may have authenticated and persisted the package, then lost the
// connection before the broker acknowledged it. Verify local custody and resume ACK
// rather than downloading or importing the same data twice.
function recoverLocalCustody({root,item,wing}){
 const dir=path.join(root,item.id);
 if(!fs.existsSync(dir))return null;
 const ds=fs.lstatSync(dir);if(!ds.isDirectory()||ds.isSymbolicLink()||(ds.mode&0o077))fail('existing_custody_not_private');
 const receiptFile=path.join(dir,'receipt.json'),st=fs.lstatSync(receiptFile);
 if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077))fail('existing_receipt_not_private');
 const receipt=JSON.parse(fs.readFileSync(receiptFile,'utf8'));
 if(receipt?.schema!=='evercraft.systemia.wing-receive-receipt.v1'||
 receipt?.state!=='AUTHENTICATED_BYTES_RECEIVED'||receipt.id!==item.id||
 receipt.fromWing!==item.fromWing||receipt.toWing!==wing||
 receipt.ciphertextSha256!==item.ciphertextSha256||
 !Array.isArray(receipt.assets)||!receipt.assets.length||receipt.assets.length>256)
  fail('existing_custody_receipt_mismatch');
 const seen=new Set();
 for(const a of receipt.assets){
  const n=a?.filename;
  if(typeof n!=='string'||n!==path.basename(n)||n.includes('\\')||n.includes('/')||
   n.startsWith('.')||seen.has(n.toLowerCase())||!HEX.test(a.sha256||'')||
   !Number.isSafeInteger(a.bytes)||a.bytes<1)fail('existing_asset_identity_invalid');
  seen.add(n.toLowerCase());const file=path.join(dir,n);
  if(fs.lstatSync(file).size!==a.bytes||hashFileSync(file)!==a.sha256)fail('existing_asset_changed');
 }
 if(fs.readdirSync(dir).filter(x=>x!=='receipt.json'&&x!=='intake-offer.json').length!==receipt.assets.length)
  fail('existing_custody_extra_files');
 return {directory:dir,receipt,recovered:true};
}
export async function pollWingInbox({baseUrl,tokenFile,wing,destinationDir,receiverPrivateKeyFile,
 receiverSigningKeyFile,senderVerifyPublicKeys}){
 if(!/^[a-z][a-z0-9-]{1,47}$/.test(wing||''))fail('wing_invalid');
 const base=resolveWingCourierBase(baseUrl),token=keyText(tokenFile);
 const root=path.resolve(destinationDir);const ds=fs.lstatSync(root);
 if(!ds.isDirectory()||ds.isSymbolicLink()||(ds.mode&0o077))fail('destination_not_private');
 const resp=await request(base,token,'GET','/v1/inbox?wing='+encodeURIComponent(wing));
 const list=await resp.json();if(list?.schema!=='evercraft.wing-broker.inbox.v1'||list.wing!==wing||!Array.isArray(list.items))fail('inbox_invalid');
 const results=[];
 for(const item of list.items){
  const id=item?.id;
  if(!/^[a-f0-9]{32}$/.test(id||'')||!HEX.test(item.ciphertextSha256||'')||!Number.isSafeInteger(item.bytes))fail('inbox_item_invalid');
  const signer=senderVerifyPublicKeys?.[item.fromWing];
  if(!signer) {results.push({id,state:'HELD_UNKNOWN_SENDER'});continue;}
  const encrypted=path.join(root,'.inbound-'+id+'.wing');
  let imported;
  try{
   if(!fs.existsSync(path.join(root,id))){
    if(!fs.existsSync(encrypted)){
     const obj=await request(base,token,'GET','/v1/envelopes/'+id+'/blob');
     const outfile=fs.createWriteStream(encrypted,{mode:0o600,flags:'wx'});
     await pipeline(Readable.fromWeb(obj.body),outfile);
    }
    if(fs.statSync(encrypted).size!==item.bytes||hashFileSync(encrypted)!==item.ciphertextSha256)fail('transport_digest_mismatch');
   }
   imported=recoverLocalCustody({root,item,wing}) || openWingBundle({
     encryptedFile:encrypted,destinationDir:root,
     receiverPrivateKeyFile,trustedSenderPublicKeyFile:signer,
     expectedFromWing:item.fromWing,expectedToWing:wing});
   const receiptDigest=sha(Buffer.from(JSON.stringify(imported.receipt)));
   if(!receiverSigningKeyFile)fail('receiver_ack_key_missing');
   const privateKeyStat=fs.lstatSync(receiverSigningKeyFile);
   if(!privateKeyStat.isFile()||privateKeyStat.isSymbolicLink()||
     (privateKeyStat.mode&0o077)!==0)fail('receiver_ack_key_not_private');
   const ackKey=crypto.createPrivateKey(fs.readFileSync(receiverSigningKeyFile));
   if(ackKey.asymmetricKeyType!=='ed25519')fail('receiver_ack_key_invalid');
   const attested={schema:'evercraft.wing-courier.receiver-ack.v1',id:item.id,
     fromWing:item.fromWing,toWing:wing,ciphertextSha256:item.ciphertextSha256,
     receiptSha256:receiptDigest};
   const signature=crypto.sign(null,Buffer.from(JSON.stringify(attested)),ackKey).toString('base64');
   const ack=await request(base,token,'POST','/v1/envelopes/'+id+'/ack',{
    json:{...attested,signature}});
   const response=await ack.json();
   if(response.state!=='ACK_REPORTED_BY_RECEIVER')fail('ack_missing');
   results.push({id,state:'RECEIVED_VERIFIED_AND_ACK_REPORTED',assets:imported.receipt.assets.length,
    systemiaAdmitted:false,customerDeliveryAuthorized:false});
  }catch(err){
   results.push({id,state:'HELD',reason:err?.message||'transfer_failed'});
  }finally{
   if(imported){try{fs.rmSync(encrypted,{force:true})}catch{}}
  }
 }
 return {schema:'evercraft.wing-courier.poll.v1',wing,received:results.filter(x=>x.state==='RECEIVED_VERIFIED_AND_ACK_REPORTED').length,results,
  systemiaAdmitted:false,customerDeliveryAuthorized:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [cmd,...args]=process.argv.slice(2);
 try{
  if(cmd==='keys'){const [dir,wing]=args;console.log(JSON.stringify(generateWingKeys({dir,wing})))}
  else if(cmd==='prepare'){
   const [configFile,sourceDir,output,kind,...names]=args;const cfg=readConfig(configFile);
   const meta=createWingBundle({sourceDir,output,recipientPublicKeyFile:cfg.recipientPublicKeyFile,
    senderSigningKeyFile:cfg.senderSigningKeyFile,fromWing:cfg.fromWing,toWing:cfg.toWing,kind,filenames:names});
   emitJsonPrivate(output+'.json',meta);
   console.log(JSON.stringify({state:meta.state,id:meta.id,assets:meta.assets,encryptedBytes:meta.bytes}));
  }else if(cmd==='push'){
   const [configFile,bundleFile]=args;const cfg=readConfig(configFile);
   console.log(JSON.stringify(await pushEncryptedWingBundle({baseUrl:cfg.baseUrl,tokenFile:cfg.sendTokenFile,
    bundleFile,metaFile:bundleFile+'.json'})));
  }else if(cmd==='status'){
   const [configFile,bundleFile]=args;const cfg=readConfig(configFile);
   console.log(JSON.stringify(await readWingDeliveryStatus({baseUrl:cfg.baseUrl,
    tokenFile:cfg.sendTokenFile,metaFile:bundleFile+'.json'})));
  }else if(cmd==='poll'){
   const [configFile]=args;const cfg=readConfig(configFile);
   console.log(JSON.stringify(await pollWingInbox({baseUrl:cfg.baseUrl,tokenFile:cfg.receiveTokenFile,
    wing:cfg.wing,destinationDir:cfg.destinationDir,receiverPrivateKeyFile:cfg.receiverPrivateKeyFile,
    receiverSigningKeyFile:cfg.receiverSigningKeyFile,senderVerifyPublicKeys:cfg.senderVerifyPublicKeys})));
  }else throw Error('usage: keys <private-dir> <wing> | prepare <private-config> <source-dir> <output.wing> <kind> <filenames...> | push <private-config> <bundle.wing> | status <private-config> <bundle.wing> | poll <private-config>');
 }catch(e){console.error(e?.message||String(e));process.exitCode=2}
}
