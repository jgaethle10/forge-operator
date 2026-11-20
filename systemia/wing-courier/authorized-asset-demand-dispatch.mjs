// Authorized FALLEN -> HARBOR request packet preparation, NOT a production
// file transfer. Customer originals later move in the opposite direction.
// The trusted owner runtime MUST hold Passport's private state and wing keys.
// No GitHub or chat input may supply or mint authority at this boundary.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {EvercraftPassport} from '../passport/passport.mjs';
import {createWingBundle} from './envelope.mjs';
import {readPrivateAssetDemand} from './private-asset-demand.mjs';

export const ASSET_PICKUP_SCOPE='asset.request';
export const ASSET_PICKUP_PRODUCT='evercraft-wing-courier';
export const ASSET_PICKUP_SCHEMA='evercraft.wing-courier.harbor-pickup-preparation.v1';
const HEX=/^[a-f0-9]{64}$/i;
const fail=reason=>{throw Error('wing_asset_dispatch_'+reason)};
const digest=value=>'sha256:'+crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function fingerprintPrivateAssetDemand(request){
 if(!request||typeof request!=='object')fail('request_missing');
 return digest(request);
}

function safePrivateDir(dir){
 if(typeof dir!=='string'||!path.isAbsolute(dir))fail('private_outbox_absolute_required');
 const st=fs.lstatSync(dir);
 if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077)!==0||
   (typeof process.getuid==='function'&&st.uid!==process.getuid()))
  fail('private_outbox_invalid');
 return dir;
}
function requireKey(file,type,expectedFingerprint,privateKey=false){
 if(typeof file!=='string'||!path.isAbsolute(file))fail('key_path_invalid');
 if(!HEX.test(expectedFingerprint||''))fail('key_fingerprint_required');
 const st=fs.lstatSync(file);
 if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||
   (privateKey&&((st.mode&0o077)!==0||
   (typeof process.getuid==='function'&&st.uid!==process.getuid()))))
   fail('key_file_untrusted');
 const raw=fs.readFileSync(file,'utf8');
 if(!privateKey&&!/^-----BEGIN PUBLIC KEY-----\r?\n/.test(raw))
   fail('recipient_public_key_only');
 let key;
 try{key=privateKey?crypto.createPrivateKey(raw):crypto.createPublicKey(raw);}
 catch{fail('key_invalid')}
 if(key.asymmetricKeyType!==type)fail('key_type_invalid');
 const pub=privateKey?crypto.createPublicKey(key):key;
 const observed=crypto.createHash('sha256').update(pub.export({type:'spki',format:'der'})).digest('hex');
 if(observed!==expectedFingerprint.toLowerCase())fail('key_fingerprint_mismatch');
}

// Permission is checked against the REAL owner-local Passport state.
// A single-use permit is consumed before creating the encrypted packet;
// failures require a fresh authorization. This deliberately does not
// transfer or accept any customer source media.
export function prepareAuthorizedHarborPickup({
 requestId,privateQueueDir,passportStateDir,permitId,actorRef,
 outboxDir,recipientPublicKeyFile,recipientPublicKeyFingerprint,
 senderSigningKeyFile,senderSigningKeyFingerprint,
 now=()=>new Date(),
}={}){
 const request=readPrivateAssetDemand({requestId,privateQueueDir});
 const fingerprint=fingerprintPrivateAssetDemand(request);
 if(typeof actorRef!=='string'||!actorRef.startsWith('agent:systemia:')||
    typeof permitId!=='string'||!permitId.startsWith('permit_'))
   fail('systemia_actor_or_permit_required');
 const passport=new EvercraftPassport({stateDir:passportStateDir});
 const check=passport.getActionPermitState(permitId,{at:now().toISOString()});
 if(!check.active||check.actor_ref!==actorRef||
    check.product!==ASSET_PICKUP_PRODUCT||check.scope!==ASSET_PICKUP_SCOPE||
    check.resource_ref!=='asset-demand:'+request.caseRef||
    check.request_fingerprint!==fingerprint)
    fail('passport_permit_denied_or_scope_mismatch');
 const outbox=safePrivateDir(outboxDir);
 if(path.resolve(outbox)===path.resolve(privateQueueDir))fail('outbox_must_be_separate');
 // The keys must be independently enrolled and pinned by the real operator.
 requireKey(recipientPublicKeyFile,'x25519',recipientPublicKeyFingerprint);
 requireKey(senderSigningKeyFile,'ed25519',senderSigningKeyFingerprint,true);
 const output=path.join(outbox,requestId+'.wing');
 for(const name of [output,output+'.json']){
  try{fs.lstatSync(name);fail('outbox_already_exists')}
  catch(e){if(e?.code!=='ENOENT')throw e}
 }
 const consumption=passport.consumeActionPermit({
  permit_id:permitId,actor_ref:actorRef,request_fingerprint:fingerprint,
  idempotency_key:'asset-demand:prepare:'+requestId+':'+permitId,
  evidence_ref:'asset-demand:'+requestId+':attempted-private-preparation',
  consumed_at:now().toISOString()
 });
 if(consumption.state!=='consumed')fail('permit_not_consumed');
 const meta=createWingBundle({
  sourceDir:privateQueueDir,output,recipientPublicKeyFile,
  senderSigningKeyFile,fromWing:'fallen',toWing:'harbor',
  kind:'work_packet',filenames:[requestId+'.json'],
 });
 fs.writeFileSync(output+'.json',JSON.stringify(meta)+'\n',{flag:'wx',mode:0o600});
 return Object.freeze({
  schema:ASSET_PICKUP_SCHEMA,requestId,
  state:'ENCRYPTED_HARBOR_PICKUP_REQUEST_PREPARED',
  encryptedPackageId:meta.id,
  passportPermitConsumed:true,
  senderWing:'fallen',recipientWing:'harbor',
  requestExpectedOriginals:request.expectedAssetCount,
  brokerUploadPerformed:false,harborReceived:false,
  nextgenCustomerAssetsReceived:false,productionAuthorized:false,
  customerSendAuthorized:false,paymentAuthorized:false
 });
}
