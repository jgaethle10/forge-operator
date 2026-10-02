import fs from 'node:fs';
import path from 'node:path';
import { createHash, generateKeyPairSync, randomBytes } from 'node:crypto';

const sha=v=>'sha256:'+createHash('sha256').update(v).digest('hex');
const clean=v=>String(v??'').trim();
function safeId(v){
  const id=clean(v).replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,160);
  if(!id) throw new Error('microseed_identity_device_id_required');
  return id;
}
function atomicWrite(file,content,mode=0o600){
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const tmp=file+'.'+process.pid+'.'+randomBytes(4).toString('hex')+'.tmp';
  fs.writeFileSync(tmp,content,{mode});
  fs.renameSync(tmp,file);
  fs.chmodSync(file,mode);
}
function atomicJson(file,value,mode=0o600){
  atomicWrite(file,JSON.stringify(value,null,2)+'\n',mode);
}
function exportPair(){
  const {publicKey,privateKey}=generateKeyPairSync('ed25519');
  const publicPem=String(publicKey.export({type:'spki',format:'pem'}));
  const privatePem=String(privateKey.export({type:'pkcs8',format:'pem'}));
  return {publicPem,privatePem};
}

export function createMicroSeedDeviceIdentity({
  root,
  device_id,
  rotate=false,
  now=new Date(),
}={}){
  if(!root) throw new Error('microseed_identity_root_required');
  const deviceId=safeId(device_id);
  const base=path.resolve(root);
  const identityFile=path.join(base,'identity.json');
  const privateFile=path.join(base,'current-private.pem');
  const publicFile=path.join(base,'current-public.pem');
  const historyDir=path.join(base,'public-history');
  fs.mkdirSync(base,{recursive:true,mode:0o700});
  fs.mkdirSync(historyDir,{recursive:true,mode:0o700});

  if(!rotate&&fs.existsSync(identityFile)&&fs.existsSync(privateFile)&&fs.existsSync(publicFile)){
    const identity=JSON.parse(fs.readFileSync(identityFile,'utf8'));
    if(identity.device_id!==deviceId) throw new Error('microseed_identity_device_mismatch');
    return {
      ...identity,
      private_key_file:privateFile,
      public_key_file:publicFile,
      private_key_exposed:false,
      created:false,
      rotated:false,
    };
  }

  let previous=null;
  if(fs.existsSync(identityFile)){
    previous=JSON.parse(fs.readFileSync(identityFile,'utf8'));
    if(previous.device_id!==deviceId) throw new Error('microseed_identity_device_mismatch');
    if(fs.existsSync(publicFile)&&previous.key_id){
      const oldPublic=fs.readFileSync(publicFile,'utf8');
      atomicWrite(path.join(historyDir,safeId(previous.key_id)+'.public.pem'),oldPublic,0o600);
    }
  }

  const {publicPem,privatePem}=exportPair();
  const fingerprint=sha(publicPem);
  const keyId='microseed-'+deviceId+'-'+fingerprint.replace(/^sha256:/,'').slice(0,16);
  const at=now instanceof Date?now:new Date(now);
  const identity={
    schema:'evercraft.microseed.device-identity.v1',
    device_id:deviceId,
    algorithm:'Ed25519',
    key_id:keyId,
    public_key_fingerprint:fingerprint,
    created_at:at.toISOString(),
    rotated_from_key_id:previous?.key_id||null,
    private_key_persisted_locally:true,
    private_key_exposed:false,
    attestation_patch:{
      mode:'device',
      receipt_signing_required:true,
      telemetry_signing_required:true,
      receipt_public_key_pem:publicPem,
      receipt_key_id:keyId,
    },
  };

  atomicWrite(privateFile,privatePem,0o600);
  atomicWrite(publicFile,publicPem,0o600);
  atomicJson(identityFile,identity,0o600);

  return {
    ...identity,
    private_key_file:privateFile,
    public_key_file:publicFile,
    private_key_exposed:false,
    created:!previous,
    rotated:Boolean(previous),
  };
}

export function loadMicroSeedDeviceIdentity({root,device_id}={}){
  const base=path.resolve(root||'');
  const identityFile=path.join(base,'identity.json');
  if(!fs.existsSync(identityFile)) throw new Error('microseed_identity_missing');
  const identity=JSON.parse(fs.readFileSync(identityFile,'utf8'));
  if(device_id&&identity.device_id!==safeId(device_id)){
    throw new Error('microseed_identity_device_mismatch');
  }
  const privateFile=path.join(base,'current-private.pem');
  const publicFile=path.join(base,'current-public.pem');
  if(!fs.existsSync(privateFile)||!fs.existsSync(publicFile)){
    throw new Error('microseed_identity_key_material_missing');
  }
  return {
    identity,
    private_key_file:privateFile,
    public_key_file:publicFile,
    private_key:fs.readFileSync(privateFile,'utf8'),
    public_key:fs.readFileSync(publicFile,'utf8'),
  };
}
