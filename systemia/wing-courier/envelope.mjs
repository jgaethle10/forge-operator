// Evercraft Wing Courier: encrypted private files between authorized wings.
// Node >=22. No network, no external service, no publication or execution authority.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';

export const SCHEMA='evercraft.systemia.wing-courier.v1';
const MAX_HEADER=8192,MAX_MANIFEST=128*1024,MAX_FILES=256,MAX_FILE=2*1024**3,MAX_TOTAL=3*1024**3;
const CHUNK=1024*1024,HEX=/^[0-9a-f]{64}$/i,WING=/^[a-z][a-z0-9-]{1,47}$/,ID=/^[a-f0-9]{32}$/;
function fail(code){throw Error('wing_courier_'+code)}
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function exactWrite(fd,b){let off=0;while(off<b.length){const n=fs.writeSync(fd,b,off,b.length-off);if(!n)fail('write_failed');off+=n;}}
function safeName(s){return typeof s==='string' && s.length>0&&s.length<=200&&
  s===path.basename(s)&&s!=='.'&&s!=='..'&&!s.startsWith('.')&&
  !s.includes('/')&&!s.includes('\\')&&!/[\u0000-\u001f\u007f]/.test(s);}
function fileStat(f){const s=fs.lstatSync(f);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1)fail('not_regular_file');return s;}
function ownedDir(dir){if(!path.isAbsolute(dir))fail('absolute_directory_required');const s=fs.lstatSync(dir);if(!s.isDirectory()||s.isSymbolicLink()||(s.mode&0o022))fail('unsafe_directory');}
function loadKey(f){fileStat(f);if((fs.statSync(f).mode&0o077)!==0 && f.endsWith('.key'))fail('private_key_permissions');return crypto.createPrivateKey(fs.readFileSync(f));}
function publicKey(f){fileStat(f);return crypto.createPublicKey(fs.readFileSync(f));}
function keyFile(file,bytes,mode){fs.writeFileSync(file,bytes,{flag:'wx',mode});}
export function generateWingKeys({dir,wing}={}){
 if(!WING.test(wing||''))fail('invalid_wing');
 fs.mkdirSync(dir,{recursive:true,mode:0o700});ownedDir(path.resolve(dir));
 if(fs.readdirSync(dir).length)fail('key_dir_not_empty');
 const x=crypto.generateKeyPairSync('x25519'),s=crypto.generateKeyPairSync('ed25519');
 for(const [name,k,mode] of [
  ['decrypt.key',x.privateKey.export({type:'pkcs8',format:'pem'}),0o600],
  ['decrypt.pub',x.publicKey.export({type:'spki',format:'pem'}),0o644],
  ['sign.key',s.privateKey.export({type:'pkcs8',format:'pem'}),0o600],
  ['sign.pub',s.publicKey.export({type:'spki',format:'pem'}),0o644]
 ])keyFile(path.join(dir,name),k,mode);
 return {schema:SCHEMA,wing,keysCreated:true,privateKeyMaterialReturned:false,publicKeyRegistrationRequired:true};
}
function derive(ephemeral,receiverPublic,salt,id,from,to){
 return Buffer.from(crypto.hkdfSync('sha256',
  crypto.diffieHellman({privateKey:ephemeral,publicKey:receiverPublic}),
  salt,Buffer.from('evercraft.wing-courier.v1:'+id+':'+from+':'+to),32));
}
function encodeHead(payload){
 const b=Buffer.from(JSON.stringify(payload),'utf8');if(b.length>MAX_HEADER)fail('header_too_large');
 const n=Buffer.alloc(4);n.writeUInt32BE(b.length);return Buffer.concat([n,b]);
}
function readHeader(fd){
 const n=Buffer.alloc(4);if(fs.readSync(fd,n,0,4,0)!==4)fail('truncated_header');
 const length=n.readUInt32BE(0);if(length<16||length>MAX_HEADER)fail('header_length');
 const b=Buffer.alloc(length);if(fs.readSync(fd,b,0,length,4)!==length)fail('header_truncated');
 let h;try{h=JSON.parse(b.toString('utf8'))}catch{fail('bad_header_json')}
 if(h.schema!==SCHEMA||!ID.test(h.id||'')||!WING.test(h.fromWing||'')||
 !WING.test(h.toWing||'')||h.format!=='x25519-aes256gcm-ed25519-v1'||
 typeof h.ephemeralPub!=='string'||typeof h.salt!=='string'||typeof h.nonce!=='string')fail('header_schema');
 const salt=Buffer.from(h.salt,'base64'),nonce=Buffer.from(h.nonce,'base64');
 if(salt.length!==16||nonce.length!==12)fail('header_nonce_salt');
 return {h,header:Buffer.concat([n,b]),length:4+length,salt,nonce};
}
function manifestCheck(m){
 if(m?.schema!=='evercraft.wing-courier.payload.v1'||
 !Array.isArray(m.assets)||!m.assets.length||m.assets.length>MAX_FILES||
 typeof m.kind!=='string'||!['media','work_packet','document','evidence','result'].includes(m.kind))fail('manifest_schema');
 const names=new Set();let bytes=0;
 for(const a of m.assets){
  if(!safeName(a.filename)||names.has(a.filename.toLowerCase())||
    !Number.isSafeInteger(a.bytes)||a.bytes<1||a.bytes>MAX_FILE||!HEX.test(a.sha256||''))fail('manifest_asset');
  names.add(a.filename.toLowerCase());bytes+=a.bytes;
  if(bytes>MAX_TOTAL)fail('total_too_large');
 }
 return bytes;
}
export function createWingBundle({sourceDir,output,recipientPublicKeyFile,senderSigningKeyFile,
 fromWing,toWing,kind='media',filenames,id=crypto.randomBytes(16).toString('hex')}={}){
 if(!WING.test(fromWing||'')||!WING.test(toWing||'')||fromWing===toWing||!ID.test(id))fail('routing_invalid');
 ownedDir(path.resolve(sourceDir));if(!Array.isArray(filenames)||!filenames.length||filenames.length>MAX_FILES)fail('files_count');
 if(fs.existsSync(output))fail('output_exists');
 const target=path.resolve(output),sourceRoot=path.resolve(sourceDir);
 if(target.startsWith(sourceRoot+path.sep))fail('output_inside_source');
 const assets=filenames.map(filename=>{
  if(!safeName(filename))fail('source_name_invalid');
  const file=path.join(sourceRoot,filename),st=fileStat(file);
  const digest=crypto.createHash('sha256'),fd=fs.openSync(file,'r');
  try{const buf=Buffer.allocUnsafe(CHUNK);let n;while((n=fs.readSync(fd,buf,0,CHUNK,null))>0)digest.update(buf.subarray(0,n));}
  finally{fs.closeSync(fd)}
  return {filename,bytes:st.size,sha256:digest.digest('hex')};
 });
 const m={schema:'evercraft.wing-courier.payload.v1',kind,assets,
   executionAuthorityGranted:false,publicationAuthorityGranted:false,customerDeliveryAuthorityGranted:false};
 manifestCheck(m);
 const data=Buffer.from(JSON.stringify(m),'utf8');if(data.length>MAX_MANIFEST)fail('manifest_too_large');
 const prefix=Buffer.alloc(4);prefix.writeUInt32BE(data.length);
 const eph=crypto.generateKeyPairSync('x25519');
 const salt=crypto.randomBytes(16),nonce=crypto.randomBytes(12);
 const rec=publicKey(recipientPublicKeyFile),signer=loadKey(senderSigningKeyFile);
 if(rec.asymmetricKeyType!=='x25519'||signer.asymmetricKeyType!=='ed25519')fail('keys_invalid');
 const key=derive(eph.privateKey,rec,salt,id,fromWing,toWing);
 const h=encodeHead({schema:SCHEMA,format:'x25519-aes256gcm-ed25519-v1',
  id,fromWing,toWing,ephemeralPub:eph.publicKey.export({type:'spki',format:'der'}).toString('base64'),
  salt:salt.toString('base64'),nonce:nonce.toString('base64')});
 const cipher=crypto.createCipheriv('aes-256-gcm',key,nonce);cipher.setAAD(h);
 const stamp=crypto.createHash('sha256');let fd;
 const temp=target+'.pending-'+crypto.randomBytes(8).toString('hex');
 try{
  fd=fs.openSync(temp,'wx',0o600);
  const emit=b=>{exactWrite(fd,b);stamp.update(b)};
  emit(h);
  emit(cipher.update(prefix));emit(cipher.update(data));
  for(const a of assets){
   const f=fs.openSync(path.join(sourceRoot,a.filename),'r'),check=crypto.createHash('sha256');
   try{const buf=Buffer.allocUnsafe(CHUNK);let read=0,n;
    while((n=fs.readSync(f,buf,0,CHUNK,null))>0){
     read+=n;if(read>a.bytes)fail('source_changed');
     const part=buf.subarray(0,n);check.update(part);emit(cipher.update(part));
    }
    if(read!==a.bytes||check.digest('hex')!==a.sha256)fail('source_changed');
   }finally{fs.closeSync(f)}
  }
  emit(cipher.final());emit(cipher.getAuthTag());
  const signedDigest=stamp.digest(),signature=crypto.sign(null,signedDigest,signer);
  if(signature.length!==64)fail('signature_size');
  exactWrite(fd,signature);fs.fsyncSync(fd);fs.closeSync(fd);fd=null;
  fs.renameSync(temp,target);
  return {schema:'evercraft.wing-courier.encrypted-outbox.v1',id,fromWing,toWing,
   ciphertextSha256:hashFileSync(target),bytes:fs.statSync(target).size,assets:assets.length,
   state:'ENCRYPTED_READY_TO_TRANSPORT',deliveryAuthorityGranted:false};
 }catch(e){try{fs.rmSync(temp,{force:true})}catch{}throw e}
 finally{key.fill(0);if(fd!==undefined&&fd!==null)fs.closeSync(fd)}
}
export function hashFileSync(f){
 fileStat(f);const fd=fs.openSync(f,'r'),hash=crypto.createHash('sha256'),buf=Buffer.allocUnsafe(CHUNK);
 try{let n;while((n=fs.readSync(fd,buf,0,CHUNK,null))>0)hash.update(buf.subarray(0,n))}
 finally{fs.closeSync(fd)}return hash.digest('hex');
}
export function openWingBundle({encryptedFile,destinationDir,receiverPrivateKeyFile,trustedSenderPublicKeyFile,
 expectedFromWing,expectedToWing}={}){
 fileStat(encryptedFile);
 const len=fs.statSync(encryptedFile).size;
 if(len<4+20+16+64||len>MAX_TOTAL+MAX_MANIFEST+65536)fail('envelope_size');
 if(!WING.test(expectedFromWing||'')||!WING.test(expectedToWing||''))fail('expected_routing_required');
 ownedDir(path.resolve(destinationDir));
 const fd=fs.openSync(encryptedFile,'r');
 let stage,writer=null;
 try{
  const {h,header,length:headLen,salt,nonce}=readHeader(fd);
  if(h.fromWing!==expectedFromWing||h.toWing!==expectedToWing)fail('wrong_sender_or_receiver');
  const signer=publicKey(trustedSenderPublicKeyFile),receiver=loadKey(receiverPrivateKeyFile);
  if(signer.asymmetricKeyType!=='ed25519'||receiver.asymmetricKeyType!=='x25519')fail('keys_invalid');
  const sig=Buffer.alloc(64),tag=Buffer.alloc(16);
  if(fs.readSync(fd,sig,0,64,len-64)!==64||fs.readSync(fd,tag,0,16,len-80)!==16)fail('trailer_truncated');
  const stamp=crypto.createHash('sha256'),buf=Buffer.allocUnsafe(CHUNK);
  let pos=0;
  while(pos<len-64){
   const n=fs.readSync(fd,buf,0,Math.min(CHUNK,len-64-pos),pos);if(n<1)fail('truncated_cypher');
   stamp.update(buf.subarray(0,n));pos+=n;
  }
  if(!crypto.verify(null,stamp.digest(),signer,sig))fail('sender_signature_invalid');
  const ephemeral=crypto.createPublicKey({key:Buffer.from(h.ephemeralPub,'base64'),format:'der',type:'spki'});
  if(ephemeral.asymmetricKeyType!=='x25519')fail('ephemeral_key_invalid');
  const key=derive(receiver,ephemeral,salt,h.id,h.fromWing,h.toWing);
  const decipher=crypto.createDecipheriv('aes-256-gcm',key,nonce);decipher.setAAD(header);decipher.setAuthTag(tag);
  stage=path.join(destinationDir,'.wing-stage-'+h.id+'-'+crypto.randomBytes(8).toString('hex'));
  fs.mkdirSync(stage,{mode:0o700});const stageStat=fs.lstatSync(stage);
  if(!stageStat.isDirectory()||stageStat.isSymbolicLink())fail('stage_invalid');
  let prefix=Buffer.alloc(0),meta=Buffer.alloc(0),mlen=null,m=null,assetIx=0,remaining=0,assetHash=null;
  const fileOut=[];
  function ingest(chunk){
   let off=0;
   while(off<chunk.length){
    if(mlen===null){
     const take=Math.min(4-prefix.length,chunk.length-off);
     prefix=Buffer.concat([prefix,chunk.subarray(off,off+take)]);off+=take;
     if(prefix.length===4){mlen=prefix.readUInt32BE();if(mlen<2||mlen>MAX_MANIFEST)fail('payload_manifest_size');}
     continue;
    }
    if(m===null){
     const take=Math.min(mlen-meta.length,chunk.length-off);
     meta=Buffer.concat([meta,chunk.subarray(off,off+take)]);off+=take;
     if(meta.length===mlen){
      try{m=JSON.parse(meta.toString('utf8'))}catch{fail('bad_payload_manifest')}
      manifestCheck(m);
      remaining=m.assets[0].bytes;assetHash=crypto.createHash('sha256');
      writer=fs.openSync(path.join(stage,m.assets[0].filename),'wx',0o600);
     }
     continue;
    }
    if(assetIx>=m.assets.length)fail('payload_excess_bytes');
    const take=Math.min(remaining,chunk.length-off);
    const part=chunk.subarray(off,off+take);
    exactWrite(writer,part);assetHash.update(part);remaining-=take;off+=take;
    if(remaining===0){
     fs.fsyncSync(writer);fs.closeSync(writer);writer=null;
     if(assetHash.digest('hex')!==m.assets[assetIx].sha256)fail('source_hash_mismatch');
     fileOut.push({filename:m.assets[assetIx].filename,sha256:m.assets[assetIx].sha256,bytes:m.assets[assetIx].bytes});
     assetIx++;
     if(assetIx<m.assets.length){
      remaining=m.assets[assetIx].bytes;assetHash=crypto.createHash('sha256');
      writer=fs.openSync(path.join(stage,m.assets[assetIx].filename),'wx',0o600);
     }
    }
   }
  }
  pos=headLen;
  while(pos<len-80){
   const n=fs.readSync(fd,buf,0,Math.min(CHUNK,len-80-pos),pos);if(n<1)fail('truncated_ciphertext');
   ingest(decipher.update(buf.subarray(0,n)));pos+=n;
  }
  ingest(decipher.final());key.fill(0);
  if(!m||assetIx!==m.assets.length||writer!==null)fail('payload_incomplete');
  const receipt={schema:'evercraft.systemia.wing-receive-receipt.v1',
   id:h.id,fromWing:h.fromWing,toWing:h.toWing,kind:m.kind,assets:fileOut,
   ciphertextSha256:hashFileSync(encryptedFile),receivedAt:new Date().toISOString(),receiverHostname:os.hostname(),
   state:'AUTHENTICATED_BYTES_RECEIVED',privateCustodyVerified:true,
   authority:{execution:false,systemiaAdmission:false,production:false,payment:false,customerDelivery:false,publication:false}};
  fs.writeFileSync(path.join(stage,'receipt.json'),JSON.stringify(receipt,null,2)+'\n',{mode:0o600,flag:'wx'});
  const final=path.join(destinationDir,h.id);
  if(fs.existsSync(final))fail('duplicate_import');
  fs.renameSync(stage,final);stage=null;
  return {receipt,directory:final};
 }catch(e){
  if(writer!==null)try{fs.closeSync(writer)}catch{}
  if(stage)try{fs.rmSync(stage,{recursive:true,force:true})}catch{}
  throw e;
 }finally{fs.closeSync(fd)}
}
